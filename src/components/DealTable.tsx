'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  ArrowUp, ArrowDown, ArrowUpDown,
  ArrowLeft, ArrowRight, EyeOff, Pencil, Check, X,
  MessageSquare, ChevronRight, Plus, Columns,
} from 'lucide-react'
import { RiskBadge } from './RiskBadge'
import { NewDealModal } from './NewDealModal'
import { formatDistanceToNow, parseISO, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Deal, RiskFlag } from '@/lib/types'
import { STAGE_COLORS } from '@/lib/types'

// ─── Column definitions ───────────────────────────────────────────────────────

interface ColDef {
  id: string
  defaultLabel: string
  defaultVisible: boolean
  sortField: string | null
  width: number | 'flex'
}

const COL_DEFS: ColDef[] = [
  { id: 'name',         defaultLabel: 'Proposta',          defaultVisible: true,  sortField: 'accountName',        width: 'flex'  },
  { id: 'stage',        defaultLabel: 'Estágio',           defaultVisible: true,  sortField: 'stage',              width: 110     },
  { id: 'owner',        defaultLabel: 'Owner',             defaultVisible: true,  sortField: 'ownerName',          width: 140     },
  { id: 'amount',       defaultLabel: 'Valor',             defaultVisible: true,  sortField: 'amount',             width: 110     },
  { id: 'risk',         defaultLabel: 'Risco',             defaultVisible: true,  sortField: 'riskScore',          width: 90      },
  { id: 'lastActivity', defaultLabel: 'Última Atividade',  defaultVisible: true,  sortField: 'lastActivityAt',     width: 140     },
  { id: 'closeDate',    defaultLabel: 'Fecha em',          defaultVisible: true,  sortField: 'expectedCloseDate',  width: 100     },
  { id: 'daysInStage',  defaultLabel: 'Dias no Estágio',   defaultVisible: false, sortField: 'daysInCurrentStage', width: 90      },
  { id: 'segment',      defaultLabel: 'Segmento',          defaultVisible: false, sortField: 'accountSegment',     width: 90      },
  { id: 'industry',     defaultLabel: 'Indústria',         defaultVisible: false, sortField: null,                 width: 120     },
]

const COL_MAP = Object.fromEntries(COL_DEFS.map(c => [c.id, c]))

// ─── Aggregation ──────────────────────────────────────────────────────────────

type AggMode = 'none' | 'sum' | 'avg' | 'min' | 'max'

interface AggColDef {
  modes: AggMode[]
  getValue: (d: Deal) => number
  format: (v: number) => string
}

const AGG_COLS: Record<string, AggColDef> = {
  amount: {
    modes: ['none', 'sum', 'avg', 'min', 'max'],
    getValue: d => d.amount,
    format: v => fmt(v),
  },
  risk: {
    modes: ['none', 'avg', 'min', 'max'],
    getValue: d => d.riskScore,
    format: v => Math.round(v).toString(),
  },
  daysInStage: {
    modes: ['none', 'avg', 'max'],
    getValue: d => d.daysInCurrentStage,
    format: v => `${Math.round(v)}d`,
  },
}

function computeAgg(mode: AggMode, values: number[]): number {
  if (!values.length) return 0
  switch (mode) {
    case 'sum': return values.reduce((a, b) => a + b, 0)
    case 'avg': return values.reduce((a, b) => a + b, 0) / values.length
    case 'min': return Math.min(...values)
    case 'max': return Math.max(...values)
    default: return 0
  }
}

const AGG_MODE_LABELS: Record<AggMode, string> = {
  none: 'Nenhum', sum: 'Soma', avg: 'Média', min: 'Mínimo', max: 'Máximo',
}
const AGG_MODE_SHORT: Record<AggMode, string> = {
  none: '', sum: 'soma', avg: 'média', min: 'mín', max: 'máx',
}

// ─── Persistence helpers ──────────────────────────────────────────────────────

const STORAGE_ORDER  = 'paggo_col_order'
const STORAGE_HIDDEN = 'paggo_col_hidden'
const STORAGE_LABELS = 'paggo_col_labels'

function loadColOrder(): string[] {
  if (typeof window === 'undefined') return COL_DEFS.map(c => c.id)
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_ORDER) || 'null')
    if (Array.isArray(saved) && saved.length) return saved
  } catch {}
  return COL_DEFS.map(c => c.id)
}

function loadHidden(): string[] {
  if (typeof window === 'undefined') return COL_DEFS.filter(c => !c.defaultVisible).map(c => c.id)
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_HIDDEN) || 'null')
    if (Array.isArray(saved)) return saved
  } catch {}
  return COL_DEFS.filter(c => !c.defaultVisible).map(c => c.id)
}

function loadLabels(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(STORAGE_LABELS) || '{}') } catch { return {} }
}

// ─── Cell renderers ───────────────────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `R$ ${(n / 1_000).toFixed(0)}K`
  return `R$ ${Math.round(n)}`
}
function relDate(iso: string | null) {
  if (!iso) return null
  try { return formatDistanceToNow(parseISO(iso), { locale: ptBR, addSuffix: true }) } catch { return null }
}
function shortDate(iso: string) {
  try { return format(parseISO(iso), 'dd/MM/yy') } catch { return iso }
}

const RISK_DOT: Record<string, string> = {
  HIGH: 'bg-red-500', MEDIUM: 'bg-amber-400', LOW: 'bg-emerald-500',
}
const SEGMENT_BADGE: Record<string, string> = {
  SMB: 'bg-slate-700 text-slate-300',
  MID: 'bg-blue-900/60 text-blue-300',
  ENT: 'bg-purple-900/60 text-purple-300',
}

function renderCell(colId: string, deal: Deal): React.ReactNode {
  switch (colId) {
    case 'name': return null // handled specially
    case 'stage':
      return (
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: STAGE_COLORS[deal.stage] }} />
          <span className="text-xs" style={{ color: STAGE_COLORS[deal.stage] }}>{deal.stage}</span>
        </span>
      )
    case 'owner':
      return <span className="text-xs text-slate-300 truncate">{deal.ownerName}</span>
    case 'amount':
      return <span className="text-xs font-semibold text-slate-200">{fmt(deal.amount)}</span>
    case 'risk':
      return (
        <span className="inline-flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${RISK_DOT[deal.riskLevel]}`} />
          <span className={`text-xs font-medium ${
            deal.riskLevel === 'HIGH' ? 'text-red-400' : deal.riskLevel === 'MEDIUM' ? 'text-amber-400' : 'text-emerald-400'
          }`}>{deal.riskScore}</span>
        </span>
      )
    case 'lastActivity':
      return (
        <span className="text-xs text-slate-400">
          {deal.lastActivityAt ? relDate(deal.lastActivityAt) : <span className="text-slate-600">—</span>}
        </span>
      )
    case 'closeDate': {
      const overdue = new Date(deal.expectedCloseDate) < new Date('2026-05-20')
      return (
        <span className={`text-xs ${overdue ? 'text-red-400 font-medium' : 'text-slate-400'}`}>
          {overdue ? 'Vencido' : shortDate(deal.expectedCloseDate)}
        </span>
      )
    }
    case 'daysInStage':
      return (
        <span className={`text-xs font-medium ${deal.daysInCurrentStage > 30 ? 'text-red-400' : deal.daysInCurrentStage > 14 ? 'text-amber-400' : 'text-slate-400'}`}>
          {deal.daysInCurrentStage}d
        </span>
      )
    case 'segment':
      return (
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${SEGMENT_BADGE[deal.accountSegment] || ''}`}>
          {deal.accountSegment}
        </span>
      )
    case 'industry':
      return <span className="text-xs text-slate-400 truncate">{deal.industry}</span>
    default:
      return null
  }
}

// ─── Column header menu ───────────────────────────────────────────────────────

interface MenuState { colId: string; x: number; y: number }

interface MenuProps {
  state: MenuState
  colDef: ColDef
  label: string
  sortBy: string
  sortOrder: string
  isFirst: boolean
  isLast: boolean
  onSort: (field: string, order: 'asc' | 'desc') => void
  onMoveLeft: () => void
  onMoveRight: () => void
  onHide: () => void
  onEditLabel: () => void
  onClose: () => void
}

function ColumnMenu({ state, colDef, label, sortBy, sortOrder, isFirst, isLast, onSort, onMoveLeft, onMoveRight, onHide, onEditLabel, onClose }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const isSortedAsc  = sortBy === colDef.sortField && sortOrder === 'asc'
  const isSortedDesc = sortBy === colDef.sortField && sortOrder === 'desc'

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left: state.x, top: state.y, zIndex: 9999, minWidth: 200 }}
      className="glass-menu rounded-xl py-1 overflow-hidden"
    >
      {colDef.sortField && (
        <>
          <MenuItem
            icon={<ArrowUp size={13} />}
            label="Ordenar crescente"
            active={isSortedAsc}
            onClick={() => { onSort(colDef.sortField!, 'asc'); onClose() }}
          />
          <MenuItem
            icon={<ArrowDown size={13} />}
            label="Ordenar decrescente"
            active={isSortedDesc}
            onClick={() => { onSort(colDef.sortField!, 'desc'); onClose() }}
          />
          <Divider />
        </>
      )}
      <MenuItem
        icon={<ArrowLeft size={13} />}
        label="Mover para esquerda"
        disabled={isFirst}
        onClick={() => { onMoveLeft(); onClose() }}
      />
      <MenuItem
        icon={<ArrowRight size={13} />}
        label="Mover para direita"
        disabled={isLast}
        onClick={() => { onMoveRight(); onClose() }}
      />
      <Divider />
      <MenuItem
        icon={<Pencil size={13} />}
        label="Editar nome da coluna"
        onClick={() => { onEditLabel(); onClose() }}
      />
      <Divider />
      <MenuItem
        icon={<EyeOff size={13} />}
        label="Ocultar coluna"
        danger
        onClick={() => { onHide(); onClose() }}
      />
    </div>
  )
}

function MenuItem({ icon, label, active = false, disabled = false, danger = false, onClick }: {
  icon: React.ReactNode; label: string; active?: boolean; disabled?: boolean; danger?: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
        disabled ? 'opacity-30 cursor-default' :
        danger   ? 'text-red-400 hover:bg-red-500/10' :
        active   ? 'text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/15' :
                   'text-slate-300 hover:bg-white/[0.07]'
      }`}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span>{label}</span>
      {active && <Check size={11} className="ml-auto text-indigo-400" />}
    </button>
  )
}

function Divider() {
  return <div className="my-1" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }} />
}

// ─── Column picker panel ─────────────────────────────────────────────────────

interface PickerProps {
  pos: { x: number; y: number }
  allCols: ColDef[]
  hiddenCols: string[]
  labels: Record<string, string>
  onToggle: (id: string) => void
  onRestoreDefaults: () => void
  onClose: () => void
}

function ColumnPicker({ pos, allCols, hiddenCols, labels, onToggle, onRestoreDefaults, onClose }: PickerProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Anchor panel to right edge of button, open downward
  const panelWidth = 220
  const left = Math.max(8, pos.x - panelWidth)

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left, top: pos.y, zIndex: 9999, width: panelWidth }}
      className="glass-menu rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
          <Columns size={12} />
          Gerenciar colunas
        </span>
        <button onClick={onClose} className="p-0.5 text-slate-500 hover:text-slate-300 rounded transition-colors">
          <X size={12} />
        </button>
      </div>

      {/* Column list */}
      <div className="py-1 max-h-72 overflow-y-auto">
        {allCols.map(col => {
          const isVisible  = !hiddenCols.includes(col.id)
          const isNameCol  = col.id === 'name'
          const label      = labels[col.id] || col.defaultLabel

          return (
            <button
              key={col.id}
              onClick={() => { if (!isNameCol) onToggle(col.id) }}
              disabled={isNameCol}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
                isNameCol
                  ? 'opacity-40 cursor-default'
                  : 'hover:bg-slate-700/60 cursor-pointer'
              }`}
            >
              {/* Checkbox */}
              <span className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                isVisible
                  ? 'bg-indigo-600 border-indigo-500'
                  : 'border-slate-600 bg-transparent'
              }`}>
                {isVisible && <Check size={9} className="text-white" />}
              </span>
              <span className={isVisible ? 'text-slate-200' : 'text-slate-500'}>{label}</span>
              {isNameCol && (
                <span className="ml-auto text-[9px] text-slate-600 italic">fixo</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Footer */}
      <div className="px-3 py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <button
          onClick={() => { onRestoreDefaults(); onClose() }}
          className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
        >
          Restaurar padrão
        </button>
      </div>
    </div>
  )
}

// ─── Restore hidden columns toolbar ──────────────────────────────────────────

interface RestoreBarProps { hidden: string[]; labels: Record<string, string>; onShow: (id: string) => void }

function RestoreBar({ hidden, labels, onShow }: RestoreBarProps) {
  if (hidden.length === 0) return null
  return (
    <div className="flex-shrink-0 flex items-center gap-2 px-4 py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
      <span className="text-[10px] text-slate-500 flex-shrink-0">Ocultas:</span>
      {hidden.map(id => {
        const def = COL_MAP[id]
        if (!def) return null
        return (
          <button
            key={id}
            onClick={() => onShow(id)}
            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded-lg transition-colors glass-input hover:bg-white/[0.07]"
          >
            {labels[id] || def.defaultLabel}
            <span className="text-slate-600">+</span>
          </button>
        )
      })}
    </div>
  )
}

// ─── Aggregation picker ───────────────────────────────────────────────────────

interface AggPickerState { colId: string; x: number; y: number }

function AggPicker({ state, aggDef, currentMode, onSelect, onClose }: {
  state: AggPickerState
  aggDef: AggColDef
  currentMode: AggMode
  onSelect: (mode: AggMode) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const panelHeight = aggDef.modes.length * 36 + 36
  const top = Math.max(8, state.y - panelHeight - 4)

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left: state.x, top, zIndex: 9999, minWidth: 170 }}
      className="glass-menu rounded-xl py-1 overflow-hidden"
    >
      <div className="px-3 py-1.5 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
        Agregação
      </div>
      {aggDef.modes.map(mode => (
        <button
          key={mode}
          onClick={() => { onSelect(mode); onClose() }}
          className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors ${
            mode === currentMode
              ? 'text-indigo-400 bg-indigo-500/10'
              : 'text-slate-300 hover:bg-white/[0.07]'
          }`}
        >
          <span>{AGG_MODE_LABELS[mode]}</span>
          {mode === currentMode && <Check size={11} className="text-indigo-400" />}
        </button>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  deals: Deal[]
  selectedId: string | null
  onSelect: (id: string) => void
  onOpenComments?: (dealId: string) => void
  onDealCreated?: () => void
  loading: boolean
  total: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  onSortChange?: (sortBy: string, sortOrder: 'asc' | 'desc') => void
}

export function DealTable({
  deals, selectedId, onSelect, onOpenComments, onDealCreated,
  loading, total,
  sortBy = 'riskScore', sortOrder = 'desc', onSortChange,
}: Props) {
  const [showNewDeal, setShowNewDeal] = useState(false)
  // Always start from deterministic server-safe defaults to avoid SSR/client hydration mismatch.
  // localStorage is loaded in a useEffect (client-only, after first paint).
  const [colOrder,       setColOrder]       = useState<string[]>(COL_DEFS.map(c => c.id))
  const [hiddenCols,     setHiddenCols]     = useState<string[]>(COL_DEFS.filter(c => !c.defaultVisible).map(c => c.id))
  const [colLabels,      setColLabels]      = useState<Record<string, string>>({})
  const [menuState,      setMenuState]      = useState<MenuState | null>(null)
  const [editingCol,     setEditingCol]     = useState<string | null>(null)
  const [editValue,      setEditValue]      = useState('')
  const [showColPicker,  setShowColPicker]  = useState(false)
  const [pickerPos,      setPickerPos]      = useState<{ x: number; y: number } | null>(null)
  const [aggModes,       setAggModes]       = useState<Record<string, AggMode>>({ amount: 'sum' })
  const [aggPickerCol,   setAggPickerCol]   = useState<AggPickerState | null>(null)

  // Load persisted config after mount (client-only — avoids SSR hydration mismatch)
  useEffect(() => {
    setColOrder(loadColOrder())
    setHiddenCols(loadHidden())
    setColLabels(loadLabels())
  }, [])

  // Persist changes back to localStorage
  useEffect(() => { localStorage.setItem(STORAGE_ORDER,  JSON.stringify(colOrder))   }, [colOrder])
  useEffect(() => { localStorage.setItem(STORAGE_HIDDEN, JSON.stringify(hiddenCols)) }, [hiddenCols])
  useEffect(() => { localStorage.setItem(STORAGE_LABELS, JSON.stringify(colLabels))  }, [colLabels])

  const visibleCols = colOrder
    .filter(id => !hiddenCols.includes(id) && !!COL_MAP[id])

  const openMenu = (colId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setMenuState({ colId, x: rect.left, y: rect.bottom + 4 })
  }

  const moveCol = (colId: string, dir: -1 | 1) => {
    const idx = colOrder.indexOf(colId)
    if (idx < 0) return
    const next = [...colOrder]
    const swap = idx + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    setColOrder(next)
  }

  const hideCol = (colId: string) => {
    if (colId === 'name') return // can't hide name
    setHiddenCols(prev => [...prev, colId])
  }

  const showCol = (colId: string) => {
    setHiddenCols(prev => prev.filter(id => id !== colId))
  }

  const toggleColVisibility = (colId: string) => {
    if (colId === 'name') return
    if (hiddenCols.includes(colId)) showCol(colId)
    else hideCol(colId)
  }

  const restoreDefaultCols = () => {
    setHiddenCols(COL_DEFS.filter(c => !c.defaultVisible).map(c => c.id))
  }

  const openColPicker = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setPickerPos({ x: rect.right, y: rect.bottom + 4 })
    setShowColPicker(prev => !prev)
  }

  const startEditLabel = (colId: string) => {
    const def = COL_MAP[colId]
    setEditValue(colLabels[colId] || def.defaultLabel)
    setEditingCol(colId)
  }

  const commitLabel = () => {
    if (!editingCol) return
    const trimmed = editValue.trim()
    if (trimmed) setColLabels(prev => ({ ...prev, [editingCol]: trimmed }))
    setEditingCol(null)
  }

  // For column menu
  const menuCol = menuState ? COL_MAP[menuState.colId] : null

  if (loading) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="h-9 bg-slate-800/60 rounded-lg mb-2 animate-pulse" />
        {[...Array(10)].map((_, i) => (
          <div key={i} className="h-11 bg-slate-800/40 rounded-lg mb-0.5 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Hidden columns restore bar */}
      <RestoreBar hidden={hiddenCols} labels={colLabels} onShow={showCol} />

      {/* Count + New Deal button */}
      <div className="flex-shrink-0 flex items-center justify-between px-1 pb-1.5">
        <span className="text-[11px] text-slate-500">
          {total} deals · exibindo {deals.length}
          {hiddenCols.length > 0 && (
            <span className="ml-2 text-slate-600">
              · {hiddenCols.length} coluna{hiddenCols.length > 1 ? 's' : ''} oculta{hiddenCols.length > 1 ? 's' : ''}
            </span>
          )}
        </span>
        <button
          onClick={() => setShowNewDeal(true)}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium text-indigo-300 hover:text-white hover:bg-indigo-600 transition-all"
          style={{ border: '1px solid rgba(99,102,241,0.35)' }}
        >
          <Plus size={12} />
          Novo Deal
        </button>
      </div>

      {/* Table container */}
      <div className="flex-1 overflow-auto rounded-2xl" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
        {/* Single width-anchor wrapper */}
        <div style={{ width: 'max-content', minWidth: '100%' }}>

        {/* Header row */}
        <div className="flex items-stretch sticky top-0 z-20 w-full glass" style={{ borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}>
          {/* Risk bar placeholder */}
          <div className="w-1 flex-shrink-0" />

          {visibleCols.map(colId => {
            const def   = COL_MAP[colId]
            const label = colLabels[colId] || def.defaultLabel
            const isSortedAsc  = sortBy === def.sortField && sortOrder === 'asc'
            const isSortedDesc = sortBy === def.sortField && sortOrder === 'desc'
            const isSorted     = isSortedAsc || isSortedDesc
            const style = def.width === 'flex'
              ? { flex: '1 1 180px', minWidth: 180 }
              : { width: def.width, flexShrink: 0 }

            return (
              <div
                key={colId}
                style={{ ...style, borderRight: '1px solid rgba(255,255,255,0.06)' } as React.CSSProperties}
                className="group relative flex items-center"
              >
                {editingCol === colId ? (
                  <div className="flex items-center gap-1 px-3 py-2 w-full">
                    <input
                      autoFocus
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={commitLabel}
                      onKeyDown={e => { if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') setEditingCol(null) }}
                      className="flex-1 min-w-0 bg-slate-700 text-slate-200 text-xs rounded px-2 py-1 focus:outline-none border border-indigo-500/60"
                    />
                    <button onClick={commitLabel} className="text-indigo-400"><Check size={12} /></button>
                  </div>
                ) : (
                  <button
                    onClick={e => openMenu(colId, e)}
                    className={`flex items-center gap-1.5 px-3 py-2.5 w-full text-left text-xs font-semibold transition-colors select-none ${
                      isSorted ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
                    } hover:bg-slate-800/50`}
                  >
                    <span className="truncate">{label}</span>
                    <span className={`flex-shrink-0 transition-opacity ${isSorted ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'}`}>
                      {isSortedAsc  ? <ArrowUp size={11} />   :
                       isSortedDesc ? <ArrowDown size={11} /> :
                                      <ArrowUpDown size={11} />}
                    </span>
                  </button>
                )}
              </div>
            )
          })}

          {/* "+" column picker button */}
          <button
            onClick={openColPicker}
            title="Gerenciar colunas"
            className={`w-10 flex-shrink-0 flex items-center justify-center transition-colors border-l border-slate-700/50 relative group ${
              showColPicker ? 'bg-indigo-500/15 text-indigo-400' : 'hover:bg-slate-800/60 text-slate-500 hover:text-indigo-400'
            }`}
          >
            <Plus size={14} />
            {hiddenCols.length > 0 && (
              <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-indigo-600 rounded-full flex items-center justify-center text-[8px] text-white font-bold leading-none">
                {hiddenCols.length}
              </span>
            )}
          </button>
        </div>

        {/* Rows */}
        {deals.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-slate-500 text-sm">
            Nenhum deal encontrado para os filtros selecionados.
          </div>
        ) : (
          deals.map(deal => {
            const flags: RiskFlag[] = (() => { try { return JSON.parse(deal.riskFlags) } catch { return [] } })()
            const isSelected = deal.dealId === selectedId
            const riskColor = deal.riskLevel === 'HIGH' ? '#ef4444' : deal.riskLevel === 'MEDIUM' ? '#f59e0b' : '#22c55e'

            return (
              <div
                key={deal.dealId}
                onClick={() => onSelect(deal.dealId)}
                className={`flex items-center cursor-pointer transition-colors w-full ${
                  isSelected
                    ? 'bg-indigo-500/[0.09] hover:bg-indigo-500/[0.12]'
                    : 'hover:bg-white/[0.04]'
                }`}
                style={{ borderBottom: '1px solid rgba(255,255,255,0.045)' }}
              >
                {/* Risk bar */}
                <div className="w-1 self-stretch flex-shrink-0 rounded-sm" style={{ backgroundColor: riskColor }} />

                {visibleCols.map(colId => {
                  const def   = COL_MAP[colId]
                  const style = def.width === 'flex'
                    ? { flex: '1 1 180px', minWidth: 180 }
                    : { width: def.width, flexShrink: 0 }

                  if (colId === 'name') {
                    return (
                      <div key={colId} style={{ ...style, borderRight: '1px solid rgba(255,255,255,0.045)' }} className="flex items-center gap-2 px-3 py-2.5 min-w-0">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-sm font-medium truncate ${isSelected ? 'text-indigo-200' : 'text-slate-100'}`}>
                              {deal.accountName}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${SEGMENT_BADGE[deal.accountSegment] || ''}`}>
                              {deal.accountSegment}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-600 mt-0.5 truncate">{deal.dealId}</div>
                        </div>

                        {/* Comment bubble */}
                        <button
                          onClick={e => { e.stopPropagation(); onOpenComments?.(deal.dealId) }}
                          title="Comentários"
                          className={`flex-shrink-0 flex items-center gap-1 px-1.5 py-1 rounded-md transition-colors ${
                            (deal.commentCount ?? 0) > 0
                              ? 'text-indigo-400 hover:bg-indigo-500/20'
                              : 'text-slate-700 hover:text-slate-500 hover:bg-slate-700/50'
                          }`}
                        >
                          <MessageSquare size={12} />
                          {(deal.commentCount ?? 0) > 0 && (
                            <span className="text-[10px] font-semibold">{deal.commentCount}</span>
                          )}
                        </button>
                      </div>
                    )
                  }

                  return (
                    <div key={colId} style={{ ...style, borderRight: '1px solid rgba(255,255,255,0.045)' } as React.CSSProperties} className="flex items-center px-3 py-2.5 min-w-0">
                      {renderCell(colId, deal)}
                    </div>
                  )
                })}

                {/* Row actions */}
                <div className="w-10 flex-shrink-0 flex items-center justify-center">
                  <ChevronRight size={13} className={`transition-colors ${isSelected ? 'text-indigo-400' : 'text-slate-700'}`} />
                </div>
              </div>
            )
          })
        )}

        {/* ── Aggregation footer ──────────────────────────────────────── */}
        <div
          className="flex items-center sticky bottom-0 z-20 w-full"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(9,8,20,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
        >
          {/* Risk bar placeholder */}
          <div className="w-1 flex-shrink-0" />

          {visibleCols.map(colId => {
            const def      = COL_MAP[colId]
            const colStyle = def.width === 'flex'
              ? { flex: '1 1 180px', minWidth: 180 }
              : { width: def.width, flexShrink: 0 }
            const aggDef   = AGG_COLS[colId]
            const mode     = aggModes[colId] ?? 'none'

            const openPicker = (e: React.MouseEvent) => {
              if (!aggDef) return
              e.stopPropagation()
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              setAggPickerCol({ colId, x: rect.left, y: rect.top })
            }

            if (!aggDef) {
              return (
                <div
                  key={colId}
                  style={{ ...colStyle, borderRight: '1px solid rgba(255,255,255,0.045)' } as React.CSSProperties}
                  className="flex items-center px-3 py-2 min-w-0 h-9"
                />
              )
            }

            if (mode === 'none') {
              return (
                <div
                  key={colId}
                  style={{ ...colStyle, borderRight: '1px solid rgba(255,255,255,0.045)' } as React.CSSProperties}
                  className="flex items-center px-3 py-2 min-w-0 h-9"
                >
                  <button
                    onClick={openPicker}
                    className="text-[11px] text-slate-600 hover:text-slate-400 transition-colors px-1.5 py-0.5 rounded hover:bg-white/[0.05]"
                  >
                    + Calc
                  </button>
                </div>
              )
            }

            const values  = deals.map(d => aggDef.getValue(d))
            const result  = computeAgg(mode, values)
            const display = aggDef.format(result)
            const short   = AGG_MODE_SHORT[mode]

            return (
              <div
                key={colId}
                style={{ ...colStyle, borderRight: '1px solid rgba(255,255,255,0.045)' } as React.CSSProperties}
                className="flex items-center px-3 py-2 min-w-0 h-9"
              >
                <button
                  onClick={openPicker}
                  className="flex items-center gap-1.5 group hover:opacity-80 transition-opacity"
                >
                  <span className="text-xs font-semibold text-slate-200">{display}</span>
                  <span className="text-[10px] text-slate-500 group-hover:text-slate-400">{short}</span>
                </button>
              </div>
            )
          })}

          {/* "+" col picker spacer */}
          <div className="w-10 flex-shrink-0" />
        </div>

        </div>{/* end width-anchor wrapper */}
      </div>

      {/* Column header menu (fixed-positioned) */}
      {menuState && menuCol && (
        <ColumnMenu
          state={menuState}
          colDef={menuCol}
          label={colLabels[menuState.colId] || menuCol.defaultLabel}
          sortBy={sortBy}
          sortOrder={sortOrder}
          isFirst={menuState.colId === visibleCols[0]}
          isLast={menuState.colId === visibleCols[visibleCols.length - 1]}
          onSort={(field, order) => onSortChange?.(field, order)}
          onMoveLeft={() => moveCol(menuState.colId, -1)}
          onMoveRight={() => moveCol(menuState.colId, 1)}
          onHide={() => hideCol(menuState.colId)}
          onEditLabel={() => startEditLabel(menuState.colId)}
          onClose={() => setMenuState(null)}
        />
      )}

      {/* Column picker panel (fixed-positioned) */}
      {showColPicker && pickerPos && (
        <ColumnPicker
          pos={pickerPos}
          allCols={COL_DEFS}
          hiddenCols={hiddenCols}
          labels={colLabels}
          onToggle={toggleColVisibility}
          onRestoreDefaults={restoreDefaultCols}
          onClose={() => setShowColPicker(false)}
        />
      )}

      {/* Aggregation picker (fixed-positioned) */}
      {aggPickerCol && AGG_COLS[aggPickerCol.colId] && (
        <AggPicker
          state={aggPickerCol}
          aggDef={AGG_COLS[aggPickerCol.colId]}
          currentMode={aggModes[aggPickerCol.colId] ?? 'none'}
          onSelect={mode => setAggModes(prev => ({ ...prev, [aggPickerCol.colId]: mode }))}
          onClose={() => setAggPickerCol(null)}
        />
      )}

      {/* New Deal modal */}
      {showNewDeal && (
        <NewDealModal
          onClose={() => setShowNewDeal(false)}
          onCreated={() => { setShowNewDeal(false); onDealCreated?.() }}
        />
      )}
    </div>
  )
}
