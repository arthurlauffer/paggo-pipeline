'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  CheckSquare, Square, Phone, Mail, Users, FileText, Video,
  AlertTriangle, Clock, Calendar, ChevronRight, RefreshCw,
  CheckCircle2, Circle, XCircle, HelpCircle,
} from 'lucide-react'
import { format, parseISO, isToday, isTomorrow, isPast } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChecklistItem {
  id:             number
  dealId:         string
  type:           string
  notes:          string
  dueAt:          string | null
  activityAt:     string
  accountName:    string
  accountSegment: string
  stage:          string
  amount:         number
  riskLevel:      string
  riskScore:      number
  isCompleted:    number
}

interface CalMeeting {
  eventId:     string
  title:       string
  start:       string | null
  meetLink:    string | null
  location:    string | null
  attendees:   { name: string; email: string; responseStatus: string }[]
  dealId:      string
  accountName: string
  stage:       string
}

interface ChecklistData {
  overdue:           ChecklistItem[]
  today:             ChecklistItem[]
  week:              ChecklistItem[]
  later:             ChecklistItem[]
  calendarMeetings:  CalMeeting[]
  highRisk:          any[]
  completedThisWeek: any[]
  stats: {
    overdueCount:  number
    todayCount:    number
    weekCount:     number
    highRiskCount: number
    meetingsCount: number
  }
}

interface Props {
  onSelectDeal: (dealId: string) => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_META: Record<string, { Icon: React.ElementType; color: string; label: string }> = {
  CALL:    { Icon: Phone,     color: 'text-sky-400',     label: 'Ligação'    },
  EMAIL:   { Icon: Mail,      color: 'text-violet-400',  label: 'Email'      },
  MEETING: { Icon: Users,     color: 'text-emerald-400', label: 'Reunião'    },
  NOTE:    { Icon: FileText,  color: 'text-amber-400',   label: 'Nota'       },
}

const STAGE_LABELS: Record<string, string> = {
  LEAD: 'Lead', QUALIFIED: 'Qualificado', DISCOVERY: 'Discovery',
  DEMO: 'Demo', PROPOSAL: 'Proposta', NEGOTIATION: 'Negociação',
}

function fmt(n: number) {
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `R$ ${(n / 1_000).toFixed(0)}K`
  return `R$ ${Math.round(n)}`
}

function dueLabel(iso: string | null): { text: string; cls: string } {
  if (!iso) return { text: 'Sem data', cls: 'text-slate-600' }
  const d = parseISO(iso)
  if (isPast(d) && !isToday(d)) {
    const days = Math.floor((Date.now() - d.getTime()) / 86400000)
    return { text: `Venceu há ${days}d`, cls: 'text-red-400 font-medium' }
  }
  if (isToday(d))    return { text: `Hoje · ${format(d, 'HH:mm')}`,    cls: 'text-amber-400 font-medium' }
  if (isTomorrow(d)) return { text: `Amanhã · ${format(d, 'HH:mm')}`,  cls: 'text-sky-400' }
  return { text: format(d, "EEE d/MM · HH:mm", { locale: ptBR }), cls: 'text-slate-400' }
}

function meetingTimeLabel(iso: string | null): string {
  if (!iso) return ''
  try {
    const d = parseISO(iso)
    if (isToday(d))    return `Hoje ${format(d, 'HH:mm')}`
    if (isTomorrow(d)) return `Amanhã ${format(d, 'HH:mm')}`
    return format(d, "EEE d/MM 'às' HH:mm", { locale: ptBR })
  } catch { return '' }
}

const RSVP_META: Record<string, { Icon: React.ElementType; cls: string }> = {
  accepted:    { Icon: CheckCircle2, cls: 'text-emerald-400' },
  declined:    { Icon: XCircle,      cls: 'text-red-400'     },
  tentative:   { Icon: HelpCircle,   cls: 'text-amber-400'   },
  needsAction: { Icon: Circle,       cls: 'text-slate-500'   },
}

// ─── ChecklistCard ────────────────────────────────────────────────────────────

function ChecklistCard({
  item,
  onComplete,
  onSelectDeal,
  completing,
}: {
  item:         ChecklistItem
  onComplete:   (id: number, note: string) => void
  onSelectDeal: (id: string) => void
  completing:   boolean
}) {
  const [expanded,  setExpanded]  = useState(false)
  const [note,      setNote]      = useState('')
  const textRef                   = useRef<HTMLTextAreaElement>(null)
  const meta = TYPE_META[item.type] || TYPE_META.NOTE
  const { Icon } = meta
  const due  = dueLabel(item.dueAt)

  // Strip the [calendar:xxx] internal marker from notes for display
  const displayNotes = item.notes.replace(/\n?\[calendar:[^\]]+\]/g, '').trim()

  useEffect(() => {
    if (expanded) setTimeout(() => textRef.current?.focus(), 50)
  }, [expanded])

  return (
    <div
      className={`rounded-xl transition-all ${completing ? 'opacity-40 scale-[0.98]' : ''}`}
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* Main row */}
      <div className="flex items-start gap-3 px-4 py-3">
        {/* Check button */}
        <button
          onClick={() => setExpanded(s => !s)}
          disabled={completing}
          className={`flex-shrink-0 mt-0.5 transition-colors ${
            expanded ? 'text-emerald-400' : 'text-slate-600 hover:text-emerald-400'
          }`}
          title="Marcar como concluído"
        >
          {expanded ? <CheckSquare size={18} /> : <Square size={18} />}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Type + account */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Icon size={13} className={meta.color} />
              <span className={`text-xs font-semibold ${meta.color}`}>{meta.label}</span>
            </div>
            <button
              onClick={() => onSelectDeal(item.dealId)}
              className="text-sm font-semibold text-slate-100 hover:text-indigo-300 transition-colors truncate max-w-[200px]"
            >
              {item.accountName}
            </button>
            <span className="text-[10px] px-1.5 py-0.5 rounded glass text-slate-400">
              {STAGE_LABELS[item.stage] || item.stage}
            </span>
            <span className="text-xs font-medium text-slate-300 ml-auto">{fmt(item.amount)}</span>
          </div>

          {/* Notes */}
          {displayNotes && (
            <p className="text-xs text-slate-400 mt-1 leading-relaxed line-clamp-2">
              {displayNotes}
            </p>
          )}

          {/* Due + risk */}
          <div className="flex items-center gap-3 mt-1.5">
            <span className={`flex items-center gap-1 text-[11px] ${due.cls}`}>
              <Clock size={10} />
              {due.text}
            </span>
            {item.riskLevel === 'HIGH' && (
              <span className="text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded font-medium">
                Risco {item.riskScore}
              </span>
            )}
            <button
              onClick={() => onSelectDeal(item.dealId)}
              className="ml-auto text-[10px] text-slate-600 hover:text-indigo-400 flex items-center gap-0.5 transition-colors"
            >
              Ver deal <ChevronRight size={10} />
            </button>
          </div>
        </div>
      </div>

      {/* Completion form (expandable) */}
      {expanded && (
        <div className="px-4 pb-3 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[11px] text-slate-500 pt-2">Adicione uma nota de conclusão (opcional):</p>
          <textarea
            ref={textRef}
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onComplete(item.id, note)
              if (e.key === 'Escape') { setExpanded(false); setNote('') }
            }}
            placeholder="Ex: Falou com cliente, interesse confirmado…"
            rows={2}
            className="w-full rounded-lg px-3 py-2 text-xs text-slate-200 resize-none focus:outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(99,102,241,0.25)' }}
          />
          <div className="flex gap-2">
            <button
              onClick={() => onComplete(item.id, note)}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-white rounded-lg bg-emerald-600 hover:bg-emerald-500 transition-colors"
            >
              <CheckCircle2 size={12} />
              Concluir
            </button>
            <button
              onClick={() => { setExpanded(false); setNote('') }}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 rounded-lg transition-colors"
              style={{ background: 'rgba(255,255,255,0.04)' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── MeetingCard ──────────────────────────────────────────────────────────────

function MeetingCard({ meeting, onSelectDeal }: { meeting: CalMeeting; onSelectDeal: (id: string) => void }) {
  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)' }}
    >
      <div className="flex items-start gap-3">
        <Video size={15} className="text-indigo-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          {/* Title + time */}
          <div className="flex items-start gap-2">
            <span className="text-sm font-semibold text-slate-100 flex-1 min-w-0">{meeting.title}</span>
            {meeting.meetLink && (
              <a
                href={meeting.meetLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full hover:bg-emerald-500/20 transition-colors"
              >
                Entrar
              </a>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Calendar size={10} className="text-indigo-400" />
            <span className="text-[11px] text-indigo-300 font-medium">{meetingTimeLabel(meeting.start)}</span>
            <span className="text-slate-600">·</span>
            <button
              onClick={() => onSelectDeal(meeting.dealId)}
              className="text-[11px] text-slate-400 hover:text-indigo-300 transition-colors"
            >
              {meeting.accountName}
            </button>
            <span className="text-[10px] text-slate-600 ml-1">
              {STAGE_LABELS[meeting.stage] || meeting.stage}
            </span>
          </div>

          {/* Attendees */}
          {meeting.attendees.length > 0 && (
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {meeting.attendees.slice(0, 4).map(a => {
                const rsvp = RSVP_META[a.responseStatus] || RSVP_META.needsAction
                const { Icon: RsvpIcon } = rsvp
                return (
                  <div key={a.email} className="flex items-center gap-1 text-[10px] text-slate-400">
                    <RsvpIcon size={9} className={rsvp.cls} />
                    <span>{a.name || a.email.split('@')[0]}</span>
                  </div>
                )
              })}
              {meeting.attendees.length > 4 && (
                <span className="text-[10px] text-slate-600">+{meeting.attendees.length - 4}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Section ──────────────────────────────────────────────────────────────────

function Section({
  title, icon, count, color, children, defaultOpen = true,
}: {
  title: string
  icon:  React.ReactNode
  count: number
  color: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (count === 0) return null
  return (
    <div className="space-y-2">
      <button
        onClick={() => setOpen(s => !s)}
        className="w-full flex items-center gap-2 py-1 group"
      >
        <span className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${color}`}>
          {icon}
          {title}
        </span>
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${color} opacity-70`}
          style={{ background: 'rgba(255,255,255,0.06)' }}>
          {count}
        </span>
        <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
        <ChevronRight
          size={13}
          className={`text-slate-600 transition-transform ${open ? 'rotate-90' : ''}`}
        />
      </button>
      {open && <div className="space-y-2">{children}</div>}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function OwnerPlaybook({ onSelectDeal }: Props) {
  const [owners,       setOwners]       = useState<{ name: string; openDeals: number }[]>([])
  const [selectedOwner,setSelectedOwner]= useState<string | null>(null)
  const [data,         setData]         = useState<ChecklistData | null>(null)
  const [loading,      setLoading]      = useState(false)
  const [completing,   setCompleting]   = useState<Set<number>>(new Set())

  // Load owners list on mount
  useEffect(() => {
    fetch('/api/owners/checklist')
      .then(r => r.json())
      .then(d => {
        setOwners(d.owners ?? [])
        if (d.owners?.length > 0 && !selectedOwner) {
          setSelectedOwner(d.owners[0].name)
        }
      })
  }, [])

  const loadChecklist = useCallback(async (owner: string) => {
    setLoading(true)
    const res = await fetch(`/api/owners/checklist?ownerName=${encodeURIComponent(owner)}`)
    const d   = await res.json()
    setData(d.checklist ?? null)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (selectedOwner) loadChecklist(selectedOwner)
  }, [selectedOwner, loadChecklist])

  const handleComplete = async (activityId: number, note: string) => {
    setCompleting(prev => new Set(prev).add(activityId))
    await fetch(`/api/activities/${activityId}/complete`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ note }),
    })
    setCompleting(prev => { const s = new Set(prev); s.delete(activityId); return s })
    if (selectedOwner) loadChecklist(selectedOwner)
  }

  const stats = data?.stats

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div>
          <h2 className="text-base font-bold text-slate-100">Playbooks</h2>
          <p className="text-xs text-slate-500">Checklist semanal por owner · próximos 7 dias</p>
        </div>
        <button
          onClick={() => selectedOwner && loadChecklist(selectedOwner)}
          className="p-2 text-slate-500 hover:text-slate-300 transition-colors rounded-lg hover:bg-white/[0.05]"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── Owner tabs ────────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 flex gap-1 px-4 py-2 overflow-x-auto"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        {owners.map(o => (
          <button
            key={o.name}
            onClick={() => setSelectedOwner(o.name)}
            className={`flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              selectedOwner === o.name
                ? 'glass-accent text-indigo-300 border border-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]'
            }`}
          >
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
              selectedOwner === o.name ? 'bg-indigo-600' : 'bg-slate-700'
            } text-white`}>
              {o.name.slice(0, 2).toUpperCase()}
            </div>
            {o.name.split(' ')[0]}
            <span className="text-[10px] opacity-60">{o.openDeals}</span>
          </button>
        ))}
      </div>

      {/* ── Stats bar ─────────────────────────────────────────────────────── */}
      {stats && (
        <div
          className="flex-shrink-0 flex gap-4 px-6 py-2.5"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}
        >
          {[
            { label: 'Atrasadas',  val: stats.overdueCount,  color: 'text-red-400',    dot: 'bg-red-500'    },
            { label: 'Hoje',       val: stats.todayCount,    color: 'text-amber-400',  dot: 'bg-amber-500'  },
            { label: 'Esta semana',val: stats.weekCount,     color: 'text-sky-400',    dot: 'bg-sky-500'    },
            { label: 'Reuniões',   val: stats.meetingsCount, color: 'text-indigo-400', dot: 'bg-indigo-500' },
            { label: 'Em risco',   val: stats.highRiskCount, color: 'text-rose-400',   dot: 'bg-rose-500'   },
          ].map(({ label, val, color, dot }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
              <span className={`text-sm font-bold ${color}`}>{val}</span>
              <span className="text-[10px] text-slate-500">{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-6 py-5 space-y-6">

        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }} />
            ))}
          </div>
        ) : !data ? (
          <div className="flex items-center justify-center h-32 text-slate-500 text-sm">
            Selecione um owner para ver o checklist
          </div>
        ) : (
          <>
            {/* Overdue */}
            <Section
              title="Atrasadas"
              icon={<AlertTriangle size={12} />}
              count={data.overdue.length}
              color="text-red-400"
            >
              {data.overdue.map(item => (
                <ChecklistCard
                  key={item.id}
                  item={item}
                  onComplete={handleComplete}
                  onSelectDeal={id => { onSelectDeal(id) }}
                  completing={completing.has(item.id)}
                />
              ))}
            </Section>

            {/* Today */}
            <Section
              title="Hoje"
              icon={<Clock size={12} />}
              count={data.today.length + data.calendarMeetings.filter(m => {
                if (!m.start) return false
                try { return isToday(parseISO(m.start)) } catch { return false }
              }).length}
              color="text-amber-400"
            >
              {/* Calendar meetings today */}
              {data.calendarMeetings
                .filter(m => { try { return m.start && isToday(parseISO(m.start)) } catch { return false } })
                .map(m => (
                  <MeetingCard key={m.eventId} meeting={m} onSelectDeal={onSelectDeal} />
                ))
              }
              {data.today.map(item => (
                <ChecklistCard
                  key={item.id}
                  item={item}
                  onComplete={handleComplete}
                  onSelectDeal={onSelectDeal}
                  completing={completing.has(item.id)}
                />
              ))}
            </Section>

            {/* This week */}
            <Section
              title="Esta semana"
              icon={<Calendar size={12} />}
              count={data.week.length + data.calendarMeetings.filter(m => {
                if (!m.start) return false
                try {
                  const d = parseISO(m.start)
                  return !isToday(d) && !isPast(d)
                } catch { return false }
              }).length}
              color="text-sky-400"
            >
              {/* Calendar meetings this week (not today) */}
              {data.calendarMeetings
                .filter(m => {
                  try {
                    if (!m.start) return false
                    const d = parseISO(m.start)
                    return !isToday(d) && !isPast(d)
                  } catch { return false }
                })
                .map(m => (
                  <MeetingCard key={m.eventId} meeting={m} onSelectDeal={onSelectDeal} />
                ))
              }
              {data.week.map(item => (
                <ChecklistCard
                  key={item.id}
                  item={item}
                  onComplete={handleComplete}
                  onSelectDeal={onSelectDeal}
                  completing={completing.has(item.id)}
                />
              ))}
            </Section>

            {/* Later */}
            <Section
              title="Próximas"
              icon={<ChevronRight size={12} />}
              count={data.later.length}
              color="text-slate-400"
              defaultOpen={false}
            >
              {data.later.map(item => (
                <ChecklistCard
                  key={item.id}
                  item={item}
                  onComplete={handleComplete}
                  onSelectDeal={onSelectDeal}
                  completing={completing.has(item.id)}
                />
              ))}
            </Section>

            {/* High risk deals needing attention */}
            <Section
              title="Deals em risco crítico"
              icon={<AlertTriangle size={12} />}
              count={data.highRisk.length}
              color="text-rose-400"
              defaultOpen={false}
            >
              {data.highRisk.map((deal: any) => (
                <button
                  key={deal.dealId}
                  onClick={() => onSelectDeal(deal.dealId)}
                  className="w-full flex items-start gap-3 px-4 py-3 rounded-xl text-left transition-colors hover:bg-white/[0.05]"
                  style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}
                >
                  <AlertTriangle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-100 truncate">{deal.accountName}</span>
                      <span className="text-xs font-bold text-red-400 ml-auto">{fmt(deal.amount)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5 flex-wrap">
                      <span>{STAGE_LABELS[deal.stage] || deal.stage}</span>
                      <span>·</span>
                      <span className="text-red-400 font-medium">Score {deal.riskScore}</span>
                      {deal.daysInCurrentStage > 0 && (
                        <>
                          <span>·</span>
                          <span>{deal.daysInCurrentStage}d no estágio</span>
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={13} className="text-slate-600 flex-shrink-0 mt-0.5" />
                </button>
              ))}
            </Section>

            {/* Empty state */}
            {data.overdue.length === 0 &&
             data.today.length === 0 &&
             data.week.length === 0 &&
             data.calendarMeetings.length === 0 &&
             data.highRisk.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <CheckCircle2 size={40} className="text-emerald-500/40 mb-4" />
                <p className="text-sm font-semibold text-slate-300">Tudo em dia! 🎉</p>
                <p className="text-xs text-slate-600 mt-1">
                  {selectedOwner} não tem tarefas pendentes esta semana.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
