import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne, run } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('eventId')
  if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 })

  const notes = await query(`SELECT * FROM calendar_event_notes WHERE event_id = $1 ORDER BY created_at DESC`, [eventId])
  return NextResponse.json({ notes })
}

export async function POST(req: NextRequest) {
  const { eventId, eventTitle, content } = await req.json()
  if (!eventId || !content?.trim()) {
    return NextResponse.json({ error: 'eventId and content required' }, { status: 400 })
  }

  const id  = `CNOTE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const now = new Date().toISOString()

  await run(`
    INSERT INTO calendar_event_notes (id, event_id, event_title, content, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $5)
  `, [id, eventId, eventTitle ?? null, content.trim(), now])

  const note = await queryOne(`SELECT * FROM calendar_event_notes WHERE id = $1`, [id])
  return NextResponse.json({ note }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await run(`DELETE FROM calendar_event_notes WHERE id = $1`, [id])
  return NextResponse.json({ ok: true })
}
