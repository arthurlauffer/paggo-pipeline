import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { getStoredCredentials, isConnected } from '@/lib/google-calendar'

export const dynamic = 'force-dynamic'

// TEMPORARY diagnostic endpoint — remove after debugging the calendar connection.
export async function GET() {
  const out: Record<string, unknown> = {}

  try {
    const url = process.env.DATABASE_URL || ''
    out.dbHost = url.replace(/^.*@/, '').replace(/\/.*$/, '') || '(unset)'
  } catch (e: any) { out.dbHostError = String(e?.message ?? e) }

  // A) Broad read (no WHERE)
  try {
    const rows = await query(
      `SELECT id, (refresh_token IS NOT NULL) AS has_refresh FROM google_credentials`
    )
    out.broad = { rowCount: rows.length, rows }
  } catch (e: any) { out.broadError = String(e?.message ?? e) }

  // B) Exact query the status route uses, via queryOne
  try {
    const row = await queryOne<any>(`SELECT * FROM google_credentials WHERE id = 'default'`)
    out.whereQuery = row
      ? { found: true, idValue: JSON.stringify(row.id), hasRefresh: !!row.refresh_token }
      : { found: false }
  } catch (e: any) { out.whereError = String(e?.message ?? e) }

  // C) The actual lib functions the status route calls
  try {
    const creds = await getStoredCredentials()
    out.getStoredCredentials = creds
      ? { found: true, hasRefresh: !!creds.refresh_token, refreshType: typeof creds.refresh_token }
      : { found: false }
  } catch (e: any) { out.getStoredError = String(e?.message ?? e) }

  try {
    out.isConnected = await isConnected()
  } catch (e: any) { out.isConnectedError = String(e?.message ?? e) }

  return NextResponse.json(out)
}
