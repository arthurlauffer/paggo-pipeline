'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, X, ChevronDown, Check } from 'lucide-react'
import type { DealFilters, Stage } from '@/lib/types'

const STAGES: Stage[] = ['LEAD', 'QUALIFIED', 'DISCOVERY', 'DEMO', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST']

const STAGE_LABELS: Record<Stage, string> = {
  LEAD: 'Lead',
  QUALIFIED: 'Qualificado',
  DISCOVERY: 'Discovery',
  DEMO: 'Demo',
  PROPOSAL: 'Proposta',
  NEGOTIATION: 'Negociação',
  CLOSED_WON: '🏆 Ganho',
  CLOSED_LOST: '❌ Perdido',
}

const CLOSED_STAGES = ['CLOSED_WON', 'CLOSED_LOST']

interface Props {
  filters: DealFilters
  owners: string[]
  onChange: (f: Partial<DealFilters>) => void
  onReset: () => void
  showSort?: boolean
}

// Splits a comma-joined filter value into an array.
const toArr = (v?: string): string[] => (v ? v.split(',').filter(Boolean) : [])
const toStr = (arr: string[]): string | undefined => (arr.length ? arr.join(',') : undefined)

// ─── Multi-select dropdown ──────────────────────────────────────────────────
function MultiSelect({ label, value, options, onChange }: {
  label: string
  value: string[]
  options: { label: string; value: string }[]
  onChange: (v: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [open])

  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v])

  const selectedLabels = options.filter(o => value.includes(o.value)).map(o => o.label)
  const display = value.length === 0
    ? label
    : value.length === 1
      ? selectedLabels[0]
      : `${label}: ${value.length}`

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 glass-input text-sm rounded-xl px-3 py-1.5 transition-colors ${
          value.length ? 'text-indigo-300' : 'text-slate-300'
        }`}
      >
        <span className="max-w-[160px] truncate">{display}</span>
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 min-w-[180px] max-h-72 overflow-y-auto glass-strong rounded-xl p-1 shadow-2xl border border-white/[0.08]">
          {options.map(o => {
            const on = value.includes(o.value)
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className="flex items-center gap-2 w-full text-left px-2.5 py-1.5 rounded-lg text-sm text-slate-200 hover:bg-white/[0.07] transition-colors"
              >
                <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border ${on ? 'bg-indigo-500 border-indigo-500' : 'border-slate-600'}`}>
                  {on && <Check size={11} className="text-white" />}
                </span>
                <span className="truncate">{o.label}</span>
              </button>
            )
          })}
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-left px-2.5 py-1.5 mt-0.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] transition-colors border-t border-white/[0.06]"
            >
              Limpar seleção
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Select({ label, value, options, onChange }: {
  label: string
  value: string
  options: { label: string; value: string }[]
  onChange: (v: string) => void
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="glass-input text-sm rounded-xl px-3 py-1.5"
    >
      <option value="">{label}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function Filters({ filters, owners, onChange, onReset, showSort = true }: Props) {
  const hasActive = !!(filters.stage || filters.ownerName || filters.accountSegment || filters.riskLevel || filters.search)

  const stageArr = toArr(filters.stage)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar deal, conta, owner…"
          value={filters.search || ''}
          onChange={e => onChange({ search: e.target.value || undefined })}
          className="glass-input text-sm rounded-xl pl-8 pr-3 py-1.5 w-56"
        />
      </div>

      <MultiSelect
        label="Estágio"
        value={stageArr}
        options={STAGES.map(s => ({ label: STAGE_LABELS[s], value: s }))}
        onChange={arr => {
          const isClosed = arr.some(s => CLOSED_STAGES.includes(s))
          onChange({ stage: toStr(arr), includesClosed: isClosed || undefined })
        }}
      />

      <MultiSelect
        label="Owner"
        value={toArr(filters.ownerName)}
        options={owners.map(o => ({ label: o, value: o }))}
        onChange={arr => onChange({ ownerName: toStr(arr) })}
      />

      <MultiSelect
        label="Segmento"
        value={toArr(filters.accountSegment)}
        options={[
          { label: 'SMB', value: 'SMB' },
          { label: 'Mid-Market', value: 'MID' },
          { label: 'Enterprise', value: 'ENT' },
        ]}
        onChange={arr => onChange({ accountSegment: toStr(arr) })}
      />

      <MultiSelect
        label="Risco"
        value={toArr(filters.riskLevel)}
        options={[
          { label: '🔴 Crítico', value: 'HIGH' },
          { label: '🟡 Em risco', value: 'MEDIUM' },
          { label: '🟢 Saudável', value: 'LOW' },
        ]}
        onChange={arr => onChange({ riskLevel: toStr(arr) })}
      />

      {showSort && (
        <Select
          label="Ordenar por"
          value={filters.sortBy || 'riskScore'}
          options={[
            { label: 'Risco', value: 'riskScore' },
            { label: 'Valor', value: 'amount' },
            { label: 'Dias no estágio', value: 'daysInCurrentStage' },
            { label: 'Última atividade', value: 'lastActivityAt' },
            { label: 'Fecha em', value: 'expectedCloseDate' },
          ]}
          onChange={v => onChange({ sortBy: v })}
        />
      )}

      {hasActive && (
        <button
          onClick={onReset}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 px-2 py-1.5 rounded-xl transition-colors glass-input hover:bg-white/[0.06]"
        >
          <X size={12} /> Limpar
        </button>
      )}
    </div>
  )
}
