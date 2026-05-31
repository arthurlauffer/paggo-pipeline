'use client'

import { Search, X } from 'lucide-react'
import type { DealFilters, Stage, Segment, RiskLevel } from '@/lib/types'

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

interface Props {
  filters: DealFilters
  owners: string[]
  onChange: (f: Partial<DealFilters>) => void
  onReset: () => void
  showSort?: boolean
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

      <Select
        label="Estágio"
        value={filters.stage || ''}
        options={STAGES.map(s => ({ label: STAGE_LABELS[s], value: s }))}
        onChange={v => {
          const stage = (v as Stage) || undefined
          const isClosed = stage === 'CLOSED_WON' || stage === 'CLOSED_LOST'
          onChange({ stage, includesClosed: isClosed || undefined })
        }}
      />

      <Select
        label="Owner"
        value={filters.ownerName || ''}
        options={owners.map(o => ({ label: o, value: o }))}
        onChange={v => onChange({ ownerName: v || undefined })}
      />

      <Select
        label="Segmento"
        value={filters.accountSegment || ''}
        options={[
          { label: 'SMB', value: 'SMB' },
          { label: 'Mid-Market', value: 'MID' },
          { label: 'Enterprise', value: 'ENT' },
        ]}
        onChange={v => onChange({ accountSegment: (v as Segment) || undefined })}
      />

      <Select
        label="Risco"
        value={filters.riskLevel || ''}
        options={[
          { label: '🔴 Crítico', value: 'HIGH' },
          { label: '🟡 Em risco', value: 'MEDIUM' },
          { label: '🟢 Saudável', value: 'LOW' },
        ]}
        onChange={v => onChange({ riskLevel: (v as RiskLevel) || undefined })}
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
