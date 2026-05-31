import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne, run } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const due = req.nextUrl.searchParams.get('due') === 'true'

  let rows
  if (due) {
    const now = new Date().toISOString()
    rows = await query(`SELECT * FROM reminders WHERE "isDismissed" = 0 AND "triggerAt" <= $1 ORDER BY "triggerAt" ASC`, [now])
  } else {
    rows = await query(`SELECT * FROM reminders WHERE "isDismissed" = 0 ORDER BY "triggerAt" ASC`)
  }

  return NextResponse.json({ reminders: rows })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { dealId = null, dealName = null, message, triggerAt, createdBy = 'manager' } = body

  if (!message?.trim() || !triggerAt) {
    return NextResponse.json({ error: 'message e triggerAt são obrigatórios' }, { status: 400 })
  }

  const id  = `REM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const now = new Date().toISOString()

  await run(`
    INSERT INTO reminders (id, "dealId", "dealName", message, "triggerAt", "createdBy", "isDismissed", "createdAt")
    VALUES ($1, $2, $3, $4, $5, $6, 0, $7)
  `, [id, dealId, dealName, message.trim(), triggerAt, createdBy, now])

  const reminder = await queryOne(`SELECT * FROM reminders WHERE id = $1`, [id])
  return NextResponse.json({ reminder }, { status: 201 })
}
