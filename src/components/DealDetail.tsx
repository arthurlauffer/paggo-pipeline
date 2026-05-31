'use client'

import { useState, useEffect, useRef } from 'react'
import { X, AlertCircle, Activity, Calendar, User, Zap, MessageSquare, Send, AtSign } from 'lucide-react'
import { RiskBadge } from './RiskBadge'
import { formatDistanceToNow, format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Deal, Activity as ActivityType, Stage, RiskFlag, Comment } from '@/lib/types'
import { VALID_TRANSITIONS, STAGE_COLORS, TEAM_MEMBERS } from '@/lib/types'

function fmt(n: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
}

function relDate(iso: string) {
  try { return formatDistanceToNow(parseISO(iso), { locale: ptBR, addSuffix: true }) } catch { return iso }
}

function fmtDate(iso: string) {
  try { return format(parseISO(iso), "dd/MM/yy HH:mm") } catch { return iso }
}

interface Props {
  dealId: string | null
  onClose: () => void
  onDealUpdated: () => void
  defaultTab?: Tab
}

type Tab = 'info' | 'activity' | 'comments'

export function DealDetail({ dealId, onClose, onDealUpdated, defaultTab = 'info' }: Props) {
  const [tab, setTab] = useState<Tab>(['info', 'activity', 'comments'].includes(defaultTab) ? defaultTab as Tab : 'info')

  // Reset tab whenever the deal changes or defaultTab is pushed externally
  useEffect(() => {
    setTab(defaultTab)
  }, [dealId, defaultTab])
  const [data, setData] = useState<{ deal: Deal; activities: ActivityType[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  // Modals
  const [showStageModal, setShowStageModal] = useState(false)
  const [showActivityModal, setShowActivityModal] = useState(false)
  const [showNextStepModal, setShowNextStepModal] = useState(false)
  const [showOwnerModal, setShowOwnerModal] = useState(false)
  const [showCloseModal, setShowCloseModal] = useState(false)

  useEffect(() => {
    if (!dealId) return
    setLoading(true)
    setData(null)
    fetch(`/api/deals/${dealId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
  }, [dealId])

  const refresh = () => {
    if (!dealId) return
    fetch(`/api/deals/${dealId}`)
      .then(r => r.json())
      .then(d => { setData(d); onDealUpdated() })
  }

  if (!dealId) return null

  const deal = data?.deal
  const activities = data?.activities || []
  const flags: RiskFlag[] = (() => { try { return JSON.parse(deal?.riskFlags || '[]') } catch { return [] } })()
  const nextSteps = activities.filter(a => a.isNextStep && !a.isCompleted)
  const loggedActivities = activities.filter(a => !a.isNextStep)

  return (
    <div className="flex flex-col h-full" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.025) 100%)', backdropFilter: 'blur(28px) saturate(150%)', WebkitBackdropFilter: 'blur(28px) saturate(150%)', borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
      {/* Header */}
      <div className="flex items-start justify-between p-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex-1 min-w-0">
          {loading || !deal ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-5 bg-slate-700 rounded w-48" />
              <div className="h-4 bg-slate-700 rounded w-32" />
            </div>
          ) : (
            <>
              <h2 className="font-semibold text-slate-100 truncate">{deal.accountName}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                  style={{ backgroundColor: `${STAGE_COLORS[deal.stage]}22`, color: STAGE_COLORS[deal.stage] }}>
                  {deal.stage}
                </span>
                <span className="text-xs text-slate-400">{deal.dealId}</span>
              </div>
            </>
          )}
        </div>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-200">
          <X size={16} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        {(['info', 'activity', 'comments'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              tab === t ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t === 'info' ? 'Info' : t === 'activity' ? 'Atividades' : '💬 Notas'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {loading || !deal ? (
          <div className="space-y-3 animate-pulse">
            {[...Array(6)].map((_, i) => <div key={i} className="h-8 bg-white/5 rounded" />)}
          </div>
        ) : (
          <>
            {tab === 'info' && (
              <div className="space-y-4">
                {/* Risk */}
                <div>
                  <RiskBadge level={deal.riskLevel} score={deal.riskScore} flags={flags} showFlags />
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['Valor', fmt(deal.amount)],
                    ['Segmento', deal.accountSegment],
                    ['Indústria', deal.industry],
                    ['Owner', deal.ownerName],
                    ['Produto', deal.productInterest],
                    ['Fonte', deal.source],
                    ['Dias no estágio', `${deal.daysInCurrentStage}d`],
                    ['Contatos', deal.contactsLogged.toString()],
                    ['Deals anteriores', deal.previousDealsWithAccount.toString()],
                    ['Fecha em', deal.expectedCloseDate?.slice(0, 10)],
                    ['Última atividade', deal.lastActivityAt ? relDate(deal.lastActivityAt) : 'Nunca'],
                    ['Tipo', deal.lastActivityType || '—'],
                  ].map(([k, v]) => (
                    <div key={k} className="glass rounded-lg p-2">
                      <div className="text-[10px] text-slate-500">{k}</div>
                      <div className="text-xs text-slate-200 font-medium truncate">{v}</div>
                    </div>
                  ))}
                </div>

                {/* Next steps */}
                {nextSteps.length > 0 && (
                  <div>
                    <h4 className="text-xs text-slate-400 mb-2 flex items-center gap-1">
                      <Calendar size={12} /> Próximos Passos
                    </h4>
                    {nextSteps.map(ns => (
                      <div key={ns.id} className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 mb-1">
                        <div className="text-xs font-medium text-amber-300">{ns.type} · {fmtDate(ns.dueAt || ns.activityAt)}</div>
                        {ns.notes && <div className="text-xs text-slate-400 mt-0.5">{ns.notes}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === 'activity' && (
              <div className="space-y-2">
                {activities.length === 0 ? (
                  <p className="text-xs text-slate-500">Nenhuma atividade registrada.</p>
                ) : activities.map(a => (
                  <div key={a.id} className={`rounded-lg p-2.5 border ${
                    a.isNextStep ? 'bg-amber-500/10 border-amber-500/30' : 'bg-white/[0.04] border-white/[0.07]'
                  }`}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-medium text-slate-200">
                        {a.isNextStep ? '📅 ' : '✓ '}{a.type}
                      </span>
                      <span className="text-[10px] text-slate-500">{fmtDate(a.isNextStep ? (a.dueAt || a.activityAt) : a.activityAt)}</span>
                    </div>
                    {a.notes && <p className="text-xs text-slate-400">{a.notes}</p>}
                    {a.createdBy === 'agent' && (
                      <span className="text-[9px] bg-indigo-500/20 text-indigo-400 px-1 rounded">via agente IA</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {tab === 'comments' && deal && (
              <CommentsTab dealId={deal.dealId} />
            )}
          </>
        )}
      </div>

      {/* Action buttons */}
      {deal && (
        <div className="p-3 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setShowStageModal(true)}
              className="btn-secondary text-xs py-1.5 flex items-center justify-center gap-1">
              <Zap size={12} /> Mover estágio
            </button>
            <button onClick={() => setShowActivityModal(true)}
              className="btn-secondary text-xs py-1.5 flex items-center justify-center gap-1">
              <Activity size={12} /> Registrar atividade
            </button>
            <button onClick={() => setShowNextStepModal(true)}
              className="btn-secondary text-xs py-1.5 flex items-center justify-center gap-1">
              <Calendar size={12} /> Agendar passo
            </button>
            <button onClick={() => setShowOwnerModal(true)}
              className="btn-secondary text-xs py-1.5 flex items-center justify-center gap-1">
              <User size={12} /> Reatribuir
            </button>
          </div>
          <button onClick={() => setShowCloseModal(true)}
            className="w-full text-xs py-1.5 rounded-lg glass-input text-slate-300 hover:bg-white/[0.06] transition-colors flex items-center justify-center gap-1">
            <AlertCircle size={12} /> Fechar deal
          </button>
        </div>
      )}

      {/* Stage modal */}
      {showStageModal && deal && (
        <Modal title="Mover Estágio" onClose={() => setShowStageModal(false)}>
          <StageForm
            deal={deal}
            onSubmit={async (newStage, reason) => {
              setActionLoading(true)
              await fetch(`/api/deals/${deal.dealId}/stage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newStage, reason }),
              })
              setActionLoading(false)
              setShowStageModal(false)
              refresh()
            }}
            loading={actionLoading}
          />
        </Modal>
      )}

      {/* Activity modal */}
      {showActivityModal && deal && (
        <Modal title="Registrar Atividade" onClose={() => setShowActivityModal(false)}>
          <ActivityForm
            onSubmit={async (type, notes) => {
              setActionLoading(true)
              await fetch(`/api/deals/${deal.dealId}/activity`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, notes }),
              })
              setActionLoading(false)
              setShowActivityModal(false)
              refresh()
            }}
            loading={actionLoading}
          />
        </Modal>
      )}

      {/* Next step modal */}
      {showNextStepModal && deal && (
        <Modal title="Agendar Próximo Passo" onClose={() => setShowNextStepModal(false)}>
          <NextStepForm
            onSubmit={async (type, notes, dueAt) => {
              setActionLoading(true)
              await fetch(`/api/deals/${deal.dealId}/next-step`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, notes, dueAt }),
              })
              setActionLoading(false)
              setShowNextStepModal(false)
              refresh()
            }}
            loading={actionLoading}
          />
        </Modal>
      )}

      {/* Owner modal */}
      {showOwnerModal && deal && (
        <Modal title="Reatribuir Owner" onClose={() => setShowOwnerModal(false)}>
          <OwnerForm
            current={deal.ownerName}
            onSubmit={async (newOwner, reason) => {
              setActionLoading(true)
              await fetch(`/api/deals/${deal.dealId}/owner`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newOwner, reason }),
              })
              setActionLoading(false)
              setShowOwnerModal(false)
              refresh()
            }}
            loading={actionLoading}
          />
        </Modal>
      )}

      {/* Close deal modal */}
      {showCloseModal && deal && (
        <Modal title="Fechar Deal" onClose={() => setShowCloseModal(false)}>
          <CloseForm
            onSubmit={async (outcome, lostReason, notes) => {
              setActionLoading(true)
              await fetch(`/api/deals/${deal.dealId}/close`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ outcome, lostReason, notes }),
              })
              setActionLoading(false)
              setShowCloseModal(false)
              onClose()
              onDealUpdated()
            }}
            loading={actionLoading}
          />
        </Modal>
      )}
    </div>
  )
}

// ---- Sub-components ----

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="glass-menu rounded-xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <h3 className="font-medium text-slate-100">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={16} /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

function StageForm({ deal, onSubmit, loading }: { deal: Deal; onSubmit: (s: Stage, r: string) => void; loading: boolean }) {
  const [stage, setStage] = useState<Stage | ''>('')
  const [reason, setReason] = useState('')
  const validNext = VALID_TRANSITIONS[deal.stage]
  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-400">Estágio atual: <span className="text-slate-200 font-medium">{deal.stage}</span></div>
      <select value={stage} onChange={e => setStage(e.target.value as Stage)}
        className="w-full glass-input text-slate-200 rounded-lg px-3 py-2 text-sm">
        <option value="">Selecionar novo estágio…</option>
        {validNext.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <textarea value={reason} onChange={e => setReason(e.target.value)}
        placeholder="Motivo (opcional)" rows={2}
        className="w-full glass-input text-slate-200 rounded-lg px-3 py-2 text-sm resize-none" />
      <button disabled={!stage || loading} onClick={() => stage && onSubmit(stage, reason)}
        className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium text-white transition-colors">
        {loading ? 'Salvando…' : 'Confirmar'}
      </button>
    </div>
  )
}

function ActivityForm({ onSubmit, loading }: { onSubmit: (t: string, n: string) => void; loading: boolean }) {
  const [type, setType] = useState('CALL')
  const [notes, setNotes] = useState('')
  return (
    <div className="space-y-3">
      <select value={type} onChange={e => setType(e.target.value)}
        className="w-full glass-input text-slate-200 rounded-lg px-3 py-2 text-sm">
        {['CALL', 'EMAIL', 'MEETING', 'NOTE'].map(t => <option key={t}>{t}</option>)}
      </select>
      <textarea value={notes} onChange={e => setNotes(e.target.value)}
        placeholder="Notas sobre a atividade…" rows={3}
        className="w-full glass-input text-slate-200 rounded-lg px-3 py-2 text-sm resize-none" />
      <button disabled={loading} onClick={() => onSubmit(type, notes)}
        className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium text-white transition-colors">
        {loading ? 'Salvando…' : 'Registrar'}
      </button>
    </div>
  )
}

function NextStepForm({ onSubmit, loading }: { onSubmit: (t: string, n: string, d: string) => void; loading: boolean }) {
  const [type, setType] = useState('CALL')
  const [notes, setNotes] = useState('')
  const tomorrow = new Date('2026-05-21T09:00')
  const [dueAt, setDueAt] = useState(tomorrow.toISOString().slice(0, 16))
  return (
    <div className="space-y-3">
      <select value={type} onChange={e => setType(e.target.value)}
        className="w-full glass-input text-slate-200 rounded-lg px-3 py-2 text-sm">
        {['CALL', 'EMAIL', 'MEETING', 'NOTE'].map(t => <option key={t}>{t}</option>)}
      </select>
      <input type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)}
        className="w-full glass-input text-slate-200 rounded-lg px-3 py-2 text-sm" />
      <textarea value={notes} onChange={e => setNotes(e.target.value)}
        placeholder="Descrição do próximo passo…" rows={2}
        className="w-full glass-input text-slate-200 rounded-lg px-3 py-2 text-sm resize-none" />
      <button disabled={!dueAt || loading} onClick={() => dueAt && onSubmit(type, notes, new Date(dueAt).toISOString())}
        className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium text-white transition-colors">
        {loading ? 'Salvando…' : 'Agendar'}
      </button>
    </div>
  )
}

function OwnerForm({ current, onSubmit, loading }: { current: string; onSubmit: (o: string, r: string) => void; loading: boolean }) {
  const [owner, setOwner] = useState('')
  const [reason, setReason] = useState('')
  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-400">Atual: <span className="text-slate-200">{current}</span></div>
      <input value={owner} onChange={e => setOwner(e.target.value)}
        placeholder="Nome do novo owner…"
        className="w-full glass-input text-slate-200 rounded-lg px-3 py-2 text-sm" />
      <input value={reason} onChange={e => setReason(e.target.value)}
        placeholder="Motivo (opcional)"
        className="w-full glass-input text-slate-200 rounded-lg px-3 py-2 text-sm" />
      <button disabled={!owner.trim() || loading} onClick={() => owner.trim() && onSubmit(owner.trim(), reason)}
        className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium text-white transition-colors">
        {loading ? 'Salvando…' : 'Reatribuir'}
      </button>
    </div>
  )
}

// ─── Comments @mention helpers ────────────────────────────────────────────────

interface MentionMember { id: string; name: string; initials: string; color: string; role?: string }
interface MentionTeam   { id: string; name: string; color: string; memberIds: string[] }

function renderCommentText(content: string, names: string[]) {
  const valid = names.filter(Boolean)
  if (!valid.length) return <span>{content}</span>
  const escaped = valid
    .slice()
    .sort((a, b) => b.length - a.length) // longest first to avoid partial matches
    .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const regex = new RegExp(`(@(?:${escaped.join('|')}))`, 'g')
  const parts = content.split(regex)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('@') && valid.some(n => part === `@${n}`) ? (
          <span key={i} className="bg-indigo-500/20 text-indigo-400 font-medium px-0.5 rounded">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

function MemberAvatar({ name, color }: { name: string; color: string }) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className={`w-6 h-6 rounded-full ${color} flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0`}>
      {initials}
    </div>
  )
}

function CommentsTab({ dealId }: { dealId: string }) {
  const [comments, setComments]       = useState<Comment[]>([])
  const [loading, setLoading]         = useState(true)
  const [posting, setPosting]         = useState(false)
  const [text, setText]               = useState('')
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [members, setMembers]         = useState<MentionMember[]>([])
  const [teams, setTeams]             = useState<MentionTeam[]>([])
  const [me, setMe]                   = useState<{ id: string; name: string } | null>(null)
  const textareaRef                   = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/deals/${dealId}/comments`)
      .then(r => r.json())
      .then(d => { setComments(d.comments || []); setLoading(false) })
  }, [dealId])

  // Load workspace members + teams for @mentions (fall back to the static crew).
  useEffect(() => {
    fetch('/api/workspace/members')
      .then(r => r.json())
      .then(d => setMembers((d.members || []) as MentionMember[]))
      .catch(() => setMembers(TEAM_MEMBERS.map(m => ({ id: m.id, name: m.name, initials: m.initials, color: m.color, role: m.role }))))
    fetch('/api/workspace/teams')
      .then(r => r.json())
      .then(d => setTeams((d.teams || []) as MentionTeam[]))
      .catch(() => setTeams([]))
    // Identify the logged-in user so their comments are attributed to them
    // (and so they don't appear in their own @mention list).
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => { if (d?.authed && d.memberId) setMe({ id: d.memberId, name: d.memberName || d.displayName || 'Você' }) })
      .catch(() => {})
  }, [])

  // Mentionable entities: colleagues (excluding yourself) + teams.
  type Mentionable =
    | { kind: 'member'; id: string; name: string; initials: string; color: string; sub: string }
    | { kind: 'team';   id: string; name: string; color: string; sub: string; memberIds: string[] }

  const mentionables: Mentionable[] = [
    ...members
      .filter(m => m.id !== 'user-0' && m.id !== me?.id)
      .map(m => ({ kind: 'member' as const, id: m.id, name: m.name, initials: m.initials, color: m.color, sub: m.role || 'Membro' })),
    ...teams.map(t => ({
      kind: 'team' as const, id: t.id, name: t.name, color: t.color,
      memberIds: t.memberIds,
      sub: `Equipe · ${t.memberIds.length} ${t.memberIds.length === 1 ? 'membro' : 'membros'}`,
    })),
  ]

  // All names that should be highlighted in rendered comments.
  const highlightNames = [...members.map(m => m.name), ...teams.map(t => t.name)]

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setText(val)
    const pos = e.target.selectionStart ?? val.length
    const before = val.slice(0, pos)
    const m = before.match(/@([\wÀ-ſ ]*)$/)
    setMentionQuery(m ? m[1].toLowerCase().trimStart() : null)
  }

  const insertMention = (name: string) => {
    const ta = textareaRef.current
    if (!ta) return
    const pos = ta.selectionStart ?? text.length
    const before = text.slice(0, pos)
    const after   = text.slice(pos)
    const atIdx   = before.search(/@[\wÀ-ſ ]*$/)
    if (atIdx === -1) return
    const newText = before.slice(0, atIdx) + `@${name} ` + after
    setText(newText)
    setMentionQuery(null)
    setTimeout(() => {
      ta.focus()
      const newPos = atIdx + name.length + 2
      ta.setSelectionRange(newPos, newPos)
    }, 0)
  }

  const filteredMentions = mentionQuery !== null
    ? mentionables.filter(m => m.name.toLowerCase().includes(mentionQuery)).slice(0, 6)
    : []

  // Resolve @names in text → member IDs (teams expand to all their members).
  const extractMentioned = (t: string): string[] => {
    const ids = new Set<string>()
    for (const m of members) if (t.includes(`@${m.name}`)) ids.add(m.id)
    for (const tm of teams) if (t.includes(`@${tm.name}`)) tm.memberIds.forEach(id => ids.add(id))
    return [...ids]
  }

  const handleSubmit = async () => {
    if (!text.trim() || posting) return
    setPosting(true)
    const res = await fetch(`/api/deals/${dealId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: text.trim(),
        mentionedUsers: extractMentioned(text),
        ...(me ? { authorId: me.id, authorName: me.name } : {}),
      }),
    })
    const data = await res.json()
    if (data.comment) setComments(prev => [data.comment, ...prev])
    setText('')
    setMentionQuery(null)
    setPosting(false)
  }

  // For a comment's footer: which teams + members were notified.
  const mentioned = (comment: Comment): { teams: MentionTeam[]; members: MentionMember[] } => {
    try {
      const ids: string[] = JSON.parse(comment.mentionedUsers || '[]')
      const teamsHit = teams.filter(t => comment.content.includes(`@${t.name}`))
      const teamMemberIds = new Set(teamsHit.flatMap(t => t.memberIds))
      const directMembers = members.filter(m => ids.includes(m.id) && !teamMemberIds.has(m.id) && comment.content.includes(`@${m.name}`))
      return { teams: teamsHit, members: directMembers }
    } catch { return { teams: [], members: [] } }
  }

  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1,2,3].map(i => <div key={i} className="h-14 bg-white/5 rounded-lg" />)}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Mention hint */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <AtSign size={11} className="text-slate-500" />
        <span className="text-[10px] text-slate-500">Mencione:</span>
        {mentionables.slice(0, 8).map(m => (
          <button
            key={m.id}
            onClick={() => {
              const ta = textareaRef.current
              if (!ta) return
              const pos = ta.selectionStart ?? text.length
              const newText = text.slice(0, pos) + `@${m.name} ` + text.slice(pos)
              setText(newText)
              setTimeout(() => ta.focus(), 0)
            }}
            className="text-[10px] text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 px-1.5 py-0.5 rounded transition-colors"
          >
            @{m.kind === 'team' ? m.name : m.name.split(' ')[0]}
          </button>
        ))}
      </div>

      {/* Input area */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit()
            if (e.key === 'Escape') setMentionQuery(null)
          }}
          placeholder="Adicione uma nota ou @mencione um colega ou equipe…"
          rows={3}
          className="w-full glass-input text-slate-200 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500/60 resize-none"
        />

        {/* @mention dropdown */}
        {mentionQuery !== null && filteredMentions.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-1 glass-menu rounded-xl shadow-xl overflow-hidden z-10">
            {filteredMentions.map(m => (
              <button
                key={m.id}
                onMouseDown={e => { e.preventDefault(); insertMention(m.name) }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.07] transition-colors text-left"
              >
                {m.kind === 'team' ? (
                  <span className={`w-6 h-6 rounded-md ${m.color} flex items-center justify-center flex-shrink-0`}>
                    <AtSign size={12} className="text-white" />
                  </span>
                ) : (
                  <MemberAvatar name={m.name} color={m.color} />
                )}
                <div>
                  <div className="text-xs text-slate-200">{m.name}</div>
                  <div className="text-[10px] text-slate-500">{m.sub}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-600">⌘+Enter para enviar</span>
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || posting}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-medium text-white rounded-lg transition-colors"
        >
          <Send size={11} />
          {posting ? 'Enviando…' : 'Comentar'}
        </button>
      </div>

      {/* Comments list */}
      {comments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <MessageSquare size={24} className="text-slate-700 mb-2" />
          <p className="text-xs text-slate-500">Nenhum comentário ainda. Seja o primeiro!</p>
        </div>
      ) : (
        <div className="space-y-2 mt-1">
          {comments.map(c => {
            const hit = mentioned(c)
            const hasNotified = hit.teams.length > 0 || hit.members.length > 0
            return (
              <div key={c.id} className="glass rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center text-[9px] font-bold text-white">
                    {c.authorName.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-xs font-medium text-slate-200">{c.authorName}</span>
                  <span className="text-[10px] text-slate-500">
                    {relDate(c.createdAt)}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {renderCommentText(c.content, highlightNames)}
                </p>
                {hasNotified && (
                  <div className="flex items-center gap-2 mt-2 pt-2 flex-wrap" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                    <span className="text-[10px] text-slate-500">Notificou:</span>
                    {hit.teams.map(t => (
                      <div key={t.id} className="flex items-center gap-1">
                        <span className={`w-5 h-5 rounded-md ${t.color} flex items-center justify-center`}>
                          <AtSign size={10} className="text-white" />
                        </span>
                        <span className="text-[10px] text-slate-400">{t.name}</span>
                        <span className="text-[9px] text-slate-600">· {t.memberIds.length}</span>
                      </div>
                    ))}
                    {hit.members.map(m => (
                      <div key={m.id} className="flex items-center gap-1">
                        <MemberAvatar name={m.name} color={m.color} />
                        <span className="text-[10px] text-slate-400">{m.name.split(' ')[0]}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CloseForm({ onSubmit, loading }: { onSubmit: (o: string, r: string, n: string) => void; loading: boolean }) {
  const [outcome, setOutcome] = useState('CLOSED_WON')
  const [lostReason, setLostReason] = useState('NO_BUDGET')
  const [notes, setNotes] = useState('')
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setOutcome('CLOSED_WON')}
          className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
            outcome === 'CLOSED_WON' ? 'bg-emerald-600 border-emerald-500 text-white' : 'border-white/20 text-slate-400'
          }`}>
          ✓ Ganho
        </button>
        <button onClick={() => setOutcome('CLOSED_LOST')}
          className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
            outcome === 'CLOSED_LOST' ? 'bg-red-600 border-red-500 text-white' : 'border-white/20 text-slate-400'
          }`}>
          ✗ Perdido
        </button>
      </div>
      {outcome === 'CLOSED_LOST' && (
        <select value={lostReason} onChange={e => setLostReason(e.target.value)}
          className="w-full glass-input text-slate-200 rounded-lg px-3 py-2 text-sm">
          <option value="NO_BUDGET">Sem orçamento</option>
          <option value="LOST_TO_COMPETITOR">Perdido para concorrente</option>
          <option value="NO_DECISION">Sem decisão</option>
          <option value="OTHER">Outro</option>
        </select>
      )}
      <textarea value={notes} onChange={e => setNotes(e.target.value)}
        placeholder="Notas sobre o fechamento…" rows={2}
        className="w-full glass-input text-slate-200 rounded-lg px-3 py-2 text-sm resize-none" />
      <button disabled={loading} onClick={() => onSubmit(outcome, lostReason, notes)}
        className={`w-full py-2 rounded-lg text-sm font-medium text-white transition-colors ${
          outcome === 'CLOSED_WON' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'
        } disabled:opacity-50`}>
        {loading ? 'Salvando…' : outcome === 'CLOSED_WON' ? 'Fechar como Ganho' : 'Fechar como Perdido'}
      </button>
    </div>
  )
}
