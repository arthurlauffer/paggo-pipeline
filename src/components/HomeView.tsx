'use client'

import { useState, useEffect, useRef } from 'react'
import {
  ArrowUp, TrendingUp, TrendingDown, Zap, Plus,
  AlertTriangle, Trophy, RefreshCw, ChevronRight,
  CalendarDays, BarChart2, Users, Mail,
} from 'lucide-react'
import { CalendarWidget } from './CalendarWidget'
import { format, parseISO, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Stage } from '@/lib/types'
import { STAGE_COLORS } from '@/lib/types'

// ─── Daily greeting rotation ─────────────────────────────────────────────────

const GREETINGS = [
  'Olá, {name}. O pipeline não vai fechar sozinho.',
  'E aí, {name}. Quem vai avançar hoje?',
  'Bem-vindo de volta, {name}. Bora fechar uns contratos?',
  '{name}, seu próximo contrato está aqui dentro. Bora achar.',
  'De volta, {name}. Hoje é dia de follow-up ou de proposta?',
  'Pronto, {name}. CRM aberto. Que oportunidade a gente fecha hoje?',
  '{name}, tem cliente esperando resposta sua agora mesmo.',
  'Bem-vindo, {name}. Qual oportunidade avança hoje?',
  '{name}, cada acesso conta. O que a gente registra hoje?',
  'Tudo pronto, {name}. Bora transformar oportunidade em contrato.',
]

function getDailyGreeting(name: string): string {
  const now  = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  const day  = Math.floor((now.getTime() - start.getTime()) / 86_400_000)
  return GREETINGS[day % GREETINGS.length].replace(/{name}/g, name)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `R$ ${(n / 1_000).toFixed(0)}K`
  return `R$ ${Math.round(n)}`
}
function relTime(iso: string) {
  try { return formatDistanceToNow(parseISO(iso), { locale: ptBR, addSuffix: true }) } catch { return '' }
}
function shortDate(iso: string) {
  try { return format(parseISO(iso), 'dd/MM', { locale: ptBR }) } catch { return '' }
}

const STAGE_LABEL: Partial<Record<Stage, string>> = {
  LEAD: 'Lead', QUALIFIED: 'Qualificado', DISCOVERY: 'Discovery',
  DEMO: 'Demo', PROPOSAL: 'Proposta', NEGOTIATION: 'Negociação',
  CLOSED_WON: 'Ganho', CLOSED_LOST: 'Perdido',
}
const SEGMENT_BADGE: Record<string, string> = {
  SMB: 'bg-slate-700 text-slate-300',
  MID: 'bg-blue-900/60 text-blue-300',
  ENT: 'bg-purple-900/60 text-purple-300',
}

// ─── Quick actions ────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { icon: CalendarDays, label: 'Prep próxima reunião',    msg: 'Quais deals têm reuniões ou próximos passos agendados esta semana?' },
  { icon: BarChart2,    label: 'Resumo do pipeline',      msg: 'Me dê um resumo executivo da saúde do pipeline atual por segmento e estágio.' },
  { icon: AlertTriangle,label: 'Deals em risco crítico',  msg: 'Quais são os 10 deals com maior risco agora e o que precisa ser feito?' },
  { icon: Mail,         label: 'Follow-ups pendentes',    msg: 'Quais deals precisam de follow-up urgente esta semana? Liste com contexto e sugira ação.' },
  { icon: Users,        label: 'Performance dos owners',  msg: 'Me mostre o ranking de performance dos owners com pipeline, risco e velocidade de fechamento.' },
  { icon: TrendingUp,   label: 'Deals para fechar',       msg: 'Quais deals têm maior probabilidade de fechar este mês? Ordene por probabilidade e valor.' },
]

// ─── Types ────────────────────────────────────────────────────────────────────

interface DigestData {
  closedWon:           any[]
  closedLost:          any[]
  wonValueThisWeek:    number
  lostValueThisWeek:   number
  activitiesThisWeek:  number
  activitiesByType:    { type: string; c: number }[]
  newDealsThisWeek:    number
  newDealsValue:       number
  topOwners:           { ownerName: string; dealCount: number; totalValue: number; highRisk: number }[]
  highRiskDeals:       any[]
  recentStageChanges:  any[]
  openCount:           number
  openValue:           number
  highRisk:            number
  overdue:             number
}

interface Props {
  onAskAgent: (msg: string) => void
  onViewChange: (view: 'pipeline' | 'kanban' | 'charts') => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function HomeView({ onAskAgent, onViewChange }: Props) {
  const [chatInput,   setChatInput]   = useState('')
  const [digest,      setDigest]      = useState<DigestData | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [greetingMsg, setGreetingMsg] = useState('')
  const [dateLabel,   setDateLabel]   = useState('')
  const textareaRef  = useRef<HTMLTextAreaElement>(null)

  // All date/time logic is client-only to avoid SSR hydration mismatch
  useEffect(() => {
    setDateLabel(format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR }))

    // Fetch connected Google user name for personalised greeting
    fetch('/api/calendar/status')
      .then(r => r.json())
      .then(({ displayName, email }: { displayName: string | null; email: string | null }) => {
        // Prefer display name; fall back to first segment of email; then generic
        const name = displayName
          || (email ? email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : null)
          || 'Você'
        setGreetingMsg(getDailyGreeting(name))
      })
      .catch(() => setGreetingMsg(getDailyGreeting('Você')))
  }, [])

  const fetchDigest = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/digest')
      setDigest(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchDigest() }, [])

  const handleSubmit = () => {
    const text = chatInput.trim()
    if (!text) return
    onAskAgent(text)
    setChatInput('')
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-4xl mx-auto px-6 py-12 space-y-10">

        {/* ── Greeting + Chat ─────────────────────────────────────────────── */}
        <div>
          {greetingMsg && (
            <h1 className="text-3xl font-bold text-slate-100 mb-1 leading-snug">
              {greetingMsg}
            </h1>
          )}
          {dateLabel && (
            <p className="text-sm text-slate-500 mb-6 capitalize">{dateLabel}</p>
          )}

          {/* Chat input */}
          <div className="glass-strong rounded-2xl p-4 transition-colors">
            <textarea
              ref={textareaRef}
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
              }}
              placeholder="Pergunte qualquer coisa sobre o pipeline…"
              rows={3}
              className="w-full bg-transparent text-slate-200 text-sm resize-none focus:outline-none placeholder:text-slate-500 leading-relaxed"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[11px] text-slate-600">Enter para enviar · Shift+Enter para nova linha</span>
              <button
                onClick={handleSubmit}
                disabled={!chatInput.trim()}
                className="w-8 h-8 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl flex items-center justify-center transition-colors"
              >
                <ArrowUp size={14} className="text-white" />
              </button>
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2 mt-4">
            {QUICK_ACTIONS.map(({ icon: Icon, label, msg }) => (
              <button
                key={label}
                onClick={() => onAskAgent(msg)}
                className="flex items-center gap-1.5 px-3 py-1.5 glass-md hover:bg-white/[0.06] text-slate-300 hover:text-slate-100 text-xs rounded-full transition-all"
              >
                <Icon size={11} className="text-indigo-400" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Google Calendar ─────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-200">Agenda</h2>
              <p className="text-xs text-slate-500">Próximos 14 dias</p>
            </div>
          </div>
          <CalendarWidget />
        </div>

        {/* ── Daily Digest header ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-200">Daily Digest</h2>
            <p className="text-xs text-slate-500">Últimos 7 dias</p>
          </div>
          <button
            onClick={fetchDigest}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>

        {loading ? (
          <DigestSkeleton />
        ) : digest ? (
          <>
            {/* ── Weekly KPI strip ──────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiChip
                icon={<TrendingUp size={16} />}
                label="Fechados (ganhos)"
                value={fmt(digest.wonValueThisWeek)}
                sub={`${digest.closedWon.length} deal${digest.closedWon.length !== 1 ? 's' : ''}`}
                color="text-emerald-400" bg="bg-emerald-500/10"
              />
              <KpiChip
                icon={<TrendingDown size={16} />}
                label="Perdidos"
                value={String(digest.closedLost.length)}
                sub={fmt(digest.lostValueThisWeek)}
                color="text-red-400" bg="bg-red-500/10"
              />
              <KpiChip
                icon={<Zap size={16} />}
                label="Atividades"
                value={String(digest.activitiesThisWeek)}
                sub="esta semana"
                color="text-amber-400" bg="bg-amber-500/10"
              />
              <KpiChip
                icon={<Plus size={16} />}
                label="Novos deals"
                value={String(digest.newDealsThisWeek)}
                sub={fmt(digest.newDealsValue)}
                color="text-sky-400" bg="bg-sky-500/10"
              />
            </div>

            {/* ── Main 2-col grid ───────────────────────────────────────── */}
            <div className="grid md:grid-cols-2 gap-6">

              {/* Owner ranking */}
              <Card title="Ranking de Owners" icon={<Trophy size={14} className="text-amber-400" />}>
                {digest.topOwners.length === 0 ? (
                  <Empty />
                ) : (
                  <div className="space-y-2">
                    {digest.topOwners.map((o, i) => (
                      <div key={o.ownerName} className="flex items-center gap-3">
                        <span className={`text-xs font-bold w-5 text-center flex-shrink-0 ${
                          i === 0 ? 'text-amber-400' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-amber-700' : 'text-slate-600'
                        }`}>{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-200 truncate font-medium">{o.ownerName}</span>
                            <span className="text-xs font-semibold text-slate-100 ml-2 flex-shrink-0">{fmt(o.totalValue)}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {/* Value bar */}
                            <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-indigo-500 rounded-full transition-all"
                                style={{ width: `${Math.round((o.totalValue / (digest.topOwners[0]?.totalValue || 1)) * 100)}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-slate-500 flex-shrink-0">{o.dealCount} deals</span>
                            {o.highRisk > 0 && (
                              <span className="text-[10px] text-red-400 flex-shrink-0">🔴 {o.highRisk}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <FooterLink label="Ver pipeline completo" onClick={() => onViewChange('pipeline')} />
              </Card>

              {/* Recently closed */}
              <Card title="Fechados esta semana" icon={<TrendingUp size={14} className="text-emerald-400" />}>
                {digest.closedWon.length === 0 && digest.closedLost.length === 0 ? (
                  <Empty label="Nenhum deal fechado nos últimos 7 dias" />
                ) : (
                  <div className="space-y-2">
                    {[
                      ...digest.closedWon.map(d => ({ ...d, won: true })),
                      ...digest.closedLost.map(d => ({ ...d, won: false })),
                    ]
                      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                      .slice(0, 7)
                      .map(d => (
                        <div key={d.dealId} className="flex items-center gap-2.5">
                          <span className={`flex-shrink-0 text-base leading-none`}>
                            {d.won ? '✅' : '❌'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-slate-200 truncate font-medium">{d.accountName}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${SEGMENT_BADGE[d.accountSegment] || ''}`}>
                                {d.accountSegment}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                              <span className={d.won ? 'text-emerald-400 font-medium' : 'text-red-400'}>{fmt(d.amount)}</span>
                              <span>·</span>
                              <span>{d.ownerName}</span>
                              <span>·</span>
                              <span>{shortDate(d.updatedAt)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
                <FooterLink label="Ver todos os deals" onClick={() => onViewChange('pipeline')} />
              </Card>
            </div>

            {/* ── Second 2-col grid ─────────────────────────────────────── */}
            <div className="grid md:grid-cols-2 gap-6">

              {/* High risk deals */}
              <Card title="Em risco crítico" icon={<AlertTriangle size={14} className="text-red-400" />}>
                {digest.highRiskDeals.length === 0 ? (
                  <Empty label="Nenhum deal em risco crítico 🎉" />
                ) : (
                  <div className="space-y-2">
                    {digest.highRiskDeals.map(d => (
                      <div key={d.dealId} className="flex items-start gap-2.5">
                        <span className="flex-shrink-0 text-xs font-bold text-red-400 mt-0.5 w-7 text-center">
                          {d.riskScore}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-200 truncate font-medium">{d.accountName}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5 flex-wrap">
                            <span
                              className="font-medium"
                              style={{ color: STAGE_COLORS[d.stage as Stage] }}
                            >{STAGE_LABEL[d.stage as Stage] || d.stage}</span>
                            <span>·</span>
                            <span>{fmt(d.amount)}</span>
                            <span>·</span>
                            <span className={d.daysInCurrentStage > 30 ? 'text-red-400' : ''}>{d.daysInCurrentStage}d no estágio</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <FooterLink label="Ver todos os deals em risco" onClick={() => {
                  onViewChange('pipeline')
                }} />
              </Card>

              {/* Recent stage changes / activity feed */}
              <Card title="Movimentações recentes" icon={<Zap size={14} className="text-indigo-400" />}>
                {digest.recentStageChanges.length === 0 && digest.activitiesByType.length === 0 ? (
                  <Empty label="Nenhuma movimentação esta semana" />
                ) : digest.recentStageChanges.length > 0 ? (
                  <div className="space-y-2">
                    {digest.recentStageChanges.map((sc, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5" />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs text-slate-200 truncate font-medium block">{sc.accountName || sc.dealId}</span>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5 flex-wrap">
                            <span style={{ color: STAGE_COLORS[sc.fromStage as Stage] }}>{STAGE_LABEL[sc.fromStage as Stage] || sc.fromStage}</span>
                            <span className="text-slate-600">→</span>
                            <span style={{ color: STAGE_COLORS[sc.toStage as Stage] }}>{STAGE_LABEL[sc.toStage as Stage] || sc.toStage}</span>
                            <span>·</span>
                            <span>{relTime(sc.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  // Fallback: show activity type breakdown
                  <div className="space-y-2">
                    {digest.activitiesByType.map(({ type, c }) => (
                      <div key={type} className="flex items-center gap-3">
                        <span className="text-xs text-slate-400 w-20 flex-shrink-0">{type}</span>
                        <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full"
                            style={{ width: `${Math.round((c / (digest.activitiesByType[0]?.c || 1)) * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400 flex-shrink-0 w-6 text-right">{c}</span>
                      </div>
                    ))}
                  </div>
                )}
                <FooterLink label="Ver charts do pipeline" onClick={() => onViewChange('charts')} />
              </Card>
            </div>
          </>
        ) : null}


      </div>
    </div>
  )
}

// ─── Small sub-components ─────────────────────────────────────────────────────

function KpiChip({ icon, label, value, sub, color, bg }: {
  icon: React.ReactNode; label: string; value: string; sub: string; color: string; bg: string
}) {
  return (
    <div className="glass-md rounded-xl p-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs text-slate-400 leading-tight">{label}</p>
        <div className={`p-1.5 rounded-lg ${bg}`}>
          <span className={color}>{icon}</span>
        </div>
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>
    </div>
  )
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="glass-md rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

function FooterLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors mt-3"
    >
      {label}
      <ChevronRight size={11} />
    </button>
  )
}

function Empty({ label = 'Sem dados disponíveis' }: { label?: string }) {
  return <p className="text-xs text-slate-600 italic">{label}</p>
}

function DigestSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 glass rounded-xl" />
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="h-52 glass rounded-xl" />
        <div className="h-52 glass rounded-xl" />
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="h-44 glass rounded-xl" />
        <div className="h-44 glass rounded-xl" />
      </div>
    </div>
  )
}
