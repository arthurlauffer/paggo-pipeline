'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  List, LayoutGrid, BarChart2, Home,
  PanelLeftClose, PanelLeft,
  ChevronRight, ChevronDown,
  Plus, X, Check, Bookmark,
  Settings, Users, LogOut, Plug2, UserCircle,
  CheckSquare, Bell,
} from 'lucide-react'
import type { DealFilters } from '@/lib/types'
import { WorkspaceSettings } from './WorkspaceSettings'
import { NOTIF_SEEN_KEY } from './NotificationsView'

// ─── Types ────────────────────────────────────────────────────────────────────

type View = 'home' | 'notifications' | 'pipeline' | 'kanban' | 'charts' | 'playbooks'

interface Workspace { name: string; slug: string; logo: string | null }

interface SavedViewItem {
  id: string
  name: string
  filters: DealFilters
}

export interface SidebarProps {
  open: boolean
  onToggle: () => void
  view: View
  onViewChange: (v: View) => void
  currentFilters: DealFilters
  defaultFilters: DealFilters
  onApplyFilters: (f: DealFilters) => void
  onResetFilters: () => void
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

function storageKey(v: 'pipeline' | 'kanban') { return `paggo_saved_views_${v}` }

function loadViews(v: 'pipeline' | 'kanban'): SavedViewItem[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(storageKey(v)) || '[]') } catch { return [] }
}

function persistViews(v: 'pipeline' | 'kanban', items: SavedViewItem[]) {
  localStorage.setItem(storageKey(v), JSON.stringify(items))
}

// ─── Filter comparison (ignores sort/pagination) ──────────────────────────────

const FILTER_KEYS: (keyof DealFilters)[] = [
  'stage', 'ownerName', 'accountSegment', 'industry', 'riskLevel', 'search', 'includesClosed',
]
function filtersMatch(a: DealFilters, b: DealFilters) {
  return FILTER_KEYS.every(k => a[k] === b[k])
}

// ─── Nav config ───────────────────────────────────────────────────────────────

const NAV: { id: View; label: string; Icon: React.ElementType; hasSubs: boolean }[] = [
  { id: 'home',          label: 'Home',          Icon: Home,        hasSubs: false },
  { id: 'notifications', label: 'Notificações',  Icon: Bell,        hasSubs: false },
  { id: 'pipeline',      label: 'Lista',         Icon: List,        hasSubs: true  },
  { id: 'kanban',        label: 'Kanban',        Icon: LayoutGrid,  hasSubs: true  },
  { id: 'charts',        label: 'Charts',        Icon: BarChart2,   hasSubs: false },
  { id: 'playbooks',     label: 'Playbooks',     Icon: CheckSquare, hasSubs: false },
]

// ─── Main component ───────────────────────────────────────────────────────────

export function Sidebar({
  open, onToggle,
  view, onViewChange,
  currentFilters, defaultFilters,
  onApplyFilters, onResetFilters,
}: SidebarProps) {

  const [openMenu, setOpenMenu]   = useState<View | null>(view)
  const [savedViews, setSavedViews] = useState<Record<'pipeline' | 'kanban', SavedViewItem[]>>({
    pipeline: [], kanban: [],
  })
  const [addingFor, setAddingFor] = useState<View | null>(null)
  const [newName,   setNewName]   = useState('')
  const [wsMenuPos,  setWsMenuPos]  = useState<{ x: number; y: number } | null>(null)
  const [workspace,  setWorkspace]  = useState<Workspace>({ name: 'Paggo', slug: 'paggo', logo: null })
  const [settingsSection, setSettingsSection] = useState<'general' | 'members' | 'teams' | null>(null)
  const [unreadNotifs, setUnreadNotifs] = useState(0)

  // Keep active view's submenu open
  useEffect(() => { setOpenMenu(view) }, [view])

  // ── Unread mention notifications badge ──────────────────────────────────────
  const refreshNotifCount = useCallback(() => {
    fetch('/api/notifications')
      .then(r => r.json())
      .then(d => {
        const seen = (typeof window !== 'undefined' && localStorage.getItem(NOTIF_SEEN_KEY)) || ''
        const list: { createdAt: string }[] = d.notifications || []
        setUnreadNotifs(seen ? list.filter(n => n.createdAt > seen).length : list.length)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    refreshNotifCount()
    const onSeen = () => setUnreadNotifs(0)
    window.addEventListener('paggo-notifications-seen', onSeen)
    const t = setInterval(refreshNotifCount, 60_000)
    return () => { window.removeEventListener('paggo-notifications-seen', onSeen); clearInterval(t) }
  }, [refreshNotifCount])

  // Clear badge as soon as the user opens the notifications view.
  useEffect(() => { if (view === 'notifications') setUnreadNotifs(0) }, [view])

  // Load from localStorage on mount
  useEffect(() => {
    setSavedViews({ pipeline: loadViews('pipeline'), kanban: loadViews('kanban') })
  }, [])

  // Load workspace settings (name / logo)
  const loadWorkspace = () => {
    fetch('/api/workspace').then(r => r.json()).then((w: Workspace) => w && setWorkspace(w)).catch(() => {})
  }
  useEffect(() => { loadWorkspace() }, [])

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleNavClick = (id: View) => {
    if (!open) {
      // Collapsed → expand sidebar + switch view
      onToggle()
      onViewChange(id)
      setOpenMenu(id)
    } else if (id === view) {
      // Same view → toggle submenu
      setOpenMenu(prev => prev === id ? null : id)
    } else {
      // Different view → switch + open its submenu
      onViewChange(id)
      setOpenMenu(id)
    }
  }

  const handleApplySaved = (viewType: View, item: SavedViewItem) => {
    onViewChange(viewType)
    onApplyFilters({ ...defaultFilters, ...item.filters })
  }

  const handleApplyDefault = (viewType: View) => {
    onViewChange(viewType)
    onResetFilters()
  }

  const handleAddSave = (viewType: 'pipeline' | 'kanban') => {
    const name = newName.trim()
    if (!name) return
    const item: SavedViewItem = { id: `v-${Date.now()}`, name, filters: { ...currentFilters } }
    const updated = { ...savedViews, [viewType]: [...savedViews[viewType], item] }
    setSavedViews(updated)
    persistViews(viewType, updated[viewType])
    setNewName('')
    setAddingFor(null)
  }

  const handleDelete = (viewType: 'pipeline' | 'kanban', id: string) => {
    const updated = { ...savedViews, [viewType]: savedViews[viewType].filter(v => v.id !== id) }
    setSavedViews(updated)
    persistViews(viewType, updated[viewType])
  }

  const handleRename = (viewType: 'pipeline' | 'kanban', id: string, name: string) => {
    const updated = {
      ...savedViews,
      [viewType]: savedViews[viewType].map(v => v.id === id ? { ...v, name } : v),
    }
    setSavedViews(updated)
    persistViews(viewType, updated[viewType])
  }

  // ── Active detection ──────────────────────────────────────────────────────

  const isDefaultActive = (vt: View) =>
    view === vt && filtersMatch(currentFilters, defaultFilters)

  const activeSavedId = (vt: 'pipeline' | 'kanban') =>
    view === vt
      ? savedViews[vt].find(v => filtersMatch(currentFilters, v.filters))?.id
      : undefined

  const openWsMenu = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setWsMenuPos({ x: rect.left, y: rect.bottom + 6 })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <aside
      className={`flex-shrink-0 flex flex-col glass transition-all duration-200 border-r-0 ${
        open ? 'w-52 overflow-visible' : 'w-[52px] overflow-hidden'
      }`}
      style={{ borderRadius: 0, borderRight: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* ── Org header ── */}
      <div
        className={`flex-shrink-0 flex items-center gap-1.5 h-12 ${open ? 'px-2' : 'px-1.5'}`}
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        {/* Org button */}
        <button
          onClick={openWsMenu}
          className={`flex items-center gap-2 rounded-lg transition-colors hover:bg-white/[0.06] min-w-0 ${
            open ? 'flex-1 px-2 py-1.5' : 'w-full justify-center py-2'
          }`}
          title="Menu do workspace"
        >
          {/* Logo */}
          <WorkspaceLogo workspace={workspace} size={24} />
          {open && (
            <>
              <span className="flex-1 text-sm font-semibold text-slate-100 truncate text-left">{workspace.name}</span>
              <ChevronDown size={12} className="text-slate-400 flex-shrink-0" />
            </>
          )}
        </button>

        {/* Collapse/expand toggle (inline with org header when expanded) */}
        {open && (
          <button
            onClick={onToggle}
            className="flex-shrink-0 p-1.5 text-slate-500 hover:text-slate-300 hover:bg-white/[0.05] rounded-md transition-colors"
            title="Recolher"
          >
            <PanelLeftClose size={14} />
          </button>
        )}
      </div>

      {/* Expand button (collapsed only — sits below the org logo) */}
      {!open && (
        <div className="flex-shrink-0 flex items-center justify-center h-8" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <button
            onClick={onToggle}
            className="p-1 text-slate-600 hover:text-slate-300 hover:bg-white/[0.05] rounded-md transition-colors"
            title="Expandir"
          >
            <PanelLeft size={13} />
          </button>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2 pt-1.5 space-y-0.5">
        {NAV.map(({ id, label, Icon, hasSubs }) => {
          const isActive   = view === id
          const isMenuOpen = open && openMenu === id && hasSubs
          const vt         = id as 'pipeline' | 'kanban'
          const subs       = hasSubs ? savedViews[vt] : []
          const activeId   = hasSubs ? activeSavedId(vt) : undefined
          const defActive  = isDefaultActive(id)

          return (
            <div key={id}>
              {/* Main nav button */}
              <button
                onClick={() => handleNavClick(id)}
                title={!open ? label : undefined}
                className={`w-full flex items-center rounded-lg transition-all font-medium group ${
                  open ? 'gap-2.5 px-2.5 py-2 text-sm' : 'justify-center py-2.5'
                } ${
                  isActive
                    ? 'glass-accent text-indigo-300'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.06]'
                }`}
              >
                <Icon size={15} className="flex-shrink-0" />

                {open && (
                  <>
                    <span className="flex-1 text-left truncate">{label}</span>

                    {/* Unread notifications badge */}
                    {id === 'notifications' && unreadNotifs > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-500 text-white">
                        {unreadNotifs > 99 ? '99+' : unreadNotifs}
                      </span>
                    )}

                    {/* Saved count badge */}
                    {hasSubs && subs.length > 0 && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                        isActive ? 'bg-indigo-500/30 text-indigo-300' : 'bg-slate-700 text-slate-400'
                      }`}>
                        {subs.length}
                      </span>
                    )}

                    {/* Expand/collapse chevron */}
                    {hasSubs && (
                      <span className={`ml-0.5 transition-transform duration-150 ${isMenuOpen ? 'rotate-0' : '-rotate-90'}`}>
                        <ChevronDown size={13} className="text-slate-500" />
                      </span>
                    )}
                  </>
                )}

                {/* Collapsed: active dot */}
                {!open && isActive && (
                  <span className="absolute left-0.5 w-0.5 h-5 bg-indigo-400 rounded-full" />
                )}

                {/* Collapsed: unread dot */}
                {!open && id === 'notifications' && unreadNotifs > 0 && (
                  <span className="absolute top-1.5 right-2 min-w-[14px] h-[14px] px-1 flex items-center justify-center text-[8px] font-bold rounded-full bg-indigo-500 text-white">
                    {unreadNotifs > 9 ? '9+' : unreadNotifs}
                  </span>
                )}
              </button>

              {/* Submenu (expanded + open only) */}
              {isMenuOpen && (
                <div className="mt-0.5 ml-2 pl-3 space-y-0.5 pb-1" style={{ borderLeft: '1px solid rgba(255,255,255,0.07)' }}>

                  {/* "Todos" — default / reset */}
                  <SubItem
                    label="Todos"
                    isActive={defActive}
                    isDefault
                    onClick={() => handleApplyDefault(id)}
                  />

                  {/* Saved views */}
                  {subs.map(sv => (
                    <SubItem
                      key={sv.id}
                      label={sv.name}
                      isActive={activeId === sv.id}
                      onClick={() => handleApplySaved(id, sv)}
                      onDelete={() => handleDelete(vt, sv.id)}
                      onRename={name => handleRename(vt, sv.id, name)}
                    />
                  ))}

                  {/* Add new inline */}
                  {addingFor === id ? (
                    <div className="flex items-center gap-1.5 pt-0.5 pb-0.5">
                      <input
                        autoFocus
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter')  handleAddSave(vt)
                          if (e.key === 'Escape') { setAddingFor(null); setNewName('') }
                        }}
                        placeholder="Nome…"
                        maxLength={32}
                        className="flex-1 min-w-0 h-6 glass-input text-xs rounded-md px-2 placeholder:text-slate-600"
                      />
                      <button
                        onClick={() => handleAddSave(vt)}
                        disabled={!newName.trim()}
                        className="flex-shrink-0 h-6 w-6 flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-md text-white transition-colors"
                      >
                        <Check size={11} />
                      </button>
                      <button
                        onClick={() => { setAddingFor(null); setNewName('') }}
                        className="flex-shrink-0 h-6 w-6 flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-md transition-colors"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setAddingFor(id); setNewName('') }}
                      className="flex items-center gap-1.5 w-full px-2 py-1 text-[11px] text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 rounded-md transition-colors"
                    >
                      <Plus size={11} />
                      Salvar filtros atuais
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Workspace menu portal */}
      {wsMenuPos && (
        <WorkspaceMenu
          pos={wsMenuPos}
          workspace={workspace}
          onClose={() => setWsMenuPos(null)}
          onOpenSettings={(s) => { setSettingsSection(s); setWsMenuPos(null) }}
        />
      )}

      {/* Workspace settings modal */}
      {settingsSection && (
        <WorkspaceSettings
          initialSection={settingsSection}
          onClose={() => setSettingsSection(null)}
          onUpdated={loadWorkspace}
        />
      )}
    </aside>
  )
}

// ─── WorkspaceLogo ──────────────────────────────────────────────────────────────

function WorkspaceLogo({ workspace, size }: { workspace: Workspace; size: number }) {
  if (workspace.logo) {
    return (
      <div className="rounded-lg overflow-hidden flex-shrink-0 shadow-md bg-white" style={{ width: size, height: size }}>
        <img src={workspace.logo} alt={workspace.name} className="w-full h-full object-cover" />
      </div>
    )
  }
  return (
    <div className="rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-md" style={{ width: size, height: size }}>
      <span className="font-bold text-white select-none" style={{ fontSize: size * 0.46 }}>{(workspace.name[0] || 'P').toUpperCase()}</span>
    </div>
  )
}

// ─── WorkspaceMenu ────────────────────────────────────────────────────────────

interface WorkspaceMenuProps {
  pos: { x: number; y: number }
  workspace: Workspace
  onClose: () => void
  onOpenSettings: (section: 'general' | 'members') => void
}

function WorkspaceMenu({ pos, workspace, onClose, onOpenSettings }: WorkspaceMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  type Item = { icon: React.ElementType; label: string; danger?: boolean; onClick?: () => void }
  const items: (Item | null)[] = [
    { icon: UserCircle, label: 'Configurações da conta',     onClick: () => onOpenSettings('general') },
    { icon: Settings,   label: 'Configurações do workspace', onClick: () => onOpenSettings('general') },
    null,
    { icon: Users,      label: 'Convidar membros',           onClick: () => onOpenSettings('members') },
    null,
    { icon: Plug2,      label: 'Integrações',                onClick: onClose },
    null,
    { icon: LogOut,     label: 'Sair',                       danger: true, onClick: onClose },
  ]

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 9999, minWidth: 230 }}
      className="glass-menu rounded-xl overflow-hidden py-1.5"
    >
      {/* Current org row */}
      <div className="flex items-center gap-2.5 px-3 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <WorkspaceLogo workspace={workspace} size={28} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-100 truncate">{workspace.name}</div>
          <div className="text-[10px] text-slate-500">Pipeline CRM</div>
        </div>
        <Check size={14} className="text-indigo-400 flex-shrink-0" />
      </div>

      {/* Menu items */}
      <div className="py-1">
        {items.map((item, i) => {
          if (item === null) {
            return <div key={i} className="my-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />
          }
          const { icon: Icon, label, danger, onClick } = item
          return (
            <button
              key={label}
              onClick={onClick}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                danger
                  ? 'text-red-400 hover:bg-red-500/10'
                  : 'text-slate-300 hover:bg-white/[0.06]'
              }`}
            >
              <Icon size={14} className="flex-shrink-0" />
              <span>{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── SubItem ──────────────────────────────────────────────────────────────────

interface SubItemProps {
  label: string
  isActive: boolean
  isDefault?: boolean
  onClick: () => void
  onDelete?: () => void
  onRename?: (name: string) => void
}

function SubItem({ label, isActive, isDefault = false, onClick, onDelete, onRename }: SubItemProps) {
  const [editing, setEditing] = useState(false)
  const [name,    setName]    = useState(label)

  // Keep in sync when parent updates
  useEffect(() => { setName(label) }, [label])

  const commit = () => {
    const t = name.trim()
    if (t && t !== label && onRename) onRename(t)
    else setName(label)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 py-0.5">
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter')  commit()
            if (e.key === 'Escape') { setName(label); setEditing(false) }
          }}
          maxLength={32}
          className="flex-1 min-w-0 h-6 bg-slate-800 border border-indigo-500/70 text-slate-200 text-xs rounded-md px-2 focus:outline-none"
        />
      </div>
    )
  }

  return (
    <div
      className={`group flex items-center gap-2 px-2 py-1 rounded-md text-xs transition-colors cursor-pointer select-none ${
        isActive
          ? 'glass-accent text-indigo-300 font-medium'
          : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]'
      }`}
      onClick={onClick}
      onDoubleClick={e => { if (!isDefault && onRename) { e.stopPropagation(); setEditing(true) } }}
      title={!isDefault ? 'Clique para aplicar · Duplo clique para renomear' : 'Remover filtros'}
    >
      {/* Indicator dot */}
      <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ${
        isActive ? 'bg-indigo-400' : 'bg-slate-600 group-hover:bg-slate-400'
      }`} />

      {isDefault ? (
        <span className="flex-1 truncate">Todos</span>
      ) : (
        <>
          <Bookmark size={10} className={`flex-shrink-0 ${isActive ? 'text-indigo-400' : 'text-slate-600 group-hover:text-slate-400'}`} />
          <span className="flex-1 truncate">{label}</span>
        </>
      )}

      {/* Delete (non-default only, hover) */}
      {!isDefault && onDelete && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-slate-700 transition-all"
        >
          <X size={10} className="text-slate-500 hover:text-red-400" />
        </button>
      )}
    </div>
  )
}
