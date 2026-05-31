import { NextRequest, NextResponse } from 'next/server'
import { queryOne, run } from '@/lib/db'
import { computeRisk } from '@/lib/risk'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { note } = await req.json().catch(() => ({}))
  const now      = new Date().toISOString()

  const activity = await queryOne(`SELECT * FROM activities WHERE id = $1`, [Number(params.id)]) as any
  if (!activity) return NextResponse.json({ error: 'Activity not found' }, { status: 404 })
  if (activity.isCompleted) return NextResponse.json({ ok: true, alreadyCompleted: true })

  const updatedNotes = note?.trim()
    ? `${activity.notes}${activity.notes ? '\n\n' : ''}✅ ${note.trim()}`
    : activity.notes

  await run(`
    UPDATE activities SET "isCompleted" = 1, notes = $1, "activityAt" = $2 WHERE id = $3
  `, [updatedNotes, now, activity.id])

  const deal = await queryOne(`SELECT * FROM deals WHERE "dealId" = $1`, [activity.dealId]) as any
  if (deal) {
    const risk = computeRisk({ ...deal, lastActivityAt: now })
    await run(`
      UPDATE deals SET "lastActivityAt" = $1, "lastActivityType" = $2,
        "riskScore" = $3, "riskFlags" = $4, "riskLevel" = $5, "updatedAt" = $6
      WHERE "dealId" = $7
    `, [now, activity.type, risk.score, JSON.stringify(risk.flags), risk.level, now, activity.dealId])

    await run(`
      INSERT INTO audit_log ("dealId", action, "newValue", notes, "performedBy", "originatedBy", "createdAt")
      VALUES ($1, 'ACTIVITY_COMPLETED', $2, $3, 'manager', 'user', $4)
    `, [activity.dealId, activity.type, updatedNotes || '', now])
  }

  return NextResponse.json({ ok: true })
}
