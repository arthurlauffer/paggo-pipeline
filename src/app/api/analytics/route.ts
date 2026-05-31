import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { STAGE_WEIGHTS } from '@/lib/types'
import type { Stage } from '@/lib/types'

export const dynamic = 'force-dynamic'

const STAGE_LIST = ['LEAD', 'QUALIFIED', 'DISCOVERY', 'DEMO', 'PROPOSAL', 'NEGOTIATION']
const SEGMENTS   = ['SMB', 'MID', 'ENT']

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams

  const stage          = sp.get('stage')
  const ownerName      = sp.get('ownerName')
  const accountSegment = sp.get('accountSegment')
  const industry       = sp.get('industry')
  const riskLevel      = sp.get('riskLevel')
  const search         = sp.get('search')
  const includesClosed = sp.get('includesClosed') === 'true'

  // Build parameterized WHERE clause (table alias "d" for deals)
  const cond: string[]  = []
  const values: unknown[] = []

  if (!includesClosed) cond.push("d.stage NOT IN ('CLOSED_WON','CLOSED_LOST')")
  if (stage)          { values.push(stage);          cond.push(`d.stage = $${values.length}`) }
  if (ownerName)      { values.push(ownerName);      cond.push(`d."ownerName" = $${values.length}`) }
  if (accountSegment) { values.push(accountSegment); cond.push(`d."accountSegment" = $${values.length}`) }
  if (industry)       { values.push(industry);       cond.push(`d.industry = $${values.length}`) }
  if (riskLevel)      { values.push(riskLevel);      cond.push(`d."riskLevel" = $${values.length}`) }
  if (search) {
    values.push(`%${search}%`)
    const i = values.length
    cond.push(`(d."accountName" ILIKE $${i} OR d."ownerName" ILIKE $${i})`)
  }

  const where    = cond.length ? `WHERE ${cond.join(' AND ')}` : ''
  const actCond  = [...cond, `a."isNextStep" = 0`]
  const actWhere = `WHERE ${actCond.join(' AND ')}`

  // All filtered deals (in-memory aggregation)
  const deals = await query(`SELECT * FROM deals d ${where}`, values) as any[]

  const totalOpenValue = deals.reduce((s, d) => s + d.amount, 0)
  const weightedValue  = deals.reduce((s, d) => s + d.amount * (STAGE_WEIGHTS[d.stage as Stage] || 0), 0)
  const highRiskCount  = deals.filter(d => d.riskLevel === 'HIGH').length
  const avgDealSize    = deals.length ? totalOpenValue / deals.length : 0

  const [closedAllRows, allDealsRows, activityByType, trendRows, ownerActRows] = await Promise.all([
    query<{ stage: string }>(`SELECT stage FROM deals WHERE stage IN ('CLOSED_WON','CLOSED_LOST')`),
    query<{ accountSegment: string; stage: string }>(`SELECT "accountSegment", stage FROM deals`),
    query<{ type: string; count: string }>(
      `SELECT a.type, COUNT(*) as count FROM activities a JOIN deals d ON a."dealId" = d."dealId" ${actWhere} GROUP BY a.type`,
      values
    ),
    (() => {
      const eightWeeksAgo = new Date(Date.now() - 8 * 7 * 86_400_000).toISOString()
      const trendValues   = [...values, eightWeeksAgo]
      const trendConds    = [...actCond, `a."activityAt" >= $${trendValues.length}`]
      return query<{ day: string; count: string }>(
        `SELECT a."activityAt"::date as day, COUNT(*) as count FROM activities a JOIN deals d ON a."dealId" = d."dealId" WHERE ${trendConds.join(' AND ')} GROUP BY day ORDER BY day ASC`,
        trendValues
      )
    })(),
    query<{ owner: string; activities: string; nextSteps: string }>(
      `SELECT d."ownerName" as owner, SUM(CASE WHEN a."isCompleted"=1 THEN 1 ELSE 0 END) as activities, SUM(CASE WHEN a."isNextStep"=1 AND a."isCompleted"=0 THEN 1 ELSE 0 END) as "nextSteps" FROM activities a JOIN deals d ON a."dealId" = d."dealId" ${where} GROUP BY d."ownerName"`,
      values
    ),
  ])

  const wonAll  = closedAllRows.filter(d => d.stage === 'CLOSED_WON').length
  const winRate = closedAllRows.length ? wonAll / closedAllRows.length : 0

  const byStage = STAGE_LIST.map(s => {
    const g = deals.filter(d => d.stage === s)
    return { stage: s, count: g.length, value: g.reduce((sum, d) => sum + d.amount, 0) }
  })

  const bySegment = SEGMENTS.map(seg => {
    const open   = deals.filter(d => d.accountSegment === seg)
    const closed = allDealsRows.filter(d => d.accountSegment === seg && (d.stage === 'CLOSED_WON' || d.stage === 'CLOSED_LOST'))
    const won    = closed.filter(d => d.stage === 'CLOSED_WON')
    return { segment: seg, count: open.length, value: open.reduce((s, d) => s + d.amount, 0), winRate: closed.length ? won.length / closed.length : 0 }
  })

  const riskDistribution = (['HIGH', 'MEDIUM', 'LOW'] as const).map(level => ({
    level, count: deals.filter(d => d.riskLevel === level).length,
  }))

  const ownerDealMap = new Map<string, { deals: number; value: number; highRisk: number; weighted: number }>()
  for (const d of deals) {
    const cur = ownerDealMap.get(d.ownerName) || { deals: 0, value: 0, highRisk: 0, weighted: 0 }
    cur.deals++; cur.value += d.amount; cur.weighted += d.amount * (STAGE_WEIGHTS[d.stage as Stage] || 0)
    if (d.riskLevel === 'HIGH') cur.highRisk++
    ownerDealMap.set(d.ownerName, cur)
  }
  const ownerActMap = new Map(ownerActRows.map(r => [r.owner, r]))
  const byOwner = [...ownerDealMap.entries()]
    .map(([owner, v]) => ({
      owner, deals: v.deals, value: v.value, weighted: v.weighted, highRisk: v.highRisk,
      activities: Number(ownerActMap.get(owner)?.activities ?? 0),
      nextSteps:  Number(ownerActMap.get(owner)?.nextSteps  ?? 0),
    }))
    .sort((a, b) => b.value - a.value)

  return NextResponse.json({
    kpis: { totalOpenValue, weightedValue, totalOpenDeals: deals.length, highRiskCount, avgDealSize, winRate },
    byStage, bySegment, riskDistribution, byOwner,
    activityByType: activityByType.map(r => ({ ...r, count: Number(r.count) })),
    activityTrend:  trendRows.map(r => ({ ...r, count: Number(r.count) })),
  })
}
