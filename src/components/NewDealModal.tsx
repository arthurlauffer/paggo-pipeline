'use client'

import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import type { Stage, Segment } from '@/lib/types'
import { ACTIVE_STAGES } from '@/lib/types'

const SEGMENTS: Segment[] = ['SMB', 'MID', 'ENT']
const INDUSTRIES = [
  'Tecnologia', 'Financeiro', 'Varejo', 'Saúde', 'Educação',
  'Logística', 'Indústria', 'Serviços', 'Agronegócio', 'Outros',
]

const STAGE_LABELS: Partial<Record<Stage, string>> = {
  LEAD: 'Lead', QUALIFIED: 'Qualificado', DISCOVERY: 'Discovery',
  DEMO: 'Demo', PROPOSAL: 'Proposta', NEGOTIATION: 'Negociação',
}

interface Props {
  onClose:   () => void
  onCreated: () => void
}

export function NewDealModal({ onClose, onCreated }: Props) {
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  const today = new Date()
  const defaultClose = new Date(today.getFullYear(), today.getMonth() + 3, today.getDate())
    .toISOString().slice(0, 10)

  const [form, setForm] = useState({
    accountName:      '',
    ownerName:        '',
    amount:           '',
    expectedCloseDate: defaultClose,
    stage:            'LEAD' as Stage,
    accountSegment:   'SMB' as Segment,
    industry:         'Tecnologia',
    productInterest:  '',
  })

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  const handleSubmit = async () => {
    setError(null)
    if (!form.accountName.trim()) return setError('Nome da conta é obrigatório')
    if (!form.ownerName.trim())   return setError('Owner é obrigatório')
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0) return setError('Valor inválido')
    if (!form.expectedCloseDate) return setError('Data de fechamento é obrigatória')

    setSaving(true)
    try {
      const res = await fetch('/api/deals', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          ...form,
          amount: Number(form.amount),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Erro ao criar deal')
      } else {
        onCreated()
        onClose()
      }
    } catch {
      setError('Erro de conexão')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="glass-menu rounded-2xl w-full max-w-md shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2">
            <Plus size={16} className="text-indigo-400" />
            <h3 className="font-semibold text-slate-100">Novo Deal</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <div className="p-5 space-y-4">

          {/* Row 1: Account name */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Nome da conta <span className="text-red-400">*</span></label>
            <input
              autoFocus
              value={form.accountName}
              onChange={e => set('accountName', e.target.value)}
              placeholder="Ex: Metalúrgica Costa Ltda"
              className="w-full glass-input rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none"
            />
          </div>

          {/* Row 2: Owner + Segment */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Owner <span className="text-red-400">*</span></label>
              <input
                value={form.ownerName}
                onChange={e => set('ownerName', e.target.value)}
                placeholder="Nome do owner"
                className="w-full glass-input rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Segmento</label>
              <select
                value={form.accountSegment}
                onChange={e => set('accountSegment', e.target.value)}
                className="w-full glass-input rounded-xl px-3 py-2 text-sm"
              >
                {SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Row 3: Amount + Stage */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Valor (R$) <span className="text-red-400">*</span></label>
              <input
                type="number"
                min="0"
                step="1000"
                value={form.amount}
                onChange={e => set('amount', e.target.value)}
                placeholder="Ex: 50000"
                className="w-full glass-input rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Estágio inicial</label>
              <select
                value={form.stage}
                onChange={e => set('stage', e.target.value)}
                className="w-full glass-input rounded-xl px-3 py-2 text-sm"
              >
                {ACTIVE_STAGES.map(s => (
                  <option key={s} value={s}>{STAGE_LABELS[s] || s}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 4: Close date + Industry */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Fecha em <span className="text-red-400">*</span></label>
              <input
                type="date"
                value={form.expectedCloseDate}
                onChange={e => set('expectedCloseDate', e.target.value)}
                className="w-full glass-input rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Indústria</label>
              <select
                value={form.industry}
                onChange={e => set('industry', e.target.value)}
                className="w-full glass-input rounded-xl px-3 py-2 text-sm"
              >
                {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
          </div>

          {/* Row 5: Product */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Produto / Interesse</label>
            <input
              value={form.productInterest}
              onChange={e => set('productInterest', e.target.value)}
              placeholder="Ex: Paggo Pay Pro"
              className="w-full glass-input rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 pb-5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm text-slate-400 hover:text-slate-200 transition-colors"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            <Plus size={14} />
            {saving ? 'Criando…' : 'Criar Deal'}
          </button>
        </div>
      </div>
    </div>
  )
}
