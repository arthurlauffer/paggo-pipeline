'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Calendar, Video, MapPin, Link2,
  RefreshCw, ChevronRight, Search, X,
  Building2, Users, CheckCircle2, XCircle, HelpCircle, Clock,
  FileText, Plus, Trash2,
} from 'lucide-react'
import { format, parseISO, isToday, isTomorrow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Attendee {
  email:          string
  name:           string
  responseStatus: 'accepted' | 'declined' | 'tentative' | 'needsAction'
  organizer:      boolean
  self:           boolean
}

interface DealRef {
  dealId:      string
  accountName: string
  stage:       string
  ownerName:   string
}

interface CompanyDomain {
  domain: string
  hint:   string
  deals:  DealRef[]
}

interface CalEvent {
  id:             string
  title:          string
  start:          string | null
  end:            string | null
  allDay:         boolean
  location:       string | null
  description:    string | null
  meetLink:       string | null
  linkedDeal:     { dealId: string; dealName: string } | null
  attendees:      Attendee[]
  companyDomains: CompanyDomain[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dayLabel(event: CalEvent): string {
  if (!event.start) return ''
  const d = parseISO(event.start)
  if (isToday(d))    return 'Hoje'
  if (isTomorrow(d)) return 'Amanhã'
  return format(d, 'EEE d', { locale: ptBR })
}

// Deterministic avatar colour from email
const AVATAR_COLORS = [
  'bg-indigo-600', 'bg-violet-600', 'bg-sky-600', 'bg-teal-600',
  'bg-emerald-600', 'bg-amber-600', 'bg-rose-600', 'bg-pink-600',
]
function avatarColor(email: string) {
  let h = 0
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) & 0xffff
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

// Response status icon + colour
const STATUS_META = {
  accepted:    { Icon: CheckCircle2, cls: 'text-emerald-400', tip: 'Confirmado'   },
  declined:    { Icon: XCircle,      cls: 'text-red-400',     tip: 'Recusado'     },
  tentative:   { Icon: HelpCircle,   cls: 'text-amber-400',   tip: 'Talvez'       },
  needsAction: { Icon: Clock,        cls: 'text-slate-500',   tip: 'Sem resposta' },
}

// ─── Meeting Notes ────────────────────────────────────────────────────────────

interface EventNote {
  id:          string
  event_id:    string
  event_title: string | null
  content:     string
  created_at:  string
}

function MeetingNotes({ event }: { event: CalEvent }) {
  const [notes,    setNotes]    = useState<EventNote[]>([])
  const [loaded,   setLoaded]   = useState(false)
  const [adding,   setAdding]   = useState(false)
  const [draft,    setDraft]    = useState('')
  const [saving,   setSaving]   = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/calendar/notes?eventId=${encodeURIComponent(event.id)}`)
    const d   = await res.json()
    setNotes(d.notes ?? [])
    setLoaded(true)
  }, [event.id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (adding) setTimeout(() => textareaRef.current?.focus(), 50)
  }, [adding])

  const save = async () => {
    if (!draft.trim() || saving) return
    setSaving(true)
    await fetch('/api/calendar/notes', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ eventId: event.id, eventTitle: event.title, content: draft.trim() }),
    })
    setDraft('')
    setAdding(false)
    setSaving(false)
    load()
  }

  const remove = async (id: string) => {
    await fetch('/api/calendar/notes', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id }),
    })
    setNotes(p => p.filter(n => n.id !== id))
  }

  if (!loaded) return null

  return (
    <div className="mt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1">
          <FileText size={10} className="text-slate-600" />
          <span className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">
            Notas da reunião {notes.length > 0 && `(${notes.length})`}
          </span>
        </div>
        <button
          onClick={() => setAdding(s => !s)}
          className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-indigo-400 transition-colors"
        >
          <Plus size={10} />
          Adicionar
        </button>
      </div>

      {/* Add note form */}
      {adding && (
        <div className="mb-2 space-y-1.5">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
              if (e.key === 'Escape') { setAdding(false); setDraft('') }
            }}
            placeholder="Adicione notas, pautas, pontos importantes…"
            rows={3}
            className="w-full rounded-lg px-3 py-2 text-xs text-slate-200 resize-none focus:outline-none"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(99,102,241,0.3)',
            }}
          />
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={!draft.trim() || saving}
              className="flex-1 py-1.5 text-xs font-medium text-white rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Salvando…' : 'Salvar nota'}
            </button>
            <button
              onClick={() => { setAdding(false); setDraft('') }}
              className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300 rounded-lg transition-colors"
              style={{ background: 'rgba(255,255,255,0.04)' }}
            >
              Cancelar
            </button>
          </div>
          <p className="text-[10px] text-slate-600">⌘+Enter para salvar</p>
        </div>
      )}

      {/* Notes list */}
      {notes.length > 0 ? (
        <div className="space-y-1.5">
          {notes.map(n => (
            <div
              key={n.id}
              className="group rounded-lg px-3 py-2 relative"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap pr-6">{n.content}</p>
              <p className="text-[10px] text-slate-600 mt-1">
                {format(parseISO(n.created_at), "dd/MM 'às' HH:mm")}
              </p>
              <button
                onClick={() => remove(n.id)}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      ) : !adding ? (
        <button
          onClick={() => setAdding(true)}
          className="w-full text-center py-2 text-[10px] text-slate-600 hover:text-slate-400 transition-colors rounded-lg"
          style={{ border: '1px dashed rgba(255,255,255,0.06)' }}
        >
          + Nenhuma nota ainda — clique para adicionar
        </button>
      ) : null}
    </div>
  )
}

// ─── LinkPicker ───────────────────────────────────────────────────────────────

function LinkPicker({
  event, onLink, onClose,
}: {
  event: CalEvent
  onLink: (dealId: string, dealName: string) => void
  onClose: () => void
}) {
  const [query,   setQuery]   = useState('')
  const [deals,   setDeals]   = useState<DealRef[]>([])
  const [loading, setLoading] = useState(true)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/deals?limit=500&sortBy=riskScore&sortOrder=desc')
      .then(r => r.json())
      .then(d => { setDeals(d.deals ?? []); setLoading(false) })
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const filtered = query.trim()
    ? deals.filter(d =>
        d.accountName.toLowerCase().includes(query.toLowerCase()) ||
        d.ownerName.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8)
    : deals.slice(0, 8)

  return (
    <div ref={ref} className="mt-2 glass-menu rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <Search size={12} className="text-slate-500 flex-shrink-0" />
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Escape' && onClose()}
          placeholder="Buscar deal…"
          className="flex-1 bg-transparent text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none"
        />
        <button onClick={onClose} className="text-slate-600 hover:text-slate-400"><X size={12} /></button>
      </div>
      <div className="max-h-44 overflow-y-auto py-1">
        {loading ? (
          <div className="px-3 py-3 text-xs text-slate-500">Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-3 text-xs text-slate-500">Nenhum deal encontrado</div>
        ) : filtered.map(d => (
          <button
            key={d.dealId}
            onClick={() => onLink(d.dealId, d.accountName)}
            className="w-full flex items-start gap-2.5 px-3 py-2 hover:bg-white/[0.07] transition-colors text-left"
          >
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-slate-200 truncate">{d.accountName}</div>
              <div className="text-[10px] text-slate-500">{d.stage} · {d.ownerName}</div>
            </div>
            <ChevronRight size={12} className="text-slate-600 flex-shrink-0 mt-0.5" />
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── AttendeesSection ─────────────────────────────────────────────────────────

function AttendeesSection({ attendees, companyDomains }: {
  attendees:      Attendee[]
  companyDomains: CompanyDomain[]
}) {
  const [expanded, setExpanded] = useState(false)

  if (attendees.length === 0) return null

  const visible = expanded ? attendees : attendees.slice(0, 5)
  const extra   = attendees.length - 5

  return (
    <div className="mt-3 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>

      {/* ── Attendees row ── */}
      <div>
        <div className="flex items-center gap-1 mb-2">
          <Users size={10} className="text-slate-600" />
          <span className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">
            Participantes ({attendees.length})
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {visible.map(a => {
            const meta   = STATUS_META[a.responseStatus as keyof typeof STATUS_META] || STATUS_META.needsAction
            const StatusIcon = meta.Icon
            return (
              <div
                key={a.email}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] transition-colors"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}
                title={`${a.email} · ${meta.tip}`}
              >
                {/* Avatar */}
                <div className={`w-4 h-4 rounded-full ${avatarColor(a.email)} flex items-center justify-center flex-shrink-0`}>
                  <span className="text-[7px] font-bold text-white">{initials(a.name)}</span>
                </div>
                {/* Name */}
                <span className={`max-w-[100px] truncate ${a.self ? 'text-indigo-300 font-medium' : 'text-slate-300'}`}>
                  {a.self ? 'Você' : a.name}
                </span>
                {/* Status icon */}
                <StatusIcon size={10} className={`flex-shrink-0 ${meta.cls}`} />
              </div>
            )
          })}
          {!expanded && extra > 0 && (
            <button
              onClick={() => setExpanded(true)}
              className="flex items-center px-2 py-1 rounded-lg text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              +{extra} mais
            </button>
          )}
        </div>
      </div>

      {/* ── Company domains ── */}
      {companyDomains.length > 0 && (
        <div>
          <div className="flex items-center gap-1 mb-2">
            <Building2 size={10} className="text-slate-600" />
            <span className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">
              Empresas
            </span>
          </div>
          <div className="space-y-1.5">
            {companyDomains.map(cd => (
              <div
                key={cd.domain}
                className="rounded-lg px-3 py-2"
                style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.14)' }}
              >
                {/* Domain header */}
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-4 h-4 rounded-sm bg-indigo-600/60 flex items-center justify-center flex-shrink-0">
                    <Building2 size={8} className="text-indigo-300" />
                  </div>
                  <span className="text-[11px] font-semibold text-indigo-300">{cd.domain}</span>
                </div>

                {/* Matched deals */}
                {cd.deals.length > 0 ? (
                  <div className="space-y-1">
                    {cd.deals.map(d => (
                      <div key={d.dealId} className="flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-indigo-500 flex-shrink-0" />
                        <span className="text-[10px] text-slate-300 truncate font-medium">{d.accountName}</span>
                        <span className="text-[10px] text-slate-600 flex-shrink-0">·</span>
                        <span className="text-[10px] text-slate-500 flex-shrink-0">{d.stage}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-[10px] text-slate-600 italic">Sem registro no CRM</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── EventCard ────────────────────────────────────────────────────────────────

function EventCard({ event, onLinked }: { event: CalEvent; onLinked: () => void }) {
  const [showPicker, setShowPicker] = useState(false)
  const [busy,       setBusy]       = useState(false)
  const [showAll,    setShowAll]    = useState(false)

  const link = async (dealId: string, dealName: string) => {
    setBusy(true); setShowPicker(false)
    await fetch('/api/calendar/link', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId:    event.id,
        eventTitle: event.title,
        eventStart: event.start,
        dealId,
        attendees:  event.attendees,   // pass attendees so activity is enriched
      }),
    })
    setBusy(false); onLinked()
  }

  const unlink = async () => {
    setBusy(true)
    await fetch('/api/calendar/link', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: event.id }),
    })
    setBusy(false); onLinked()
  }

  const hasAttendees = event.attendees.length > 0

  return (
    <div className="rounded-xl p-3 transition-colors hover:bg-white/[0.03]" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-start gap-2.5">

        {/* Day column */}
        <div className="flex-shrink-0 w-9 text-center">
          <div className="text-[10px] text-slate-500 capitalize leading-tight">
            {event.start ? format(parseISO(event.start), 'EEE', { locale: ptBR }) : ''}
          </div>
          <div className="text-lg font-bold text-slate-100 leading-tight">
            {event.start ? format(parseISO(event.start), 'd') : '—'}
          </div>
          {!event.allDay && event.start && (
            <div className="text-[10px] text-indigo-400 font-medium leading-tight">
              {format(parseISO(event.start), 'HH:mm')}
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">

          {/* Title + Meet link */}
          <div className="flex items-start gap-1.5">
            <span className="text-sm font-medium text-slate-100 leading-snug flex-1 min-w-0 truncate">
              {event.title}
            </span>
            {event.meetLink && (
              <a
                href={event.meetLink} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="flex-shrink-0 flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/15 px-2 py-0.5 rounded-full transition-colors"
              >
                <Video size={10} /> Meet
              </a>
            )}
          </div>

          {/* Location */}
          {event.location && (
            <div className="flex items-center gap-1 mt-0.5 text-[10px] text-slate-500 truncate">
              <MapPin size={10} className="flex-shrink-0" /> {event.location}
            </div>
          )}

          {/* Linked deal or link button */}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {event.linkedDeal ? (
              <div className="flex items-center gap-1.5">
                <span className="flex items-center gap-1 text-[10px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full">
                  <Link2 size={9} /> {event.linkedDeal.dealName}
                </span>
                <button onClick={unlink} disabled={busy} title="Desvincular" className="text-slate-600 hover:text-slate-400 transition-colors">
                  <X size={11} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowPicker(s => !s)} disabled={busy}
                className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 px-2 py-0.5 rounded-full transition-colors border border-transparent hover:border-indigo-500/20"
              >
                <Link2 size={9} /> Vincular deal
              </button>
            )}

            {/* Attendees toggle */}
            {hasAttendees && (
              <button
                onClick={() => setShowAll(s => !s)}
                className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
              >
                <Users size={9} />
                {event.attendees.length} participante{event.attendees.length !== 1 ? 's' : ''}
                {event.companyDomains.length > 0 && (
                  <span className="text-indigo-500">· {event.companyDomains.length} empresa{event.companyDomains.length !== 1 ? 's' : ''}</span>
                )}
              </button>
            )}
          </div>

          {/* Link picker */}
          {showPicker && (
            <LinkPicker event={event} onLink={link} onClose={() => setShowPicker(false)} />
          )}

          {/* Attendees + companies (expandable) */}
          {showAll && hasAttendees && (
            <AttendeesSection attendees={event.attendees} companyDomains={event.companyDomains} />
          )}

          {/* Meeting notes */}
          <MeetingNotes event={event} />
        </div>
      </div>
    </div>
  )
}

// ─── Main widget ──────────────────────────────────────────────────────────────

export function CalendarWidget() {
  const [status,  setStatus]  = useState<{ connected: boolean; email: string | null } | null>(null)
  const [events,  setEvents]  = useState<CalEvent[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [sRes, eRes] = await Promise.all([
        fetch('/api/calendar/status'),
        fetch('/api/calendar/events'),
      ])
      const s = await sRes.json()
      const e = await eRes.json()
      setStatus(s)
      setEvents(e.events ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (!loading && !process.env.NEXT_PUBLIC_GOOGLE_CONFIGURED && !status?.connected) return null

  if (loading) {
    return (
      <div className="glass-md rounded-xl p-5 animate-pulse space-y-3">
        <div className="h-4 bg-white/5 rounded w-40" />
        <div className="h-16 bg-white/5 rounded-xl" />
        <div className="h-16 bg-white/5 rounded-xl" />
        <div className="h-16 bg-white/5 rounded-xl" />
      </div>
    )
  }

  if (!status?.connected) {
    return (
      <div className="glass-md rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Calendar size={14} className="text-indigo-400" />
          <h3 className="text-sm font-semibold text-slate-200">Google Calendar</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
          Conecte seu Google Calendar para ver seus próximos compromissos aqui e vinculá-los a deals.
        </p>
        <a
          href="/api/auth/google"
          className="flex items-center justify-center gap-2 w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#fff"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fff"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff"/>
          </svg>
          Conectar Google Calendar
        </a>
      </div>
    )
  }

  // Group events by day
  const grouped: { label: string; events: CalEvent[] }[] = []
  events.forEach(ev => {
    const label = dayLabel(ev)
    const last  = grouped[grouped.length - 1]
    if (last && last.label === label) last.events.push(ev)
    else grouped.push({ label, events: [ev] })
  })

  return (
    <div className="glass-md rounded-xl p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-indigo-400" />
          <h3 className="text-sm font-semibold text-slate-200">Próximos compromissos</h3>
          {status.email && (
            <span className="text-[10px] text-slate-600 hidden sm:inline truncate max-w-[160px]">{status.email}</span>
          )}
        </div>
        <button onClick={load} className="p-1 text-slate-600 hover:text-slate-400 transition-colors rounded" title="Atualizar">
          <RefreshCw size={12} />
        </button>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-6">
          <Calendar size={24} className="text-slate-700 mx-auto mb-2" />
          <p className="text-xs text-slate-500">Nenhum compromisso nos próximos 14 dias.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(group => (
            <div key={group.label}>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 capitalize">
                {group.label}
              </div>
              <div className="space-y-2">
                {group.events.map(ev => (
                  <EventCard key={ev.id} event={ev} onLinked={load} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
