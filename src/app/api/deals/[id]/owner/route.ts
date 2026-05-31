import { NextRequest, NextResponse } from 'next/server'
import { queryOne, run } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { newOwner, reason, originatedBy = 'user', performedBy = 'manager' } = await req.json()

  if (!newOwner?.trim()) {
    return NextResponse.json({ error: 'newOwner é obrigatório' }, { status: 400 })
  }

  const deal = await queryOne(`SELECT * FROM deals WHERE "dealId" = $1`, [params.id]) as any
  if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })

  const now      = new Date().toISOString()
  const oldOwner = deal.ownerName

  await run(`UPDATE deals SET "ownerName" = $1, "updatedAt" = $2 WHERE "dealId" = $3`, [newOwner.trim(), now, params.id])

  await run(`
    INSERT INTO audit_log ("dealId", action, "oldValue", "newValue", reason, "performedBy", "originatedBy", "createdAt")
    VALUES ($1, 'OWNER_REASSIGNED', $2, $3, $4, $5, $6, $7)
  `, [params.id, oldOwner, newOwner.trim(), reason || null, performedBy, originatedBy, now])

  const updated = await queryOne(`SELECT * FROM deals WHERE "dealId" = $1`, [params.id])
  return NextResponse.json({ deal: updated })
}
