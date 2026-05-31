import { NextResponse } from 'next/server'
import { getStoredCredentials } from '@/lib/google-calendar'

export const dynamic = 'force-dynamic'

// Returns the currently logged-in user (based on the session cookie), or authed:false.
export async function GET() {
  const creds = await getStoredCredentials()
  if (!creds?.refresh_token) {
    return NextResponse.json({ authed: false })
  }
  return NextResponse.json({
    authed:      true,
    email:       creds.email        ?? null,
    displayName: creds.display_name ?? null,
  })
}
