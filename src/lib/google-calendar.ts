import { google } from 'googleapis'
import { queryOne, run } from './db'

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly']

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

export async function saveTokens(tokens: {
  access_token?:  string | null
  refresh_token?: string | null
  expiry_date?:   number | null
  email?:         string | null
  display_name?:  string | null
}) {
  await run(`
    INSERT INTO google_credentials (id, access_token, refresh_token, expiry_date, email, display_name, updated_at)
    VALUES ('default', $1, $2, $3, $4, $5, $6)
    ON CONFLICT (id) DO UPDATE SET
      access_token  = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token,
      expiry_date   = EXCLUDED.expiry_date,
      email         = EXCLUDED.email,
      display_name  = EXCLUDED.display_name,
      updated_at    = EXCLUDED.updated_at
  `, [
    tokens.access_token  ?? null,
    tokens.refresh_token ?? null,
    tokens.expiry_date   ?? null,
    tokens.email         ?? null,
    tokens.display_name  ?? null,
    new Date().toISOString(),
  ])
}

type StoredCreds = {
  id: string; access_token: string | null; refresh_token: string | null
  expiry_date: number | null; email: string | null; display_name: string | null; updated_at: string
}

export async function getStoredCredentials(): Promise<StoredCreds | null> {
  return queryOne<StoredCreds>(`SELECT * FROM google_credentials WHERE id = 'default'`)
}

export async function isConnected(): Promise<boolean> {
  const creds = await getStoredCredentials()
  return !!creds?.refresh_token
}

export async function getCalendarClient() {
  const creds = await getStoredCredentials()
  if (!creds?.refresh_token) throw new Error('Not connected to Google Calendar')

  const auth = createOAuth2Client()
  auth.setCredentials({
    access_token:  creds.access_token,
    refresh_token: creds.refresh_token,
    expiry_date:   creds.expiry_date ?? undefined,
  })

  // Persist refreshed tokens automatically (fire-and-forget — cannot await in event handler)
  auth.on('tokens', (newTokens) => {
    run(`UPDATE google_credentials SET access_token = $1, expiry_date = $2, updated_at = $3 WHERE id = 'default'`, [
      newTokens.access_token ?? creds.access_token,
      newTokens.expiry_date  ?? creds.expiry_date,
      new Date().toISOString(),
    ]).catch(console.error)
  })

  return google.calendar({ version: 'v3', auth })
}
