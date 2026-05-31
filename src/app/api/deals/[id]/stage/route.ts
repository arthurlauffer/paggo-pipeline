import { NextRequest, NextResponse } from 'next/server'
import { queryOne, run } from '@/lib/db'
import { computeRisk } from '@/lib/risk'
import { VALID_TRANSITIONS } from '@/lib/types'
import type { Stage } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { newStage, reason, originatedBy = 'user', performedBy = 'manager' } = await req.json()

  const deal = await queryOne(`SELECT * FROM deals WHERE "dealId" = $1`, [params.id]) as any
  if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })

  const currentStage = deal.stage as Stage
  const validNext = VALID_TRANSITIONS[currentStage]

  if (!validNext.includes(newStage)) {
    return NextResponse.json(
      { error: `Transição inválida: ${currentStage} → ${newStage}. Válidas: ${validNext.join(', ')}` },
      { status: 400 }
    )
  }

  const now  = new Date().toISOString()
  const risk = computeRisk({ ...deal, stage: newStage })

  await run(`
    UPDATE deals SET stage = $1, "riskScore" = $2, "riskFlags" = $3, "riskLevel" = $4,
      "daysInCurrentStage" = 0, "updatedAt" = $5
    WHERE "dealId" = $6
  `, [newStage, risk.score, JSON.stringify(risk.flags), risk.level, now, params.id])

  await run(`
    INSERT INTO audit_log ("dealId", action, "oldValue", "newValue", reason, "performedBy", "originatedBy", "createdAt")
    VALUES ($1, 'STAGE_CHANGE', $2, $3, $4, $5, $6, $7)
  `, [params.id, currentStage, newStage, reason || null, performedBy, originatedBy, now])

  const updated = await queryOne(`SELECT * FROM deals WHERE "dealId" = $1`, [params.id])
  return NextResponse.json({ deal: updated })
}
