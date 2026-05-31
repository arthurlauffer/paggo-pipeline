import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { getCalendarClient, isConnected } from '@/lib/google-calendar'

export const dynamic = 'force-dynamic'

const PERSONAL_PROVIDERS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'live.com', 'icloud.com', 'me.com', 'msn.com', 'aol.com', 'protonmail.com',
])

export async function GET(req: NextRequest) {
  const ownerName = req.nextUrl.searchParams.get('ownerName')

  const owners = (await query<{ ownerName: string; openDeals: string }>(`
    SELECT "ownerName",
      COUNT(*) FILTER (WHERE stage NOT IN ('CLOSED_WON','CLOSED_LOST')) as "openDeals"
    FROM deals
    GROUP BY "ownerName"
    ORDER BY "openDeals" DESC
  `)).map(o => ({ name: o.ownerName, openDeals: Number(o.openDeals) }))

  if (!ownerName) {
    return NextResponse.json({ owners, checklist: null })
  }

  const now       = new Date()
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999)
  const weekEnd    = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const nextSteps = await query(`
    SELECT a.*, d."accountName", d."accountSegment", d.stage, d.amount, d."riskLevel", d."riskScore"
    FROM activities a
    JOIN deals d ON a."dealId" = d."dealId"
    WHERE d."ownerName" = $1
      AND a."isNextStep" = 1
      AND a."isCompleted" = 0
    ORDER BY a."dueAt" ASC NULLS LAST
  `, [ownerName]) as any[]

  const overdue: any[] = [], today: any[] = [], week: any[] = [], later: any[] = []
  nextSteps.forEach(ns => {
    if (!ns.dueAt) { later.push(ns); return }
    const d = new Date(ns.dueAt)
    if (d < todayStart)         overdue.push(ns)
    else if (d <= todayEnd)     today.push(ns)
    else if (d <= weekEnd)      week.push(ns)
    else                        later.push(ns)
  })

  const highRisk = await query(`
    SELECT "dealId","accountName","accountSegment",stage,amount,"riskScore","riskLevel",
           "riskFlags","lastActivityAt","daysInCurrentStage","expectedCloseDate"
    FROM deals
    WHERE "ownerName" = $1
      AND stage NOT IN ('CLOSED_WON','CLOSED_LOST')
      AND "riskLevel" = 'HIGH'
    ORDER BY "riskScore" DESC
    LIMIT 10
  `, [ownerName]) as any[]

  let calendarMeetings: any[] = []
  try {
    if (await isConnected()) {
      const calendar = await getCalendarClient()
      const calRes   = await calendar.events.list({ calendarId: 'primary', timeMin: now.toISOString(), timeMax: weekEnd.toISOString(), singleEvents: true, orderBy: 'startTime', maxResults: 20 })
      const items    = calRes.data.items ?? []
      const eventIds = items.map(e => e.id).filter(Boolean) as string[]

      if (eventIds.length) {
        const linked = await query(`
          SELECT l.event_id, l.deal_id, d."accountName", d.stage, d."ownerName"
          FROM calendar_event_links l
          JOIN deals d ON l.deal_id = d."dealId"
          WHERE l.event_id = ANY($1) AND d."ownerName" = $2
        `, [eventIds, ownerName]) as any[]

        const linkedMap: Record<string, any> = {}
        linked.forEach(l => { linkedMap[l.event_id] = l })

        calendarMeetings = items
          .filter(e => linkedMap[e.id!])
          .map(e => {
            const link = linkedMap[e.id!]
            const attendees = (e.attendees ?? []).map((a: any) => ({
              name: a.displayName || a.email?.split('@')[0] || '', email: a.email ?? '', self: !!a.self, responseStatus: a.responseStatus ?? 'needsAction',
            }))
            return {
              eventId: e.id, title: e.summary || '(sem título)', start: e.start?.dateTime || e.start?.date || null,
              end: e.end?.dateTime || e.end?.date || null, meetLink: e.hangoutLink || null, location: e.location || null,
              attendees: attendees.filter((a: any) => !PERSONAL_PROVIDERS.has(a.email.split('@')[1] ?? '')),
              dealId: link.deal_id, accountName: link.accountName, stage: link.stage,
            }
          })
      }
    }
  } catch { /* calendar not available */ }

  const completedThisWeek = await query(`
    SELECT a.type, a.notes, a."activityAt", d."accountName", d."dealId"
    FROM activities a
    JOIN deals d ON a."dealId" = d."dealId"
    WHERE d."ownerName" = $1
      AND a."isCompleted" = 1
      AND a."isNextStep" = 0
      AND a."activityAt" >= $2
    ORDER BY a."activityAt" DESC
    LIMIT 20
  `, [ownerName, todayStart.toISOString()]) as any[]

  return NextResponse.json({
    owners, ownerName,
    checklist: {
      overdue, today, week, later, calendarMeetings, highRisk, completedThisWeek,
      stats: { overdueCount: overdue.length, todayCount: today.length, weekCount: week.length, highRiskCount: highRisk.length, meetingsCount: calendarMeetings.length },
    },
  })
}
