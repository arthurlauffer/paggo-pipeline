import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne, run } from '@/lib/db'
import { computeRisk } from '@/lib/risk'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { type, notes, activityAt, originatedBy = 'user', performedBy = 'manager' } = await req.json()

  if (!['CALL', 'EMAIL', 'MEETING', 'NOTE'].includes(type)) {
    return NextResponse.json({ error: 'Tipo inválido. Use: CALL, EMAIL, MEETING, NOTE' }, { status: 400 })
  }

  const deal = await queryOne(`SELECT * FROM deals WHERE "dealId" = $1`, [params.id]) as any
  if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })

  const now = new Date().toISOString()
  const at  = activityAt || now

  await run(`
    INSERT INTO activities ("dealId", type, notes, "activityAt", "isNextStep", "isCompleted", "createdAt", "createdBy")
    VALUES ($1, $2, $3, $4, 0, 1, $5, $6)
  `, [params.id, type, notes || '', at, now, originatedBy])

  const risk = computeRisk({ ...deal, lastActivityAt: at })
  await run(`
    UPDATE deals SET "lastActivityAt" = $1, "lastActivityType" = $2,
      "riskScore" = $3, "riskFlags" = $4, "riskLevel" = $5, "updatedAt" = $6
    WHERE "dealId" = $7
  `, [at, type, risk.score, JSON.stringify(risk.flags), risk.level, now, params.id])

  await run(`
    INSERT INTO audit_log ("dealId", action, "newValue", notes, "performedBy", "originatedBy", "createdAt")
    VALUES ($1, 'ACTIVITY_LOGGED', $2, $3, $4, $5, $6)
  `, [params.id, type, notes || '', performedBy, originatedBy, now])

  const updated = await queryOne(`SELECT * FROM deals WHERE "dealId" = $1`, [params.id])
  return NextResponse.json({ deal: updated })
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const activities = await query(`SELECT * FROM activities WHERE "dealId" = $1 ORDER BY "activityAt" DESC`, [params.id])
  return NextResponse.json(activities)
}
