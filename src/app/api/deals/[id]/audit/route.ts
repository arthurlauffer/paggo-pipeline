import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const audit = await query(`SELECT * FROM audit_log WHERE "dealId" = $1 ORDER BY "createdAt" DESC`, [params.id])
  return NextResponse.json(audit)
}
