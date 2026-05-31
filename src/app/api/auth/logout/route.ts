import { NextResponse } from 'next/server'
import { getSessionToken, deleteSession, SESSION_COOKIE } from '@/lib/google-calendar'

export const dynamic = 'force-dynamic'

export async function POST() {
  const token = getSessionToken()
  if (token) {
    try { await deleteSession(token) } catch { /* ignore */ }
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 })
  return res
}
