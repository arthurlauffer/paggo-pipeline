import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const rows = await query<{ ownerName: string }>(
    `SELECT DISTINCT "ownerName" FROM deals WHERE stage NOT IN ('CLOSED_WON','CLOSED_LOST') ORDER BY "ownerName"`
  )
  return NextResponse.json(rows.map(r => r.ownerName))
}
