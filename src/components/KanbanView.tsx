'use client'

import { useState, useEffect, useRef } from 'react'
import { MessageSquare, Plus, SlidersHorizontal, Eye, EyeOff } from 'lucide-react'
import { RiskBadge } from './RiskBadge'
import { NewDealModal } from './NewDealModal'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Deal, Stage, RiskFlag } from '@/lib/types'
import { STAGE_COLORS, ACTIVE_STAGES } from '@/lib/types'

function fmt(n: number) {
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `R$ ${(n / 1_000).toFixed(0)}K`
  return `R$ ${Math.round(n)}`
}

function relDate(iso: string | null) {
  if (!iso) return null
  try { return formatDistanceToNow(parseISO(iso), { locale: ptBR, addSuffix: true }) } catch { return null }
}

const STAGE_LABELS: Record<Stage, string> = {
  LEAD: 'Lead',
  QUALIFIED: 'Qualificado',
  DISCOVERY: 'Discovery',
  DEMO: 'Demo',
  PROPOSAL: 'Proposta',
  NEGOTIATION: 'Negociação',
  CLOSED_WON: 'Ganho',
  CLOSED_LOST: 'Perdido',
}

const SEGMENT_BADGE: Record<string, string> = {
  SMB: 'bg-white/10 text-slate-300',
  MID: 'bg-blue-900/60 text-blue-300',
  ENT: 'bg-purple-900/60 text-purple-300',
}

interface Props {
  deals: Deal[]
  selectedId: string | null
  onSelect: (id: string) => void
  onStageMove: (dealId: string, newStage: Stage) => void
  onOpenComments?: (dealId: string) => void
  onDealCreated?: () => void
  loading: boolean
}

export function KanbanView({ deals, selectedId, onSelect, onStageMove, onOpenComments, onDealCreated, loading }: Props) {
  const [dragOverStage, setDragOverStage] = useState<Stage | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [showNewDeal, setShowNewDeal] = useState(false)
  const [hidden, setHidden] = useState<Set<Stage>>(new Set())
  const [showCols, setShowCols] = useState(false)
  const colsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showCols) return
    const h = (e: MouseEvent) => { if (colsRef.current && !colsRef.current.contains(e.target as Node)) setShowCols(false) }
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [showCols])

  // Show closed-stage columns only when such deals are present in the result set
  // (e.g. when the user filters for "Ganho"/"Perdido" deals).
  const closedPresent = (['CLOSED_WON', 'CLOSED_LOST'] as Stage[]).filter(
    s => deals.some(d => d.stage === s)
  )
  const candidateStages: Stage[] = [...ACTIVE_STAGES, ...closedPresent]
  // Columns the user has chosen to hide are dropped from the board.
  const displayStages: Stage[] = candidateStages.filter(s => !hidden.has(s))

  const toggleStage = (s: Stage) =>
    setHidden(prev => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s); else next.add(s)
      return next
    })

  const grouped = displayStages.reduce<Record<Stage, Deal[]>>((acc, stage) => {
    acc[stage] = deals.filter(d => d.stage === stage)
    return acc
  }, {} as Record<Stage, Deal[]>)

  const handleDragStart = (e: React.DragEvent, deal: Deal) => {
    setDraggingId(deal.dealId)
    e.dataTransfer.setData('dealId', deal.dealId)
    e.dataTransfer.setData('fromStage', deal.stage)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, stage: Stage) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverStage(stage)
  }

  const handleDrop = (e: React.DragEvent, toStage: Stage) => {
    e.preventDefault()
    const dealId = e.dataTransfer.getData('dealId')
    const fromStage = e.dataTransfer.getData('fromStage')
    setDragOverStage(null)
    setDraggingId(null)
    if (dealId && fromStage !== toStage) {
      onStageMove(dealId, toStage)
    }
  }

  const handleDragEnd = () => {
    setDragOverStage(null)
    setDraggingId(null)
  }

  if (loading) {
    return (
      <div className="flex gap-3 h-full px-4 py-3 overflow-x-auto">
        {ACTIVE_STAGES.map(stage => (
          <div key={stage} className="flex-shrink-0 w-64 glass-md rounded-xl animate-pulse min-h-[200px]" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar with column visibility + "Novo Deal" */}
      <div className="flex-shrink-0 flex items-center justify-end gap-2 px-4 pt-2 pb-1">
        {/* Column visibility */}
        <div ref={colsRef} className="relative">
          <button
            onClick={() => setShowCols(o => !o)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              hidden.size ? 'text-indigo-300 bg-indigo-500/10' : 'text-slate-300 hover:bg-white/[0.06]'
            }`}
            style={{ border: '1px solid rgba(255,255,255,0.1)' }}
            title="Mostrar/ocultar colunas"
          >
            <SlidersHorizontal size={12} />
            Colunas{hidden.size ? ` (${candidateStages.length - hidden.size}/${candidateStages.length})` : ''}
          </button>

          {showCols && (
            <div className="absolute right-0 z-30 mt-1 min-w-[200px] glass-strong rounded-xl p-1.5 shadow-2xl border border-white/[0.08]">
              <p className="px-2 py-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Estágios visíveis</p>
              {candidateStages.map(s => {
                const visible = !hidden.has(s)
                return (
                  <button
                    key={s}
                    onClick={() => toggleStage(s)}
                    className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg text-sm text-slate-200 hover:bg-white/[0.07] transition-colors"
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: STAGE_COLORS[s] }} />
                    <span className="flex-1 truncate">{STAGE_LABELS[s]}</span>
                    {visible ? <Eye size={13} className="text-slate-400" /> : <EyeOff size={13} className="text-slate-600" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <button
          onClick={() => setShowNewDeal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-300 hover:text-white hover:bg-indigo-600 transition-all"
          style={{ border: '1px solid rgba(99,102,241,0.35)' }}
        >
          <Plus size={12} />
          Novo Deal
        </button>
      </div>

      <div className="flex-1 flex gap-3 px-4 py-2 overflow-x-auto min-h-0">
      {displayStages.map(stage => {
        const stageDeals = grouped[stage] || []
        const stageValue = stageDeals.reduce((s, d) => s + d.amount, 0)
        const highRisk = stageDeals.filter(d => d.riskLevel === 'HIGH').length
        const isDragOver = dragOverStage === stage
        const stageColor = STAGE_COLORS[stage]

        return (
          <div
            key={stage}
            className={`flex-shrink-0 w-64 flex flex-col rounded-xl glass-md transition-all ${
              isDragOver ? 'scale-[1.01]' : ''
            }`}
            style={isDragOver ? { borderColor: 'rgba(99,102,241,0.6)', background: 'rgba(99,102,241,0.04)' } : {}}
            onDragOver={e => handleDragOver(e, stage)}
            onDragLeave={() => setDragOverStage(null)}
            onDrop={e => handleDrop(e, stage)}
          >
            {/* Column header */}
            <div className="flex-shrink-0 px-3 pt-3 pb-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stageColor }} />
                  <span className="text-xs font-semibold text-slate-200">
                    {STAGE_LABELS[stage]}
                  </span>
                </div>
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-md bg-white/10 text-slate-300">
                  {stageDeals.length}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-slate-400 font-medium">{fmt(stageValue)}</span>
                {highRisk > 0 && (
                  <span className="text-red-400 font-medium">
                    🔴 {highRisk} crítico{highRisk > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2 min-h-0">
              {stageDeals.length === 0 ? (
                <div className={`h-16 border-2 border-dashed rounded-lg flex items-center justify-center transition-colors ${
                  isDragOver ? 'border-indigo-500/50 text-indigo-400' : 'border-white/10 text-slate-600'
                }`}>
                  <span className="text-xs">{isDragOver ? 'Soltar aqui' : 'Vazio'}</span>
                </div>
              ) : (
                stageDeals.map(deal => {
                  const flags: RiskFlag[] = (() => {
                    try { return JSON.parse(deal.riskFlags) } catch { return [] }
                  })()
                  const isSelected = deal.dealId === selectedId
                  const isDragging = draggingId === deal.dealId
                  const isOverdue = new Date(deal.expectedCloseDate) < new Date('2026-05-20')
                  const riskColor = deal.riskLevel === 'HIGH' ? '#ef4444' : deal.riskLevel === 'MEDIUM' ? '#f59e0b' : '#22c55e'

                  return (
                    <div
                      key={deal.dealId}
                      draggable
                      onDragStart={e => handleDragStart(e, deal)}
                      onDragEnd={handleDragEnd}
                      onClick={() => onSelect(deal.dealId)}
                      className={`rounded-lg cursor-grab active:cursor-grabbing transition-all select-none ${
                        isDragging ? 'opacity-40 scale-95' : 'opacity-100'
                      } ${
                        isSelected
                          ? 'glass-accent shadow-lg shadow-indigo-500/10'
                          : 'glass hover:bg-white/[0.04]'
                      }`}
                      style={{ borderLeftColor: riskColor, borderLeftWidth: 3 }}
                    >
                      <div className="px-2.5 py-2">
                        {/* Account name */}
                        <div className="text-xs font-semibold text-slate-100 leading-tight mb-1.5 line-clamp-2">
                          {deal.accountName}
                        </div>

                        {/* Segment + value row */}
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${SEGMENT_BADGE[deal.accountSegment] || ''}`}>
                            {deal.accountSegment}
                          </span>
                          <span className="text-xs font-bold text-slate-200">{fmt(deal.amount)}</span>
                        </div>

                        {/* Owner */}
                        <div className="text-[10px] text-slate-400 mb-2 truncate">
                          👤 {deal.ownerName}
                        </div>

                        {/* Activity + days */}
                        <div className="flex items-center justify-between text-[10px] text-slate-500 mb-2">
                          <span>
                            {deal.lastActivityAt
                              ? `🕐 ${relDate(deal.lastActivityAt)}`
                              : '⚠️ Sem atividade'}
                          </span>
                          <span className={isOverdue ? 'text-red-400' : ''}>
                            {isOverdue ? '🔴 Vencido' : `${deal.daysInCurrentStage}d`}
                          </span>
                        </div>

                        {/* Risk badge + comment bubble */}
                        <div className="flex items-center justify-between">
                          <RiskBadge level={deal.riskLevel} score={deal.riskScore} compact />
                          <button
                            onClick={e => { e.stopPropagation(); onOpenComments?.(deal.dealId) }}
                            title="Ver comentários"
                            className={`flex items-center gap-1 px-1.5 py-1 rounded-md transition-colors ${
                              (deal.commentCount ?? 0) > 0
                                ? 'text-indigo-400 hover:bg-indigo-500/20'
                                : 'text-slate-600 hover:text-slate-400 hover:bg-white/[0.08]'
                            }`}
                          >
                            <MessageSquare size={11} />
                            {(deal.commentCount ?? 0) > 0 && (
                              <span className="text-[10px] font-semibold leading-none">{deal.commentCount}</span>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Drop zone indicator */}
            {isDragOver && stageDeals.length > 0 && (
              <div className="flex-shrink-0 mx-2 mb-2 h-10 border-2 border-dashed border-indigo-500/50 rounded-lg flex items-center justify-center">
                <span className="text-[10px] text-indigo-400">Soltar aqui</span>
              </div>
            )}
          </div>
        )
      })}
      </div>{/* end flex gap-3 */}

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
