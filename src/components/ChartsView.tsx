'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend, AreaChart, Area, ComposedChart, Line,
} from 'recharts'
import {
  Bookmark, BookmarkPlus, X, Check, ChevronDown, Trash2,
  DollarSign, Layers, AlertTriangle, Activity, TrendingUp, Target,
} from 'lucide-react'
import { Filters } from './Filters'
import { STAGE_COLORS } from '@/lib/types'
import type { DealFilters } from '@/lib/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGE_LABEL: Record<string, string> = {
  LEAD: 'Lead', QUALIFIED: 'Qualif.', DISCOVERY: 'Discovery',
  DEMO: 'Demo', PROPOSAL: 'Proposta', NEGOTIATION: 'Negoc.',
}
const RISK_COLORS = { HIGH: '#f43f5e', MEDIUM: '#f59e0b', LOW: '#22c55e' }
const RISK_LABELS = { HIGH: 'Crítico', MEDIUM: 'Em risco', LOW: 'Saudável' }
const TYPE_COLORS: Record<string, string> = { CALL: '#38bdf8', EMAIL: '#a78bfa', MEETING: '#34d399', NOTE: '#fbbf24' }
const TYPE_LABELS: Record<string, string> = { CALL: 'Ligação', EMAIL: 'Email', MEETING: 'Reunião', NOTE: 'Nota' }

const VIEWS_KEY = 'paggo_chart_views'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Analytics {
  kpis: { totalOpenValue: number; weightedValue: number; totalOpenDeals: number; highRiskCount: number; avgDealSize: number; winRate: number }
  byStage: { stage: string; count: number; value: number }[]
  bySegment: { segment: string; count: number; value: number; winRate: number }[]
  riskDistribution: { level: string; count: number }[]
  byOwner: { owner: string; deals: number; value: number; weighted: number; highRisk: number; activities: number; nextSteps: number }[]
  activityByType: { type: string; count: number }[]
  activityTrend: { day: string; count: number }[]
}
interface SavedChartView { id: string; name: string; filters: DealFilters }
interface Props { owners: string[] }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtMoney(n: number) {
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `R$ ${(n / 1_000).toFixed(0)}K`
  return `R$ ${Math.round(n)}`
}
function fmtK(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return `${Math.round(n)}`
}

function loadViews(): SavedChartView[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(VIEWS_KEY) || '[]') } catch { return [] }
}
function persistViews(v: SavedChartView[]) { localStorage.setItem(VIEWS_KEY, JSON.stringify(v)) }

const FILTER_KEYS: (keyof DealFilters)[] = ['stage', 'ownerName', 'accountSegment', 'industry', 'riskLevel', 'search', 'includesClosed']
function filtersMatch(a: DealFilters, b: DealFilters) { return FILTER_KEYS.every(k => a[k] === b[k]) }

// Bucket daily trend into ~weekly points
function toWeekly(rows: { day: string; count: number }[]) {
  if (!rows.length) return []
  const buckets = new Map<string, number>()
  for (const r of rows) {
    const d = new Date(r.day + 'T00:00:00')
    const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    const key = monday.toISOString().slice(0, 10)
    buckets.set(key, (buckets.get(key) || 0) + r.count)
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => ({ week: `${k.slice(8, 10)}/${k.slice(5, 7)}`, count: v }))
}

// ─── Glass tooltip ──────────────────────────────────────────────────────────────

function GlassTooltip({ active, payload, label, fmt }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass-menu rounded-lg px-3 py-2 text-xs shadow-xl" style={{ minWidth: 120 }}>
      {label != null && <div className="font-semibold text-slate-200 mb-1">{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-slate-400">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color || p.fill }} />
            {p.name}
          </span>
          <span className="font-semibold text-slate-100">{fmt ? fmt(p.value, p.name) : p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Card wrapper ──────────────────────────────────────────────────────────────

function ChartCard({ title, subtitle, children, className = '' }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`glass-md rounded-2xl p-5 ${className}`}>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function ChartsView({ owners }: Props) {
  const [filters, setFilters] = useState<DealFilters>({})
  const [data, setData]       = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [views, setViews]     = useState<SavedChartView[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [adding, setAdding]   = useState(false)
  const [newName, setNewName] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setViews(loadViews()) }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const fetchData = useCallback(async (f: DealFilters) => {
    setLoading(true)
    const params = new URLSearchParams()
    Object.entries(f).forEach(([k, v]) => v !== undefined && v !== '' && params.set(k, String(v)))
    const res = await fetch(`/api/analytics?${params}`)
    setData(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { fetchData(filters) }, [filters, fetchData])

  // Saved views
  const activeViewId = views.find(v => filtersMatch(filters, v.filters))?.id
  const saveView = () => {
    const name = newName.trim()
    if (!name) return
    const item: SavedChartView = { id: `cv-${Date.now()}`, name, filters: { ...filters } }
    const updated = [...views, item]
    setViews(updated); persistViews(updated); setNewName(''); setAdding(false)
  }
  const deleteView = (id: string) => { const u = views.filter(v => v.id !== id); setViews(u); persistViews(u) }

  // Derived chart data
  const stageData = (data?.byStage || []).map(s => ({
    stage: STAGE_LABEL[s.stage] || s.stage, count: s.count,
    value: Math.round(s.value / 1000), fill: STAGE_COLORS[s.stage as keyof typeof STAGE_COLORS],
  }))
  const ownerData = (data?.byOwner || []).slice(0, 8).map(o => ({
    name: o.owner.split(' ')[0], value: Math.round(o.value / 1000), deals: o.deals, highRisk: o.highRisk,
  }))
  const ownerActData = (data?.byOwner || []).slice(0, 8).map(o => ({
    name: o.owner.split(' ')[0], activities: o.activities, nextSteps: o.nextSteps,
  }))
  const riskData = (data?.riskDistribution || []).map(r => ({
    name: RISK_LABELS[r.level as keyof typeof RISK_LABELS], value: r.count, color: RISK_COLORS[r.level as keyof typeof RISK_COLORS],
  }))
  const typeData = (data?.activityByType || []).map(t => ({
    name: TYPE_LABELS[t.type] || t.type, value: t.count, color: TYPE_COLORS[t.type] || '#94a3b8',
  }))
  const segmentData = (data?.bySegment || []).map(s => ({
    name: s.segment, winRate: Math.round(s.winRate * 100), deals: s.count, value: Math.round(s.value / 1000),
  }))
  const trendData = toWeekly(data?.activityTrend || [])
  const k = data?.kpis

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-6 py-5 space-y-5 max-w-[1400px] mx-auto">

        {/* ── Toolbar: filters + saved views ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <Filters
              filters={filters}
              owners={owners}
              onChange={partial => setFilters(prev => ({ ...prev, ...partial }))}
              onReset={() => setFilters({})}
              showSort={false}
            />
          </div>

          {/* Saved views control */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="flex items-center gap-2 px-3 py-1.5 glass-input rounded-xl text-sm text-slate-300 hover:text-slate-100 hover:bg-white/[0.06] transition-colors"
            >
              <Bookmark size={14} className={activeViewId ? 'text-indigo-400' : 'text-slate-500'} />
              {activeViewId ? views.find(v => v.id === activeViewId)?.name : 'Visualizações'}
              <ChevronDown size={13} className="text-slate-500" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-1.5 w-60 glass-menu rounded-xl overflow-hidden py-1.5 z-50">
                <button
                  onClick={() => setFilters({})}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${!activeViewId ? 'glass-accent text-indigo-300' : 'text-slate-400 hover:bg-white/[0.06]'}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500" /> Todos os deals
                </button>
                {views.map(v => (
                  <div key={v.id} className={`group flex items-center gap-2 px-3 py-2 text-xs cursor-pointer transition-colors ${activeViewId === v.id ? 'glass-accent text-indigo-300' : 'text-slate-300 hover:bg-white/[0.06]'}`} onClick={() => { setFilters(v.filters); setMenuOpen(false) }}>
                    <Bookmark size={11} className={activeViewId === v.id ? 'text-indigo-400' : 'text-slate-500'} />
                    <span className="flex-1 truncate">{v.name}</span>
                    <button onClick={e => { e.stopPropagation(); deleteView(v.id) }} className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-slate-700 rounded transition-all">
                      <X size={11} className="text-slate-500 hover:text-red-400" />
                    </button>
                  </div>
                ))}
                <div className="my-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />
                {adding ? (
                  <div className="flex items-center gap-1.5 px-2 py-1">
                    <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveView(); if (e.key === 'Escape') { setAdding(false); setNewName('') } }}
                      placeholder="Nome da visualização" maxLength={32}
                      className="flex-1 min-w-0 h-7 glass-input text-xs rounded-md px-2" />
                    <button onClick={saveView} disabled={!newName.trim()} className="h-7 w-7 flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-md text-white">
                      <Check size={12} />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setAdding(true)} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:text-indigo-300 hover:bg-white/[0.06] transition-colors">
                    <BookmarkPlus size={12} /> Salvar visualização atual
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── KPI strip ── */}
        {k && (
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            <Kpi Icon={DollarSign}    label="Pipeline aberto" value={fmtMoney(k.totalOpenValue)} accent="text-indigo-400" />
            <Kpi Icon={Target}        label="Ponderado"       value={fmtMoney(k.weightedValue)}  accent="text-violet-400" />
            <Kpi Icon={Layers}        label="Deals abertos"   value={String(k.totalOpenDeals)}   accent="text-sky-400" />
            <Kpi Icon={TrendingUp}    label="Ticket médio"    value={fmtMoney(k.avgDealSize)}    accent="text-emerald-400" />
            <Kpi Icon={Activity}      label="Win rate"        value={`${Math.round(k.winRate * 100)}%`} accent="text-teal-400" />
            <Kpi Icon={AlertTriangle} label="Risco crítico"   value={String(k.highRiskCount)}    accent="text-rose-400" />
          </div>
        )}

        {loading && !data ? (
          <div className="flex items-center justify-center h-64 text-slate-500">Carregando…</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Pipeline value & deals by owner */}
            <ChartCard title="Pipeline e deals por owner" subtitle="Valor (R$ mil) e nº de deals — top 8" className="lg:col-span-2">
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={ownerData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="gOwnerVal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#818cf8" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0.55} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="l" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={fmtK} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<GlassTooltip fmt={(v: number, n: string) => n === 'Valor' ? `R$ ${v}K` : `${v} deals`} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Legend formatter={v => <span style={{ color: '#94a3b8', fontSize: 11 }}>{v}</span>} />
                  <Bar yAxisId="l" name="Valor" dataKey="value" fill="url(#gOwnerVal)" radius={[5, 5, 0, 0]} maxBarSize={46} />
                  <Line yAxisId="r" name="Deals" dataKey="deals" stroke="#34d399" strokeWidth={2.5} dot={{ r: 3, fill: '#34d399' }} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Owner activity */}
            <ChartCard title="Atividade dos owners" subtitle="Atividades registradas vs. próximos passos pendentes">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={ownerActData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<GlassTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Legend formatter={v => <span style={{ color: '#94a3b8', fontSize: 11 }}>{v}</span>} />
                  <Bar name="Atividades" dataKey="activities" stackId="a" fill="#22d3ee" radius={[0, 0, 0, 0]} maxBarSize={40} />
                  <Bar name="Próx. passos" dataKey="nextSteps" stackId="a" fill="#a78bfa" radius={[5, 5, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Activity momentum trend */}
            <ChartCard title="Momentum de atividades" subtitle="Atividades registradas por semana (8 sem.)">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={trendData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                  <defs>
                    <linearGradient id="gTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="week" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<GlassTooltip />} />
                  <Area name="Atividades" type="monotone" dataKey="count" stroke="#22d3ee" strokeWidth={2.5} fill="url(#gTrend)" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Value by stage */}
            <ChartCard title="Valor por estágio" subtitle="R$ mil em pipeline por etapa">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={stageData} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={fmtK} axisLine={false} tickLine={false} />
                  <YAxis dataKey="stage" type="category" tick={{ fill: '#94a3b8', fontSize: 11 }} width={70} axisLine={false} tickLine={false} />
                  <Tooltip content={<GlassTooltip fmt={(v: number) => `R$ ${v}K`} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar name="Valor" dataKey="value" radius={[0, 5, 5, 0]} maxBarSize={28}>
                    {stageData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Deals by stage (funnel) */}
            <ChartCard title="Funil de estágios" subtitle="Quantidade de deals por etapa">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={stageData} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="stage" type="category" tick={{ fill: '#94a3b8', fontSize: 11 }} width={70} axisLine={false} tickLine={false} />
                  <Tooltip content={<GlassTooltip fmt={(v: number) => `${v} deals`} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar name="Deals" dataKey="count" radius={[0, 5, 5, 0]} maxBarSize={28}>
                    {stageData.map((e, i) => <Cell key={i} fill={e.fill} fillOpacity={0.85} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Risk distribution donut */}
            <ChartCard title="Distribuição de risco">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={riskData} cx="50%" cy="50%" innerRadius={58} outerRadius={88} paddingAngle={3} dataKey="value" stroke="none">
                    {riskData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip content={<GlassTooltip fmt={(v: number) => `${v} deals`} />} />
                  <Legend formatter={v => <span style={{ color: '#94a3b8', fontSize: 11 }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Activity mix donut */}
            <ChartCard title="Mix de atividades" subtitle="Tipos de interação registradas">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={typeData} cx="50%" cy="50%" innerRadius={58} outerRadius={88} paddingAngle={3} dataKey="value" stroke="none">
                    {typeData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip content={<GlassTooltip />} />
                  <Legend formatter={v => <span style={{ color: '#94a3b8', fontSize: 11 }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Win rate by segment */}
            <ChartCard title="Win rate por segmento" subtitle="% de deals ganhos sobre fechados" className="lg:col-span-2">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={segmentData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                  <defs>
                    {['#6366f1', '#06b6d4', '#8b5cf6'].map((c, i) => (
                      <linearGradient key={i} id={`gSeg${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={c} stopOpacity={0.95} />
                        <stop offset="100%" stopColor={c} stopOpacity={0.5} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#cbd5e1', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => `${v}%`} domain={[0, 100]} axisLine={false} tickLine={false} />
                  <Tooltip content={<GlassTooltip fmt={(v: number) => `${v}%`} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar name="Win rate" dataKey="winRate" radius={[6, 6, 0, 0]} maxBarSize={90}>
                    {segmentData.map((_, i) => <Cell key={i} fill={`url(#gSeg${i % 3})`} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

          </div>
        )}
      </div>
    </div>
  )
}

// ─── KPI tile ──────────────────────────────────────────────────────────────────

function Kpi({ Icon, label, value, accent }: { Icon: React.ElementType; label: string; value: string; accent: string }) {
  return (
    <div className="glass-md rounded-xl p-3.5 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0 ${accent}`}>
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] text-slate-500 truncate">{label}</div>
        <div className="text-base font-bold text-slate-100 truncate">{value}</div>
      </div>
    </div>
  )
}
