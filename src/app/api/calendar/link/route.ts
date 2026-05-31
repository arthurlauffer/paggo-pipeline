import { NextRequest, NextResponse } from 'next/server'
import { queryOne, run } from '@/lib/db'
import { computeRisk } from '@/lib/risk'

export const dynamic = 'force-dynamic'

const PERSONAL = new Set([
  'gmail.com','googlemail.com','yahoo.com','hotmail.com','outlook.com',
  'live.com','icloud.com','me.com','msn.com','aol.com','protonmail.com',
])

export async function POST(req: NextRequest) {
  const { eventId, eventTitle, eventStart, dealId, attendees = [] } = await req.json()
  if (!eventId || !dealId) {
    return NextResponse.json({ error: 'eventId and dealId are required' }, { status: 400 })
  }

  const now = new Date().toISOString()

  await run(`
    INSERT INTO calendar_event_links (id, event_id, deal_id, event_title, event_start, created_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (event_id, deal_id) DO UPDATE SET
      event_title = EXCLUDED.event_title, event_start = EXCLUDED.event_start
  `, [`${eventId}__${dealId}`, eventId, dealId, eventTitle ?? null, eventStart ?? null, now])

  const deal = await queryOne(`SELECT * FROM deals WHERE "dealId" = $1`, [dealId]) as any
  if (deal && eventStart) {
    const isPast = new Date(eventStart) < new Date()
    const externalNames = (attendees as { name: string; email: string; self?: boolean }[])
      .filter(a => !a.self && !PERSONAL.has((a.email || '').split('@')[1] ?? ''))
      .map(a => a.name || a.email).join(', ')

    const activityNotes = [
      `📅 ${isPast ? 'Reunião realizada' : 'Reunião agendada'}: ${eventTitle || '(sem título)'}`,
      externalNames ? `Participantes externos: ${externalNames}` : null,
    ].filter(Boolean).join('\n')

    // Remove previous calendar-linked MEETING for this event
    await run(`DELETE FROM activities WHERE "dealId" = $1 AND "createdBy" = 'calendar' AND type = 'MEETING' AND notes LIKE $2`,
      [dealId, `%[calendar:${eventId.slice(0, 20)}]%`])

    await run(`
      INSERT INTO activities ("dealId", type, notes, "activityAt", "isNextStep", "isCompleted", "dueAt", "createdAt", "createdBy")
      VALUES ($1, 'MEETING', $2, $3, $4, $5, $3, $6, 'calendar')
    `, [dealId, activityNotes + `\n[calendar:${eventId}]`, eventStart, isPast ? 0 : 1, isPast ? 1 : 0, now])

    if (isPast) {
      const risk = computeRisk({ ...deal, lastActivityAt: eventStart })
      await run(`
        UPDATE deals SET "lastActivityAt" = $1, "lastActivityType" = 'MEETING',
          "riskScore" = $2, "riskFlags" = $3, "riskLevel" = $4, "updatedAt" = $5
        WHERE "dealId" = $6
      `, [eventStart, risk.score, JSON.stringify(risk.flags), risk.level, now, dealId])
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { eventId } = await req.json()
  if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 })

  await run(`DELETE FROM activities WHERE "createdBy" = 'calendar' AND notes LIKE $1`, [`%[calendar:${eventId.slice(0, 40)}]%`])
  await run(`DELETE FROM calendar_event_links WHERE event_id = $1`, [eventId])
  return NextResponse.json({ ok: true })
}
