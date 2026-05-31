import { NextResponse } from 'next/server'
import { getCalendarClient, isConnected } from '@/lib/google-calendar'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

const PERSONAL_PROVIDERS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.com.br',
  'hotmail.com', 'hotmail.com.br', 'outlook.com', 'live.com',
  'icloud.com', 'me.com', 'msn.com', 'aol.com', 'protonmail.com',
  'uol.com.br', 'bol.com.br', 'terra.com.br',
])

function domainHint(domain: string): string {
  return domain
    .replace(/\.(com\.br|com|net|org|io|co|br|gov|edu|me)$/i, '')
    .replace(/[-_.]/g, ' ').trim()
}

export async function GET() {
  if (!await isConnected()) {
    return NextResponse.json({ connected: false, events: [] })
  }

  try {
    const calendar = await getCalendarClient()

    const now         = new Date()
    const twoWeeksOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

    const res = await calendar.events.list({
      calendarId: 'primary', timeMin: now.toISOString(), timeMax: twoWeeksOut.toISOString(),
      singleEvents: true, orderBy: 'startTime', maxResults: 25,
    })

    const items    = res.data.items ?? []
    const eventIds = items.map(e => e.id).filter(Boolean) as string[]

    const links: { event_id: string; deal_id: string; accountName: string }[] = eventIds.length
      ? await query(`
          SELECT l.event_id, l.deal_id, d."accountName"
          FROM calendar_event_links l
          LEFT JOIN deals d ON l.deal_id = d."dealId"
          WHERE l.event_id = ANY($1)
        `, [eventIds])
      : []

    const linkMap: Record<string, { dealId: string; dealName: string }> = {}
    links.forEach(l => { linkMap[l.event_id] = { dealId: l.deal_id, dealName: l.accountName } })

    const events = await Promise.all(items.map(async e => {
      const rawAttendees = e.attendees ?? []
      const attendees = rawAttendees.map(a => ({
        email: a.email ?? '', name: a.displayName || a.email?.split('@')[0] || '',
        responseStatus: a.responseStatus ?? 'needsAction', organizer: !!a.organizer, self: !!a.self,
      }))

      const seenDomains = new Set<string>()
      const corporateDomains: string[] = []
      attendees.forEach(a => {
        const domain = a.email.split('@')[1]
        if (domain && !PERSONAL_PROVIDERS.has(domain) && !seenDomains.has(domain)) {
          seenDomains.add(domain); corporateDomains.push(domain)
        }
      })

      const companyDomains = await Promise.all(corporateDomains.map(async domain => {
        const hint  = domainHint(domain)
        const words = hint.split(' ').filter(w => w.length >= 3)
        let deals: { dealId: string; accountName: string; stage: string; ownerName: string }[] = []
        for (const word of words) {
          const rows = await query<{ dealId: string; accountName: string; stage: string; ownerName: string }>(`
            SELECT "dealId", "accountName", stage, "ownerName"
            FROM deals
            WHERE stage NOT IN ('CLOSED_WON','CLOSED_LOST')
              AND lower("accountName") LIKE lower($1)
            LIMIT 3
          `, [`%${word}%`])
          deals = [...deals, ...rows.filter(r => !deals.some(d => d.dealId === r.dealId))]
          if (deals.length >= 3) break
        }
        return { domain, hint, deals: deals.slice(0, 3) }
      }))

      return {
        id: e.id, title: e.summary || '(sem título)',
        start: e.start?.dateTime || e.start?.date || null,
        end: e.end?.dateTime || e.end?.date || null,
        allDay: !e.start?.dateTime, location: e.location || null,
        description: e.description || null,
        meetLink: e.hangoutLink || (e.conferenceData?.entryPoints?.[0]?.uri ?? null),
        linkedDeal: linkMap[e.id!] ?? null, attendees, companyDomains,
      }
    }))

    return NextResponse.json({ connected: true, events })
  } catch (err) {
    console.error('[calendar/events] Error:', err)
    return NextResponse.json({ connected: false, events: [], error: 'Failed to fetch events' })
  }
}
