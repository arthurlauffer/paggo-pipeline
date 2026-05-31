'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { MessageSquare, RefreshCw, Database, LogOut } from 'lucide-react'
import { LoginGate }      from '@/components/LoginGate'
import { KPICards }       from '@/components/KPICards'
import { Filters }        from '@/components/Filters'
import { DealTable }      from '@/components/DealTable'
import { DealDetail }     from '@/components/DealDetail'
import { ChartsView }     from '@/components/ChartsView'
import { KanbanView }     from '@/components/KanbanView'
import { AgentChat }      from '@/components/AgentChat'
import { ReminderBell }   from '@/components/ReminderBell'
import { Sidebar }        from '@/components/Sidebar'
import { HomeView }       from '@/components/HomeView'
import { OwnerPlaybook }  from '@/components/OwnerPlaybook'
import { NotificationsView } from '@/components/NotificationsView'
import type { Deal, DealFilters, PipelineSummary, Stage } from '@/lib/types'

const DEFAULT_FILTERS: DealFilters = { sortBy: 'riskScore', sortOrder: 'desc', limit: 100 }
const KANBAN_FILTERS:  DealFilters = { sortBy: 'riskScore', sortOrder: 'desc', limit: 500 }

type View      = 'home' | 'notifications' | 'pipeline' | 'kanban' | 'charts' | 'playbooks'
type DetailTab = 'info' | 'activity' | 'comments'

type Me = { email: string | null; displayName: string | null }

export default function HomePage() {
  // ── Auth gate ───────────────────────────────────────────────────────────
  // null = still checking, false = not logged in (show gate), true = logged in
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [me,     setMe]     = useState<Me | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/me')
      .then(r => r.json())
      .then((d: { authed: boolean; email?: string | null; displayName?: string | null }) => {
        if (cancelled) return
        setAuthed(!!d.authed)
        if (d.authed) setMe({ email: d.email ?? null, displayName: d.displayName ?? null })
      })
      .catch(() => { if (!cancelled) setAuthed(false) })
    return () => { cancelled = true }
  }, [])

  const handleLogout = async () => {
    setLoggingOut(true)
    try { await fetch('/api/auth/logout', { method: 'POST' }) } catch { /* ignore */ }
    window.location.href = '/'
  }

  const [view,           setView]           = useState<View>('home')
  const [sidebarOpen,    setSidebarOpen]    = useState(false)
  const [deals,          setDeals]          = useState<Deal[]>([])
  const [total,          setTotal]          = useState(0)
  const [selectedId,     setSelectedId]     = useState<string | null>(null)
  const [detailTab,      setDetailTab]      = useState<DetailTab>('info')
  const [filters,        setFilters]        = useState<DealFilters>(DEFAULT_FILTERS)
  const [owners,         setOwners]         = useState<string[]>([])
  const [summary,        setSummary]        = useState<PipelineSummary | null>(null)
  const [dealsLoading,   setDealsLoading]   = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [agentOpen,      setAgentOpen]      = useState(false)
  const [agentInitialMsg,setAgentInitialMsg]= useState<string | undefined>()
  const [seeding,        setSeeding]        = useState(false)
  const [dbEmpty,        setDbEmpty]        = useState(false)
  const fetchTimeoutRef = useRef<NodeJS.Timeout>()

  // ── Data fetching ─────────────────────────────────────────────────────────

  const fetchDeals = useCallback(async (f: DealFilters) => {
    setDealsLoading(true)
    const params = new URLSearchParams()
    Object.entries(f).forEach(([k, v]) => v !== undefined && params.set(k, String(v)))
    const res  = await fetch(`/api/deals?${params}`)
    const data = await res.json()
    setDeals(data.deals || [])
    setTotal(data.total  || 0)
    setDealsLoading(false)
  }, [])

  const fetchSummary = useCallback(async (f: DealFilters) => {
    setSummaryLoading(true)
    const params = new URLSearchParams()
    if (f.stage)          params.set('stage',          f.stage)
    if (f.ownerName)      params.set('ownerName',      f.ownerName)
    if (f.accountSegment) params.set('accountSegment', f.accountSegment)
    if (f.industry)       params.set('industry',       f.industry)
    if (f.riskLevel)      params.set('riskLevel',      f.riskLevel)
    if (f.search)         params.set('search',         f.search)
    if (f.includesClosed) params.set('includesClosed', 'true')
    const res  = await fetch(`/api/pipeline?${params}`)
    const data = await res.json()
    setSummary(data)
    setSummaryLoading(false)
  }, [])

  const fetchOwners = useCallback(async () => {
    const res = await fetch('/api/owners')
    setOwners(await res.json())
  }, [])

  const checkSeeded = useCallback(async () => {
    const res = await fetch('/api/seed')
    const { count } = await res.json()
    if (count === 0) setDbEmpty(true)
    else {
      setDbEmpty(false)
      fetchDeals(filters)
      fetchSummary(filters)
      fetchOwners()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { if (authed) checkSeeded() }, [authed, checkSeeded])

  useEffect(() => {
    if (dbEmpty) return
    clearTimeout(fetchTimeoutRef.current)
    const effectiveFilters = view === 'kanban' ? { ...filters, ...KANBAN_FILTERS } : filters
    fetchTimeoutRef.current = setTimeout(() => {
      fetchDeals(effectiveFilters)
      fetchSummary(filters)
    }, 150)
  }, [filters, view, fetchDeals, fetchSummary, dbEmpty])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleFilterChange = (partial: Partial<DealFilters>) =>
    setFilters(prev => ({ ...prev, ...partial }))

  const handleReset = () => setFilters(DEFAULT_FILTERS)

  const handleDealUpdated = () => {
    const f = view === 'kanban' ? { ...filters, ...KANBAN_FILTERS } : filters
    fetchDeals(f)
    fetchSummary(filters)
  }

  const handleSeed = async () => {
    setSeeding(true)
    const res  = await fetch('/api/seed', { method: 'POST' })
    const data = await res.json()
    setSeeding(false)
    if (data.seeded) {
      setDbEmpty(false)
      fetchDeals(filters)
      fetchSummary(filters)
      fetchOwners()
    }
  }

  const handleSelectDeal = (id: string) => {
    setSelectedId(prev => prev === id ? null : id)
    setDetailTab('info')
  }

  const handleOpenComments = (dealId: string) => {
    setSelectedId(dealId)
    setDetailTab('comments')
  }

  const handleAskAgent = (msg?: string) => {
    setAgentInitialMsg(msg)
    setAgentOpen(true)
  }

  const handleKanbanStageMove = async (dealId: string, newStage: Stage) => {
    await fetch(`/api/deals/${dealId}/stage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newStage, reason: 'Movido via kanban' }),
    })
    handleDealUpdated()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  // Still checking the session → minimal loading screen (avoids gate flash).
  if (authed === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw size={20} className="text-slate-500 animate-spin" />
      </div>
    )
  }

  // Not logged in → show the Google connect gate before the app.
  if (!authed) {
    return <LoginGate />
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 z-10 glass border-b border-white/[0.07]" style={{ borderRadius: 0 }}>
        <div className="flex items-center gap-3">
          <img src="/paggo-logo.png" alt="Paggo" className="h-7 brightness-0 invert" />
          <span className="text-slate-700 text-lg leading-none select-none">|</span>
          <span className="text-xs font-medium text-slate-400 tracking-wide">Pipeline Intelligence</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleDealUpdated}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            title="Atualizar dados"
          >
            <RefreshCw size={14} />
          </button>
          <ReminderBell />
          <button
            onClick={() => handleAskAgent()}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              agentOpen ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <MessageSquare size={13} />
            Ask Paggo CRM
          </button>

          {/* Logged-in user + logout */}
          <div className="flex items-center gap-2 ml-1.5 pl-2.5 border-l border-white/[0.07]">
            {(me?.displayName || me?.email) && (
              <span className="text-xs text-slate-400 max-w-[160px] truncate" title={me?.email ?? undefined}>
                {me?.displayName || me?.email}
              </span>
            )}
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
              title="Sair"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <Sidebar
          open={sidebarOpen}
          onToggle={() => setSidebarOpen(o => !o)}
          view={view}
          onViewChange={setView}
          currentFilters={filters}
          defaultFilters={DEFAULT_FILTERS}
          onApplyFilters={f => setFilters(prev => ({ ...prev, ...f }))}
          onResetFilters={handleReset}
        />

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* Empty DB banner */}
          {dbEmpty && (
            <div className="flex-shrink-0 flex items-center justify-center gap-4 py-3 border-b" style={{ background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.2)' }}>
              <p className="text-sm text-amber-300">
                Banco de dados vazio. Importe os 8.000 deals do deals.csv.
              </p>
              <button
                onClick={handleSeed}
                disabled={seeding}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-900 text-sm font-semibold rounded-lg transition-colors disabled:opacity-60"
              >
                <Database size={14} />
                {seeding ? 'Importando…' : 'Inicializar Banco'}
              </button>
            </div>
          )}

          {/* ── HOME VIEW ─────────────────────────────────────────────────── */}
          {view === 'home' && (
            <HomeView
              onAskAgent={handleAskAgent}
              onViewChange={v => setView(v)}
            />
          )}

          {/* ── NOTIFICATIONS VIEW ────────────────────────────────────────── */}
          {view === 'notifications' && (
            <NotificationsView
              onSelectDeal={(dealId) => {
                setSelectedId(dealId)
                setDetailTab('comments')
                setView('pipeline')
              }}
            />
          )}

          {/* ── LIST VIEW ─────────────────────────────────────────────────── */}
          {view === 'pipeline' && (
            <div className="flex-1 flex overflow-hidden">
              <div className={`flex flex-col min-w-0 overflow-hidden ${selectedId ? 'flex-1' : 'w-full'}`}>
                <div className="flex-shrink-0 px-4 py-3 space-y-3 border-b border-slate-800">
                  <KPICards summary={summary} loading={summaryLoading} />
                  <Filters
                    filters={filters}
                    owners={owners}
                    onChange={handleFilterChange}
                    onReset={handleReset}
                  />
                </div>
                <div className="flex-1 overflow-hidden p-4">
                  <DealTable
                    deals={deals}
                    selectedId={selectedId}
                    onSelect={handleSelectDeal}
                    onOpenComments={handleOpenComments}
                    onDealCreated={handleDealUpdated}
                    loading={dealsLoading}
                    total={total}
                    sortBy={filters.sortBy}
                    sortOrder={filters.sortOrder}
                    onSortChange={(sb, so) => handleFilterChange({ sortBy: sb, sortOrder: so })}
                  />
                </div>
              </div>

              {selectedId && (
                <div className="w-96 flex-shrink-0 overflow-hidden flex flex-col border-l border-slate-800">
                  <DealDetail
                    dealId={selectedId}
                    onClose={() => setSelectedId(null)}
                    onDealUpdated={handleDealUpdated}
                    defaultTab={detailTab}
                  />
                </div>
              )}
            </div>
          )}

          {/* ── KANBAN VIEW ───────────────────────────────────────────────── */}
          {view === 'kanban' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-shrink-0 px-4 py-3 space-y-3 border-b border-slate-800">
                <KPICards summary={summary} loading={summaryLoading} />
                <Filters
                  filters={filters}
                  owners={owners}
                  onChange={handleFilterChange}
                  onReset={handleReset}
                />
              </div>
              <div className="flex-1 flex min-h-0 overflow-hidden">
                <div className={`flex-1 min-w-0 overflow-hidden ${selectedId ? 'border-r border-slate-800' : ''}`}>
                  <KanbanView
                    deals={deals}
                    selectedId={selectedId}
                    onSelect={handleSelectDeal}
                    onStageMove={handleKanbanStageMove}
                    onOpenComments={handleOpenComments}
                    onDealCreated={handleDealUpdated}
                    loading={dealsLoading}
                  />
                </div>
                {selectedId && (
                  <div className="w-96 flex-shrink-0 overflow-hidden flex flex-col">
                    <DealDetail
                      dealId={selectedId}
                      onClose={() => setSelectedId(null)}
                      onDealUpdated={handleDealUpdated}
                      defaultTab={detailTab}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── CHARTS VIEW ───────────────────────────────────────────────── */}
          {view === 'charts' && <ChartsView owners={owners} />}

          {/* ── PLAYBOOKS VIEW ────────────────────────────────────────────── */}
          {view === 'playbooks' && (
            <OwnerPlaybook
              onSelectDeal={(dealId) => {
                setSelectedId(dealId)
                setDetailTab('activity')
                setView('pipeline')
              }}
            />
          )}

        </div>
      </div>

      {/* Agent chat */}
      <AgentChat
        isOpen={agentOpen}
        onClose={() => setAgentOpen(false)}
        onDataChanged={handleDealUpdated}
        initialMessage={agentInitialMsg}
        onInitialMessageConsumed={() => setAgentInitialMsg(undefined)}
      />
    </div>
  )
}
