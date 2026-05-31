import { google } from 'googleapis'
import { cookies } from 'next/headers'
import { queryOne, run } from './db'

// openid/email/profile let us identify each user; calendar.readonly for the agenda.
const SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/calendar.readonly',
]

export const SESSION_COOKIE = 'paggo_session'

/** Reads the current request's session token from the cookie (route-handler scope). */
export function getSessionToken(): string | null {
  try {
    return cookies().get(SESSION_COOKIE)?.value ?? null
  } catch {
    return null
  }
}

function getRedirectUri() {
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
  return `${base}/api/auth/google-callback`
}

export function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri()
  )
}

export function getAuthUrl(): string {
  const auth = createOAuth2Client()
  return auth.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' })
}

/** Persists a user's tokens under their own session token (one row per user). */
export async function saveTokens(sessionToken: string, tokens: {
  access_token?:  string | null
  refresh_token?: string | null
  expiry_date?:   number | null
  email?:         string | null
  display_name?:  string | null
}) {
  await run(`
    INSERT INTO google_credentials (id, access_token, refresh_token, expiry_date, email, display_name, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (id) DO UPDATE SET
      access_token  = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token,
      expiry_date   = EXCLUDED.expiry_date,
      email         = EXCLUDED.email,
      display_name  = EXCLUDED.display_name,
      updated_at    = EXCLUDED.updated_at
  `, [
    sessionToken,
    tokens.access_token  ?? null,
    tokens.refresh_token ?? null,
    tokens.expiry_date   ?? null,
    tokens.email         ?? null,
    tokens.display_name  ?? null,
    new Date().toISOString(),
  ])
}

/** Removes a user's stored credentials (logout). */
export async function deleteSession(sessionToken: string) {
  await run(`DELETE FROM google_credentials WHERE id = $1`, [sessionToken])
}

type StoredCreds = {
  id: string; access_token: string | null; refresh_token: string | null
  expiry_date: number | null; email: string | null; display_name: string | null; updated_at: string
}

export async function getStoredCredentials(sessionToken?: string | null): Promise<StoredCreds | null> {
  const token = sessionToken ?? getSessionToken()
  if (!token) return null
  return queryOne<StoredCreds>(`SELECT * FROM google_credentials WHERE id = $1`, [token])
}

export async function isConnected(sessionToken?: string | null): Promise<boolean> {
  const creds = await getStoredCredentials(sessionToken)
  return !!creds?.refresh_token
}

export async function getCalendarClient(sessionToken?: string | null) {
  const token = sessionToken ?? getSessionToken()
  const creds = await getStoredCredentials(token)
  if (!creds?.refresh_token || !token) throw new Error('Not connected to Google Calendar')

  const auth = createOAuth2Client()
  auth.setCredentials({
    access_token:  creds.access_token,
    refresh_token: creds.refresh_token,
    expiry_date:   creds.expiry_date ?? undefined,
  })

  // Persist refreshed tokens automatically (fire-and-forget — cannot await in event handler)
  auth.on('tokens', (newTokens) => {
    run(`UPDATE google_credentials SET access_token = $1, expiry_date = $2, updated_at = $3 WHERE id = $4`, [
      newTokens.access_token ?? creds.access_token,
      newTokens.expiry_date  ?? creds.expiry_date,
      new Date().toISOString(),
      token,
    ]).catch(console.error)
  })

  return google.calendar({ version: 'v3', auth })
}
