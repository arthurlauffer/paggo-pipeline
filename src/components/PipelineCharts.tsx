'use client'

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, FunnelChart, Funnel, LabelList,
} from 'recharts'
import type { PipelineSummary } from '@/lib/types'
import { STAGE_COLORS } from '@/lib/types'

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return `${Math.round(n)}`
}

const RISK_COLORS = { HIGH: '#ef4444', MEDIUM: '#f59e0b', LOW: '#22c55e' }
const RISK_LABELS = { HIGH: 'Crítico', MEDIUM: 'Em risco', LOW: 'Saudável' }

const tooltipStyle = {
  backgroundColor: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '8px',
  color: '#f1f5f9',
  fontSize: 12,
}

interface Props {
  summary: PipelineSummary
}

export function PipelineCharts({ summary }: Props) {
  const stageData = summary.byStage.map(s => ({
    stage: s.stage,
    count: s.count,
    value: Math.round(s.value / 1000),
    fill: STAGE_COLORS[s.stage as keyof typeof STAGE_COLORS],
  }))

  const ownerData = summary.byOwner.slice(0, 10).map(o => ({
    name: o.owner.split(' ')[0],
    value: Math.round(o.value / 1000),
    deals: o.count,
    highRisk: o.highRisk,
  }))

  const riskData = summary.riskDistribution.map(r => ({
    name: RISK_LABELS[r.level as keyof typeof RISK_LABELS],
    value: r.count,
    color: RISK_COLORS[r.level as keyof typeof RISK_COLORS],
  }))

  const segmentData = summary.bySegment.map(s => ({
    name: s.segment,
    winRate: Math.round(s.winRate * 100),
    deals: s.count,
    value: Math.round(s.value / 1000),
  }))

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Funnel by stage - deal count */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <h3 className="text-sm font-medium text-slate-200 mb-4">Funil de Estágios (qtd. deals)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={stageData} layout="vertical" margin={{ left: 10, right: 20 }}>
            <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <YAxis dataKey="stage" type="category" tick={{ fill: '#94a3b8', fontSize: 11 }} width={90} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v, 'Deals']} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {stageData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Value by stage */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <h3 className="text-sm font-medium text-slate-200 mb-4">Valor por Estágio (R$ mil)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={stageData} layout="vertical" margin={{ left: 10, right: 20 }}>
            <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={fmt} />
            <YAxis dataKey="stage" type="category" tick={{ fill: '#94a3b8', fontSize: 11 }} width={90} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`R$ ${v}K`, 'Valor']} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {stageData.map((entry, i) => <Cell key={i} fill={entry.fill} opacity={0.8} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Risk distribution */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <h3 className="text-sm font-medium text-slate-200 mb-4">Distribuição de Risco</h3>
        <div className="flex items-center justify-center">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={riskData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
              >
                {riskData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => [v + ' deals', name]} />
              <Legend
                formatter={(value) => <span style={{ color: '#94a3b8', fontSize: 12 }}>{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Owner load */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <h3 className="text-sm font-medium text-slate-200 mb-4">Carga por Owner (R$ mil pipeline)</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={ownerData} margin={{ bottom: 20 }}>
            <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} angle={-35} textAnchor="end" />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={fmt} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`R$ ${v}K`, 'Valor']} />
            <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]}>
              {ownerData.map((entry, i) => (
                <Cell key={i} fill={entry.highRisk > 3 ? '#ef4444' : '#6366f1'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Win rate by segment */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 lg:col-span-2">
        <h3 className="text-sm font-medium text-slate-200 mb-4">Win Rate por Segmento (%)</h3>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={segmentData}>
            <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => `${v}%`} domain={[0, 100]} />
            <Tooltip contentStyle={tooltipStyle}
              formatter={(v: number, name: string) => [
                name === 'winRate' ? `${v}%` : name === 'deals' ? `${v} deals` : `R$ ${v}K`,
                name === 'winRate' ? 'Win Rate' : name === 'deals' ? 'Deals abertos' : 'Valor'
              ]} />
            <Bar dataKey="winRate" fill="#22c55e" radius={[4, 4, 0, 0]}>
              {segmentData.map((_, i) => (
                <Cell key={i} fill={['#6366f1', '#06b6d4', '#8b5cf6'][i % 3]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
