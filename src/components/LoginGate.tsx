'use client'

import { useEffect, useState } from 'react'
import { Calendar, ShieldCheck, BarChart3 } from 'lucide-react'

export function LoginGate() {
  const [connectError, setConnectError] = useState<string | null>(null)

  // Surface OAuth callback errors passed back via ?calendar_error=...
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const err = params.get('calendar_error')
    if (err) setConnectError(err)
  }, [])

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-md glass-md rounded-3xl p-8 flex flex-col items-center text-center">
        {/* Logo */}
        <img src="/paggo-logo.png" alt="Paggo" className="h-9 brightness-0 invert mb-2" />
        <span className="text-xs font-medium text-slate-400 tracking-wide mb-7">Pipeline Intelligence</span>

        <h1 className="text-xl font-semibold text-slate-100 mb-2">Entrar na plataforma</h1>
        <p className="text-sm text-slate-400 leading-relaxed mb-7">
          Conecte sua conta do Google para acessar o CRM. Sua agenda do Google Calendar
          aparece automaticamente, vinculada aos seus deals.
        </p>

        {connectError && (
          <div className="w-full mb-5 rounded-xl px-4 py-3 text-[12px] leading-relaxed text-red-300 text-left" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <span className="font-semibold">Falha ao conectar:</span> {connectError}
          </div>
        )}

        {/* Connect button */}
        <a
          href="/api/auth/google"
          className="flex items-center justify-center gap-2.5 w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#fff"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fff"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff"/>
          </svg>
          Entrar com Google
        </a>

        {/* Feature hints */}
        <div className="flex items-center justify-center gap-5 mt-7 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5"><Calendar size={13} /> Sua agenda</span>
          <span className="flex items-center gap-1.5"><BarChart3 size={13} /> Pipeline</span>
          <span className="flex items-center gap-1.5"><ShieldCheck size={13} /> Login Google</span>
        </div>
      </div>
    </div>
  )
}
