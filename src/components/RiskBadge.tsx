'use client'

import { flagLabel } from '@/lib/risk'
import type { RiskFlag, RiskLevel } from '@/lib/types'

const LEVEL_STYLES: Record<RiskLevel, string> = {
  HIGH:   'bg-red-500/20 text-red-400 border border-red-500/40',
  MEDIUM: 'bg-amber-500/20 text-amber-400 border border-amber-500/40',
  LOW:    'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40',
}

const LEVEL_DOT: Record<RiskLevel, string> = {
  HIGH:   'bg-red-500',
  MEDIUM: 'bg-amber-500',
  LOW:    'bg-emerald-500',
}

const LEVEL_LABEL: Record<RiskLevel, string> = {
  HIGH: 'Crítico',
  MEDIUM: 'Em risco',
  LOW: 'Saudável',
}

interface Props {
  level: RiskLevel
  score: number
  flags?: RiskFlag[]
  showFlags?: boolean
  compact?: boolean
}

export function RiskBadge({ level, score, flags = [], showFlags = false, compact = false }: Props) {
  return (
    <div className="flex flex-col gap-1">
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${LEVEL_STYLES[level]}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${LEVEL_DOT[level]}`} />
        {compact ? score : `${LEVEL_LABEL[level]} (${score})`}
      </span>
      {showFlags && flags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {flags.map(f => (
            <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
              {flagLabel(f)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
