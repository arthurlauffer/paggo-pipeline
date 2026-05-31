import { NextRequest, NextResponse } from 'next/server'
import { queryOne, run } from '@/lib/db'
import { VALID_TRANSITIONS } from '@/lib/types'
import type { Stage } from '@/lib/types'

export const dynamic = 'force-dynamic'

const LOST_REASONS = ['NO_BUDGET', 'LOST_TO_COMPETITOR', 'NO_DECISION', 'OTHER']

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { outcome, lostReason, notes, originatedBy = 'user', performedBy = 'manager' } = await req.json()

  if (!['CLOSED_WON', 'CLOSED_LOST'].includes(outcome)) {
    return NextResponse.json({ error: 'outcome deve ser CLOSED_WON ou CLOSED_LOST' }, { status: 400 })
  }
  if (outcome === 'CLOSED_LOST' && !LOST_REASONS.includes(lostReason)) {
    return NextResponse.json(
      { error: `lostReason obrigatório para CLOSED_LOST: ${LOST_REASONS.join(', ')}` },
      { status: 400 }
    )
  }

  const deal = await queryOne(`SELECT * FROM deals WHERE "dealId" = $1`, [params.id]) as any
  if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })

  const validNext = VALID_TRANSITIONS[deal.stage as Stage]
  if (!validNext.includes(outcome)) {
    return NextResponse.json({ error: `Não é possível fechar a partir de ${deal.stage}` }, { status: 400 })
  }

  const now = new Date().toISOString()

  await run(`
    UPDATE deals SET stage = $1, "riskScore" = 0, "riskFlags" = '[]', "riskLevel" = 'LOW', "updatedAt" = $2
    WHERE "dealId" = $3
  `, [outcome, now, params.id])

  const reason = outcome === 'CLOSED_LOST' ? lostReason : 'WON'
  await run(`
    INSERT INTO audit_log ("dealId", action, "oldValue", "newValue", reason, notes, "performedBy", "originatedBy", "createdAt")
    VALUES ($1, 'DEAL_CLOSED', $2, $3, $4, $5, $6, $7, $8)
  `, [params.id, deal.stage, outcome, reason, notes || null, performedBy, originatedBy, now])

  const updated = await queryOne(`SELECT * FROM deals WHERE "dealId" = $1`, [params.id])
  return NextResponse.json({ deal: updated })
}
