import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

// TEMPORARY diagnostic endpoint — remove after debugging the calendar connection.
export async function GET() {
  const out: Record<string, unknown> = {}

  // Which database host is this deployment talking to?
  try {
    const url = process.env.DATABASE_URL || ''
    out.dbHost = url.replace(/^.*@/, '').replace(/\/.*$/, '') || '(unset)'
  } catch (e: any) { out.dbHostError = String(e?.message ?? e) }

  // Does the table exist and how many rows?
  try {
    const rows = await query(
      `SELECT id, (refresh_token IS NOT NULL) AS has_refresh,
              (access_token IS NOT NULL) AS has_access,
              email, display_name, updated_at
       FROM google_credentials`
    )
    out.rowCount = rows.length
    out.rows = rows
  } catch (e: any) {
    out.queryError = String(e?.message ?? e)
  }

  return NextResponse.json(out)
}
