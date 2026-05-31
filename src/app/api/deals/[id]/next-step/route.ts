import { NextRequest, NextResponse } from 'next/server'
import { queryOne, runReturning, run } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { type, notes, dueAt, originatedBy = 'user', performedBy = 'manager' } = await req.json()

  if (!['CALL', 'EMAIL', 'MEETING', 'NOTE'].includes(type)) {
    return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
  }
  if (!dueAt) {
    return NextResponse.json({ error: 'dueAt é obrigatório' }, { status: 400 })
  }

  const deal = await queryOne(`SELECT "dealId" FROM deals WHERE "dealId" = $1`, [params.id])
  if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })

  const now = new Date().toISOString()

  const [row] = await runReturning<{ id: number }>(`
    INSERT INTO activities ("dealId", type, notes, "activityAt", "isNextStep", "isCompleted", "dueAt", "createdAt", "createdBy")
    VALUES ($1, $2, $3, $4, 1, 0, $4, $5, $6)
    RETURNING id
  `, [params.id, type, notes || '', dueAt, now, originatedBy])

  await run(`
    INSERT INTO audit_log ("dealId", action, "newValue", notes, "performedBy", "originatedBy", "createdAt")
    VALUES ($1, 'NEXT_STEP_SCHEDULED', $2, $3, $4, $5, $6)
  `, [params.id, `${type} em ${dueAt}`, notes || '', performedBy, originatedBy, now])

  return NextResponse.json({ id: row?.id })
}
