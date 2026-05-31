import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const now     = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [closedWon, closedLost] = await Promise.all([
    query(`SELECT "dealId", "accountName", "ownerName", "accountSegment", amount, "updatedAt" FROM deals WHERE stage = 'CLOSED_WON' AND "updatedAt" >= $1 ORDER BY "updatedAt" DESC LIMIT 10`, [weekAgo]),
    query(`SELECT "dealId", "accountName", "ownerName", "accountSegment", amount, "updatedAt" FROM deals WHERE stage = 'CLOSED_LOST' AND "updatedAt" >= $1 ORDER BY "updatedAt" DESC LIMIT 10`, [weekAgo]),
  ])

  const wonValueThisWeek  = (closedWon  as any[]).reduce((s, d) => s + d.amount, 0)
  const lostValueThisWeek = (closedLost as any[]).reduce((s, d) => s + d.amount, 0)

  const [actCountRow, activitiesByType, newDealsRow, ownerRows, highRiskDeals, recentStageChanges, openStats] = await Promise.all([
    queryOne<{ c: string }>(`SELECT COUNT(*) as c FROM activities WHERE "activityAt" >= $1`, [weekAgo]),
    query<{ type: string; c: number }>(`SELECT type, COUNT(*) as c FROM activities WHERE "activityAt" >= $1 GROUP BY type ORDER BY c DESC`, [weekAgo]),
    queryOne<{ c: string; v: number }>(`SELECT COUNT(*) as c, SUM(amount) as v FROM deals WHERE "createdAt" >= $1`, [weekAgo]),
    query(`SELECT "ownerName", COUNT(*) as "dealCount", SUM(amount) as "totalValue", SUM(CASE WHEN "riskLevel"='HIGH' THEN 1 ELSE 0 END) as "highRisk" FROM deals WHERE stage NOT IN ('CLOSED_WON','CLOSED_LOST') GROUP BY "ownerName" ORDER BY "totalValue" DESC LIMIT 8`),
    query(`SELECT "dealId","accountName","ownerName","accountSegment",stage,amount,"riskScore","riskLevel","riskFlags","lastActivityAt","daysInCurrentStage","expectedCloseDate" FROM deals WHERE "riskLevel"='HIGH' AND stage NOT IN ('CLOSED_WON','CLOSED_LOST') ORDER BY "riskScore" DESC LIMIT 6`),
    query(`SELECT a."dealId", d."accountName", a."oldValue" as "fromStage", a."newValue" as "toStage", a."performedBy", a."originatedBy", a."createdAt" FROM audit_log a LEFT JOIN deals d ON d."dealId" = a."dealId" WHERE a.action = 'STAGE_CHANGE' AND a."createdAt" >= $1 ORDER BY a."createdAt" DESC LIMIT 8`, [weekAgo]).catch(() => []),
    queryOne<{ openCount: string; openValue: number; highRisk: string; overdue: string }>(`SELECT COUNT(*) as "openCount", SUM(amount) as "openValue", SUM(CASE WHEN "riskLevel"='HIGH' THEN 1 ELSE 0 END) as "highRisk", SUM(CASE WHEN "expectedCloseDate" < $1 THEN 1 ELSE 0 END) as overdue FROM deals WHERE stage NOT IN ('CLOSED_WON','CLOSED_LOST')`, [now.toISOString()]),
  ])

  return NextResponse.json({
    closedWon, closedLost, wonValueThisWeek, lostValueThisWeek,
    activitiesThisWeek: Number(actCountRow?.c ?? 0),
    activitiesByType,
    newDealsThisWeek: Number(newDealsRow?.c ?? 0),
    newDealsValue:    Number(newDealsRow?.v ?? 0),
    topOwners: ownerRows,
    highRiskDeals,
    recentStageChanges,
    openCount: Number(openStats?.openCount ?? 0),
    openValue: Number(openStats?.openValue ?? 0),
    highRisk:  Number(openStats?.highRisk  ?? 0),
    overdue:   Number(openStats?.overdue   ?? 0),
  })
}
