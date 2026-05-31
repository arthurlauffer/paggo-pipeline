'use client'

import { useState, useEffect } from 'react'
import { Plus, X, Check, Bookmark } from 'lucide-react'
import type { DealFilters } from '@/lib/types'

type ViewType = 'pipeline' | 'kanban' | 'charts'

export interface SavedView {
  id: string
  name: string
  filters: DealFilters
  createdAt: string
}

interface Props {
  viewType: ViewType
  currentFilters: DealFilters
  defaultFilters: DealFilters
  onApply: (filters: DealFilters) => void
  onReset: () => void
}

// ─── Persistence ──────────────────────────────────────────────────────────────

function storageKey(v: ViewType) { return `paggo_saved_views_${v}` }

function loadViews(viewType: ViewType): SavedView[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(storageKey(viewType)) || '[]') }
  catch { return [] }
}

function persist(viewType: ViewType, views: SavedView[]) {
  localStorage.setItem(storageKey(viewType), JSON.stringify(views))
}

// ─── Filter comparison (ignores pagination / sort) ────────────────────────────

const FILTER_KEYS: (keyof DealFilters)[] = [
  'stage', 'ownerName', 'accountSegment', 'industry', 'riskLevel', 'search', 'includesClosed',
]

function filtersMatch(a: DealFilters, b: DealFilters) {
  return FILTER_KEYS.every(k => a[k] === b[k])
}

function isDefaultFilters(f: DealFilters, def: DealFilters) {
  return filtersMatch(f, def)
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SavedViews({ viewType, currentFilters, defaultFilters, onApply, onReset }: Props) {
  const [views,   setViews]   = useState<SavedView[]>([])
  const [adding,  setAdding]  = useState(false)
  const [newName, setNewName] = useState('')

  // Load from localStorage on mount / viewType change
  useEffect(() => { setViews(loadViews(viewType)) }, [viewType])

  // Detect active preset
  const isDefault  = isDefaultFilters(currentFilters, defaultFilters)
  const activeView = views.find(v => filtersMatch(v.filters, currentFilters))
  const activeId   = activeView?.id ?? (isDefault ? '__default__' : null)

  const handleSave = () => {
    const name = newName.trim()
    if (!name) return
    const saved: SavedView = {
      id: `view-${Date.now()}`,
      name,
      filters: { ...currentFilters },
      createdAt: new Date().toISOString(),
    }
    const updated = [...views, saved]
    setViews(updated)
    persist(viewType, updated)
    setNewName('')
    setAdding(false)
  }

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const updated = views.filter(v => v.id !== id)
    setViews(updated)
    persist(viewType, updated)
    // if active was deleted, reset to default
    if (activeId === id) onReset()
  }

  const handleRename = (id: string, newNameValue: string) => {
    const updated = views.map(v => v.id === id ? { ...v, name: newNameValue } : v)
    setViews(updated)
    persist(viewType, updated)
  }

  const hasActiveFilters = !isDefault

  return (
    <div className="flex items-center gap-1.5 flex-wrap min-h-[28px]">

      {/* ── "Todos" chip (default / reset) ── */}
      <button
        onClick={onReset}
        className={`flex items-center h-7 px-3 rounded-full text-xs font-medium border transition-all whitespace-nowrap ${
          activeId === '__default__'
            ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm shadow-indigo-500/20'
            : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200 bg-transparent'
        }`}
      >
        Todos
      </button>

      {/* ── Saved view chips ── */}
      {views.map(v => (
        <SavedChip
          key={v.id}
          view={v}
          isActive={activeId === v.id}
          onClick={() => onApply({ ...defaultFilters, ...v.filters })}
          onDelete={e => handleDelete(v.id, e)}
          onRename={name => handleRename(v.id, name)}
        />
      ))}

      {/* ── "Unsaved" badge ── */}
      {hasActiveFilters && !activeView && (
        <span className="flex items-center h-7 px-2.5 rounded-full text-[10px] font-medium border border-dashed border-amber-500/50 text-amber-400/80">
          Filtros ativos
        </span>
      )}

      {/* ── Save button / input ── */}
      {adding ? (
        <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-left-1 duration-150">
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter')  handleSave()
              if (e.key === 'Escape') { setAdding(false); setNewName('') }
            }}
            placeholder="Nome da visualização…"
            maxLength={32}
            className="h-7 bg-slate-800 border border-indigo-500 text-slate-200 text-xs rounded-full px-3 focus:outline-none w-44 placeholder:text-slate-600"
          />
          <button
            onClick={handleSave}
            disabled={!newName.trim()}
            title="Confirmar"
            className="h-7 w-7 flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-full text-white transition-colors flex-shrink-0"
          >
            <Check size={12} />
          </button>
          <button
            onClick={() => { setAdding(false); setNewName('') }}
            title="Cancelar"
            className="h-7 w-7 flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-full transition-colors flex-shrink-0"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          title="Salvar filtros atuais como nova visualização"
          className="flex items-center gap-1 h-7 px-2.5 rounded-full text-xs text-slate-500 hover:text-slate-200 border border-dashed border-slate-700 hover:border-slate-500 hover:bg-slate-800/50 transition-all"
        >
          <Plus size={11} />
          Salvar
        </button>
      )}
    </div>
  )
}

// ─── Individual chip with inline rename on double-click ───────────────────────

function SavedChip({
  view, isActive, onClick, onDelete, onRename,
}: {
  view: SavedView
  isActive: boolean
  onClick: () => void
  onDelete: (e: React.MouseEvent) => void
  onRename: (name: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name,    setName]    = useState(view.name)

  const commit = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== view.name) onRename(trimmed)
    else setName(view.name)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter')  commit()
            if (e.key === 'Escape') { setName(view.name); setEditing(false) }
          }}
          maxLength={32}
          className="h-7 bg-slate-800 border border-indigo-500 text-slate-200 text-xs rounded-full px-3 focus:outline-none w-36"
        />
      </div>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onDoubleClick={e => { e.stopPropagation(); setEditing(true) }}
      onKeyDown={e => e.key === 'Enter' && onClick()}
      title="Clique para aplicar · Duplo clique para renomear"
      className={`group flex items-center gap-1.5 h-7 pl-3 pr-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer select-none whitespace-nowrap ${
        isActive
          ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm shadow-indigo-500/20'
          : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200 hover:bg-slate-800/60'
      }`}
    >
      <Bookmark size={10} className={isActive ? 'opacity-70' : 'opacity-40 group-hover:opacity-70'} />
      {view.name}
      <button
        onClick={onDelete}
        title="Remover"
        className={`rounded-full p-0.5 transition-colors ml-0.5 ${
          isActive
            ? 'hover:bg-white/20 text-white/70 hover:text-white'
            : 'text-slate-600 opacity-0 group-hover:opacity-100 hover:bg-slate-700 hover:text-slate-300'
        }`}
      >
        <X size={9} />
      </button>
    </div>
  )
}
