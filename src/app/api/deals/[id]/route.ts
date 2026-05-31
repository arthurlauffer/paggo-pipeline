import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const deal = await queryOne(`SELECT * FROM deals WHERE "dealId" = $1`, [params.id])
  if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })

  const activities = await query(`SELECT * FROM activities WHERE "dealId" = $1 ORDER BY "activityAt" DESC`, [params.id])
  const audit      = await query(`SELECT * FROM audit_log WHERE "dealId" = $1 ORDER BY "createdAt" DESC LIMIT 50`, [params.id])

  return NextResponse.json({ deal, activities, audit })
}
