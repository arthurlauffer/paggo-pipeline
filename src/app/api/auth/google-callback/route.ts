import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createOAuth2Client, saveTokens } from '@/lib/google-calendar'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl
  const code  = searchParams.get('code')
  const error = searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(new URL('/?calendar_error=access_denied', origin))
  }

  try {
    const auth = createOAuth2Client()
    const { tokens } = await auth.getToken(code)
    auth.setCredentials(tokens)

    // Fetch the user's profile (name + email)
    let email:        string | null = null
    let display_name: string | null = null
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth })
      const { data } = await oauth2.userinfo.get()
      email        = data.email ?? null
      display_name = data.name  ?? null
    } catch { /* non-fatal */ }

    await saveTokens({
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date:   tokens.expiry_date,
      email,
      display_name,
    })

    return NextResponse.redirect(new URL('/?calendar_connected=1', origin))
  } catch (e) {
    console.error('[google-callback] Error:', e)
    return NextResponse.redirect(new URL('/?calendar_error=oauth_failed', origin))
  }
}
