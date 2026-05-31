import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { STAGE_WEIGHTS } from '@/lib/types'
import type { Stage } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  const splitParam = (v: string | null): string[] =>
    (v ?? '').split(',').map(s => s.trim()).filter(Boolean)

  const stages         = splitParam(searchParams.get('stage'))
  const ownerNames     = splitParam(searchParams.get('ownerName'))
  const segments_f     = splitParam(searchParams.get('accountSegment'))
  const industry       = searchParams.get('industry')
  const riskLevels     = splitParam(searchParams.get('riskLevel'))
  const search         = searchParams.get('search')
  const includesClosed = searchParams.get('includesClosed') === 'true'

  const conditions: string[] = []
  const values: unknown[] = []

  const inClause = (col: string, list: string[]) => {
    if (!list.length) return
    const placeholders = list.map(v => { values.push(v); return `$${values.length}` })
    conditions.push(`${col} IN (${placeholders.join(', ')})`)
  }

  if (!includesClosed) conditions.push("stage NOT IN ('CLOSED_WON', 'CLOSED_LOST')")
  inClause('stage',            stages)
  inClause('"ownerName"',      ownerNames)
  inClause('"accountSegment"', segments_f)
  inClause('"riskLevel"',      riskLevels)
  if (industry)       { values.push(industry);       conditions.push(`industry = $${values.length}`) }
  if (search) {
    values.push(`%${search}%`)
    const i = values.length
    conditions.push(`("accountName" ILIKE $${i} OR "ownerName" ILIKE $${i})`)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const filteredDeals = await query(`SELECT * FROM deals ${where}`, values) as any[]

  const totalOpenValue  = filteredDeals.reduce((s, d) => s + d.amount, 0)
  const weightedValue   = filteredDeals.reduce((s, d) => s + d.amount * (STAGE_WEIGHTS[d.stage as Stage] || 0), 0)
  const highRiskCount   = filteredDeals.filter(d => d.riskLevel === 'HIGH').length
  const mediumRiskCount = filteredDeals.filter(d => d.riskLevel === 'MEDIUM').length

  const now           = new Date()
  const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const overdueCount          = filteredDeals.filter(d => new Date(d.expectedCloseDate) < now).length
  const closingThisMonthCount = filteredDeals.filter(d => {
    const dt = new Date(d.expectedCloseDate)
    return dt >= now && dt <= thirtyDaysOut
  }).length

  const stageList = ['LEAD', 'QUALIFIED', 'DISCOVERY', 'DEMO', 'PROPOSAL', 'NEGOTIATION']
  const byStage = stageList.map(s => {
    const group = filteredDeals.filter(d => d.stage === s)
    return { stage: s, count: group.length, value: group.reduce((sum, d) => sum + d.amount, 0) }
  })

  const ownerMap = new Map<string, { count: number; value: number; highRisk: number }>()
  for (const d of filteredDeals) {
    const cur = ownerMap.get(d.ownerName) || { count: 0, value: 0, highRisk: 0 }
    cur.count++; cur.value += d.amount
    if (d.riskLevel === 'HIGH') cur.highRisk++
    ownerMap.set(d.ownerName, cur)
  }
  const byOwner = [...ownerMap.entries()]
    .map(([owner, v]) => ({ owner, ...v }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 15)

  const allDeals  = await query(`SELECT * FROM deals`) as any[]
  const segments  = ['SMB', 'MID', 'ENT']
  const bySegment = segments.map(seg => {
    const segDeals = allDeals.filter(d => d.accountSegment === seg)
    const closed   = segDeals.filter(d => d.stage === 'CLOSED_WON' || d.stage === 'CLOSED_LOST')
    const won      = segDeals.filter(d => d.stage === 'CLOSED_WON')
    const open     = filteredDeals.filter(d => d.accountSegment === seg)
    return { segment: seg, count: open.length, value: open.reduce((s, d) => s + d.amount, 0), winRate: closed.length > 0 ? won.length / closed.length : 0 }
  })

  const riskDistribution = (['HIGH', 'MEDIUM', 'LOW'] as const).map(level => ({
    level, count: filteredDeals.filter(d => d.riskLevel === level).length,
  }))

  return NextResponse.json({ totalOpenValue, weightedValue, totalOpenDeals: filteredDeals.length, highRiskCount, mediumRiskCount, overdueCount, closingThisMonthCount, byStage, byOwner, bySegment, riskDistribution })
}
