'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Bell, X, Clock, CheckCheck, Check } from 'lucide-react'
import { formatDistanceToNow, parseISO, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Reminder } from '@/lib/types'

function relTime(iso: string) {
  try { return formatDistanceToNow(parseISO(iso), { locale: ptBR, addSuffix: true }) } catch { return iso }
}
function fmtDate(iso: string) {
  try { return format(parseISO(iso), "dd/MM 'às' HH:mm", { locale: ptBR }) } catch { return iso }
}

export function ReminderBell() {
  const [dueReminders,  setDueReminders]  = useState<Reminder[]>([])
  const [allReminders,  setAllReminders]  = useState<Reminder[]>([])
  const [open,          setOpen]          = useState(false)
  const [showAll,       setShowAll]       = useState(false)

  // which reminder has the "complete" form open
  const [completingId,   setCompletingId]   = useState<string | null>(null)
  const [completingNote, setCompletingNote] = useState('')

  // animate-out sets
  const [leaving,        setLeaving]        = useState<Set<string>>(new Set())

  const panelRef  = useRef<HTMLDivElement>(null)
  const noteRef   = useRef<HTMLTextAreaElement>(null)

  // ── Data fetching ─────────────────────────────────────────────────────────

  const fetchReminders = useCallback(async () => {
    try {
      const [dueRes, allRes] = await Promise.all([
        fetch('/api/reminders?due=true'),
        fetch('/api/reminders'),
      ])
      setDueReminders((await dueRes.json()).reminders ?? [])
      setAllReminders((await allRes.json()).reminders ?? [])
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchReminders()
    const id = setInterval(fetchReminders, 30_000)
    return () => clearInterval(id)
  }, [fetchReminders])

  // Close on outside click
  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
        setCompletingId(null)
        setCompletingNote('')
      }
    }
    if (open) document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [open])

  // Focus textarea when complete form opens
  useEffect(() => {
    if (completingId) setTimeout(() => noteRef.current?.focus(), 50)
  }, [completingId])

  // ── Actions ───────────────────────────────────────────────────────────────

  const animateOut = (id: string, callback: () => void) => {
    setLeaving(prev => new Set(prev).add(id))
    setTimeout(() => {
      callback()
      setLeaving(prev => { const s = new Set(prev); s.delete(id); return s })
    }, 350)
  }

  const dismiss = async (id: string) => {
    animateOut(id, async () => {
      await fetch(`/api/reminders/${id}/dismiss`, { method: 'PATCH' })
      setDueReminders(p => p.filter(r => r.id !== id))
      setAllReminders(p => p.filter(r => r.id !== id))
    })
  }

  const openComplete = (id: string) => {
    if (completingId === id) {
      setCompletingId(null)
      setCompletingNote('')
    } else {
      setCompletingId(id)
      setCompletingNote('')
    }
  }

  const confirmComplete = async (id: string) => {
    animateOut(id, async () => {
      await fetch(`/api/reminders/${id}/complete`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ note: completingNote }),
      })
      setDueReminders(p => p.filter(r => r.id !== id))
      setAllReminders(p => p.filter(r => r.id !== id))
      setCompletingId(null)
      setCompletingNote('')
    })
  }

  const dismissAllDue = async () => {
    const ids = dueReminders.map(r => r.id)
    ids.forEach(id => setLeaving(prev => new Set(prev).add(id)))
    await Promise.all(ids.map(id => fetch(`/api/reminders/${id}/dismiss`, { method: 'PATCH' })))
    setTimeout(() => {
      setDueReminders([])
      setAllReminders(p => p.filter(r => !ids.includes(r.id)))
      setLeaving(new Set())
    }, 350)
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const displayList = showAll ? allReminders : dueReminders
  const dueCount    = dueReminders.length

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative" ref={panelRef}>

      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`relative p-2 rounded-lg transition-colors ${
          open
            ? 'bg-slate-700 text-slate-100'
            : dueCount > 0
            ? 'text-amber-400 hover:bg-slate-800 animate-pulse'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
        }`}
        title="Lembretes"
      >
        <Bell size={15} />
        {dueCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center leading-none">
            {dueCount > 9 ? '9+' : dueCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 glass-menu rounded-2xl z-50 overflow-hidden" style={{ width: 340 }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center gap-2">
              <Bell size={13} className="text-amber-400" />
              <span className="text-sm font-medium text-slate-100">Lembretes</span>
              {dueCount > 0 && (
                <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full font-medium">
                  {dueCount} pendente{dueCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAll(s => !s)}
                className="text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
              >
                {showAll ? 'Só pendentes' : 'Ver todos'}
              </button>
              <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-slate-300">
                <X size={13} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-auto">
            {displayList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                <CheckCheck size={24} className="text-slate-600 mb-2" />
                <p className="text-xs text-slate-500">
                  {showAll ? 'Nenhum lembrete agendado.' : 'Nenhum lembrete pendente. '}
                  {!showAll && allReminders.length > 0 && (
                    <button onClick={() => setShowAll(true)} className="text-indigo-400 hover:underline">
                      Ver todos ({allReminders.length})
                    </button>
                  )}
                </p>
              </div>
            ) : (
              displayList.map(r => {
                const isDue       = new Date(r.triggerAt) <= new Date()
                const isLeaving   = leaving.has(r.id)
                const isCompleting = completingId === r.id

                return (
                  <div
                    key={r.id}
                    className={`border-b border-slate-700/50 last:border-0 transition-all duration-300 ${
                      isLeaving ? 'opacity-0 -translate-y-1 max-h-0 overflow-hidden' : 'max-h-96'
                    } ${isDue ? 'bg-amber-500/5' : ''}`}
                  >
                    {/* Main row */}
                    <div className="flex gap-3 px-4 py-3">
                      {/* Clock icon */}
                      <div className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                        isDue ? 'bg-amber-500/20' : 'bg-slate-700'
                      }`}>
                        <Clock size={11} className={isDue ? 'text-amber-400' : 'text-slate-400'} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-200 leading-snug">{r.message}</p>
                        {r.dealName && (
                          <p className="text-[10px] text-indigo-400 mt-0.5 truncate">{r.dealName}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] font-medium ${isDue ? 'text-amber-400' : 'text-slate-500'}`}>
                            {isDue ? `Venceu ${relTime(r.triggerAt)}` : fmtDate(r.triggerAt)}
                          </span>
                          {r.createdBy === 'agent' && (
                            <span className="text-[9px] bg-indigo-500/20 text-indigo-400 px-1 rounded">via IA</span>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex-shrink-0 flex items-start gap-1 mt-0.5">
                        {/* Complete (✓) */}
                        <button
                          onClick={() => openComplete(r.id)}
                          title="Marcar como concluído"
                          className={`w-7 h-7 flex items-center justify-center rounded-md transition-all ${
                            isCompleting
                              ? 'bg-emerald-600 text-white'
                              : 'text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/15'
                          }`}
                        >
                          <Check size={13} />
                        </button>
                        {/* Dismiss (×) */}
                        <button
                          onClick={() => dismiss(r.id)}
                          title="Dispensar"
                          className="w-7 h-7 flex items-center justify-center rounded-md text-slate-600 hover:text-slate-400 hover:bg-slate-700/50 transition-colors"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>

                    {/* Inline complete form (expands below the row) */}
                    {isCompleting && (
                      <div className="px-4 pb-3 pt-0 space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
                        <textarea
                          ref={noteRef}
                          value={completingNote}
                          onChange={e => setCompletingNote(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) confirmComplete(r.id)
                            if (e.key === 'Escape') { setCompletingId(null); setCompletingNote('') }
                          }}
                          placeholder={
                            r.dealId
                              ? 'Adicione um comentário sobre esta atividade (opcional)… será salvo no registro do deal'
                              : 'Adicione um comentário (opcional)…'
                          }
                          rows={2}
                          className="w-full bg-slate-700/60 border border-slate-600/60 text-slate-200 text-xs rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-emerald-500/60 placeholder:text-slate-500"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => confirmComplete(r.id)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition-colors"
                          >
                            <Check size={12} />
                            {r.dealId ? 'Concluir e registrar atividade' : 'Concluir'}
                          </button>
                          <button
                            onClick={() => { setCompletingId(null); setCompletingNote('') }}
                            className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-lg transition-colors"
                          >
                            Cancelar
                          </button>
                        </div>
                        {r.dealId && (
                          <p className="text-[10px] text-slate-600 leading-tight">
                            O comentário será registrado como atividade no deal{' '}
                            <span className="text-slate-500">{r.dealName}</span>.
                            {' '}⌘+Enter para confirmar.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* Footer */}
          {displayList.length > 0 && dueCount > 0 && (
            <div className="px-4 py-2 border-t border-slate-700">
              <button
                onClick={dismissAllDue}
                className="w-full text-[10px] text-slate-400 hover:text-slate-200 py-1 text-center transition-colors"
              >
                Dispensar todos pendentes
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
