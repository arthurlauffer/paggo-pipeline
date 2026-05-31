import { NextResponse } from 'next/server'
import { getStoredCredentials } from '@/lib/google-calendar'

export const dynamic = 'force-dynamic'

export async function GET() {
  const creds = await getStoredCredentials()
  return NextResponse.json({
    connected:   !!creds?.refresh_token,
    email:       creds?.email        ?? null,
    displayName: creds?.display_name ?? null,
  })
}
