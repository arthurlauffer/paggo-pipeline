'use client'

import { AlertTriangle, TrendingDown, Clock, DollarSign, RefreshCw } from 'lucide-react'
import type { PipelineSummary } from '@/lib/types'

function fmt(n: number) {
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `R$ ${(n / 1_000).toFixed(0)}K`
  return `R$ ${n.toFixed(0)}`
}

interface Props {
  summary: PipelineSummary | null
  loading: boolean
}

export function KPICards({ summary, loading }: Props) {
  if (loading || !summary) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="glass-md rounded-2xl p-4 animate-pulse h-24" />
        ))}
      </div>
    )
  }

  const cards = [
    {
      label: 'Pipeline Aberto',
      value: fmt(summary.totalOpenValue),
      sub: `${summary.totalOpenDeals} deals · ponderado ${fmt(summary.weightedValue)}`,
      icon: DollarSign,
      color: 'text-indigo-400',
      bg: 'bg-indigo-500/10',
    },
    {
      label: 'Em Risco Crítico',
      value: summary.highRiskCount.toString(),
      sub: `+ ${summary.mediumRiskCount} em atenção`,
      icon: AlertTriangle,
      color: 'text-red-400',
      bg: 'bg-red-500/10',
    },
    {
      label: 'Data Vencida',
      value: summary.overdueCount.toString(),
      sub: 'close date ultrapassada',
      icon: TrendingDown,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
    },
    {
      label: 'Fechando em 30d',
      value: summary.closingThisMonthCount.toString(),
      sub: 'requerem atenção agora',
      icon: Clock,
      color: 'text-sky-400',
      bg: 'bg-sky-500/10',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map(c => (
        <div key={c.label} className="glass-md rounded-2xl p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-slate-400 mb-1">{c.label}</p>
              <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
              <p className="text-xs text-slate-500 mt-1">{c.sub}</p>
            </div>
            <div className={`p-2 rounded-lg ${c.bg}`}>
              <c.icon size={18} className={c.color} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
