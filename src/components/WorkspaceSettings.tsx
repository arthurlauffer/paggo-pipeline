'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Settings, Users, Camera, Trash2, Copy, Check, ExternalLink,
  Loader2, UserPlus, Crown, Mail, UsersRound, Plus,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Workspace { id: string; name: string; slug: string; logo: string | null; updated_at: string }
interface Member {
  id: string; name: string; email: string | null; role: string
  initials: string; color: string; status: 'active' | 'invited'; createdAt: string
}
interface Team {
  id: string; name: string; color: string; memberIds: string[]
  members: { id: string; name: string; initials: string; color: string }[]; createdAt: string
}

const TEAM_COLORS = [
  'bg-indigo-500', 'bg-purple-500', 'bg-blue-500', 'bg-emerald-500',
  'bg-amber-500', 'bg-pink-500', 'bg-cyan-500', 'bg-rose-500', 'bg-teal-500',
]

type Section = 'general' | 'members' | 'teams'

interface Props {
  initialSection?: Section
  onClose: () => void
  onUpdated?: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WorkspaceSettings({ initialSection = 'general', onClose, onUpdated }: Props) {
  const [section, setSection] = useState<Section>(initialSection)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  // Close on Esc
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  if (!mounted) return null

  const modal = (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="glass-strong w-full max-w-3xl h-[560px] rounded-2xl overflow-hidden flex shadow-2xl">

        {/* ── Left nav ── */}
        <div className="w-48 flex-shrink-0 flex flex-col p-3 gap-1" style={{ borderRight: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
          <div className="px-2 py-2 mb-1">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Workspace</p>
          </div>
          <NavBtn active={section === 'general'} onClick={() => setSection('general')} Icon={Settings} label="Geral" />
          <NavBtn active={section === 'members'} onClick={() => setSection('members')} Icon={Users} label="Membros" />
          <NavBtn active={section === 'teams'} onClick={() => setSection('teams')} Icon={UsersRound} label="Equipes" />
        </div>

        {/* ── Content ── */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-shrink-0 flex items-center justify-end px-4 pt-4">
            <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] rounded-lg transition-colors">
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-8 pb-8 -mt-2">
            {section === 'general' && <GeneralSection onUpdated={onUpdated} />}
            {section === 'members' && <MembersSection />}
            {section === 'teams' && <TeamsSection />}
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}

function NavBtn({ active, onClick, Icon, label }: { active: boolean; onClick: () => void; Icon: React.ElementType; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-all ${
        active ? 'glass-accent text-indigo-300' : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.06]'
      }`}
    >
      <Icon size={15} />
      {label}
    </button>
  )
}

// ─── General section (logo / name / slug) ──────────────────────────────────────

function GeneralSection({ onUpdated }: { onUpdated?: () => void }) {
  const [ws, setWs]           = useState<Workspace | null>(null)
  const [name, setName]       = useState('')
  const [slug, setSlug]       = useState('')
  const [logo, setLogo]       = useState<string | null>(null)
  const [saving, setSaving]   = useState(false)
  const [savedAt, setSavedAt] = useState(0)
  const [copied, setCopied]   = useState(false)
  const [error, setError]     = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/workspace').then(r => r.json()).then((w: Workspace) => {
      setWs(w); setName(w.name); setSlug(w.slug); setLogo(w.logo)
    })
  }, [])

  const dirty = ws && (name !== ws.name || slug !== ws.slug || logo !== ws.logo)

  const save = async (override?: Partial<Workspace>) => {
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug, logo, ...override }),
      })
      const updated: Workspace = await res.json()
      setWs(updated); setName(updated.name); setSlug(updated.slug); setLogo(updated.logo)
      setSavedAt(Date.now())
      onUpdated?.()
    } catch { setError('Falha ao salvar. Tente novamente.') }
    finally { setSaving(false) }
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/gif'].includes(file.type)) {
      setError('Use PNG, JPEG ou GIF.'); return
    }
    if (file.size > 10 * 1024 * 1024) { setError('Arquivo acima de 10MB.'); return }
    const reader = new FileReader()
    reader.onload = () => { const data = reader.result as string; setLogo(data); save({ logo: data }) }
    reader.readAsDataURL(file)
  }

  const removeLogo = () => { setLogo(null); save({ logo: null as any }) }

  if (!ws) return <div className="flex items-center justify-center h-full text-slate-600"><Loader2 className="animate-spin" size={20} /></div>

  return (
    <div className="space-y-7 pt-2">
      <div>
        <h2 className="text-2xl font-bold text-slate-100">Geral</h2>
        <p className="text-sm text-slate-500 mt-1">
          Altere as configurações do seu workspace.{' '}
          <a className="text-slate-400 hover:text-indigo-300 underline inline-flex items-center gap-0.5" href="#">Saiba mais <ExternalLink size={11} /></a>
        </p>
      </div>

      <div className="glass-divider" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }} />

      {/* Logo */}
      <div className="flex items-start gap-5">
        <div className="w-20 h-20 rounded-2xl flex-shrink-0 overflow-hidden bg-white flex items-center justify-center shadow-lg">
          {logo
            ? <img src={logo} alt="logo" className="w-full h-full object-cover" />
            : <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                <span className="text-2xl font-bold text-white">{(name[0] || 'P').toUpperCase()}</span>
              </div>}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-200">Logo do workspace</h3>
          <p className="text-xs text-slate-500 mt-0.5 mb-3">Aceitamos PNG, JPEG e GIF de até 10MB</p>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif" className="hidden" onChange={handleFile} />
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Camera size={14} /> Enviar novo logo
            </button>
            {logo && (
              <button
                onClick={removeLogo}
                className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                title="Remover logo"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Name + Slug */}
      <div className="grid grid-cols-2 gap-5">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Nome</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={60}
            className="w-full glass-input rounded-lg px-3 py-2.5 text-sm text-slate-100"
            placeholder="Nome do workspace"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Slug</label>
          <div className="relative">
            <input
              value={slug}
              onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
              maxLength={48}
              className="w-full glass-input rounded-lg pl-3 pr-10 py-2.5 text-sm text-slate-100"
              placeholder="slug-do-workspace"
            />
            <button
              onClick={() => { navigator.clipboard?.writeText(slug); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-200 transition-colors"
              title="Copiar slug"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Save bar */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={() => save()}
          disabled={!dirty || saving}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          Salvar alterações
        </button>
        {savedAt > 0 && !dirty && <span className="text-xs text-emerald-400 flex items-center gap-1"><Check size={13} /> Salvo</span>}
      </div>
    </div>
  )
}

// ─── Members section ────────────────────────────────────────────────────────────

function MembersSection() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail]     = useState('')
  const [name, setName]       = useState('')
  const [role, setRole]       = useState('Member')
  const [inviting, setInviting] = useState(false)
  const [error, setError]     = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { members } = await fetch('/api/workspace/members').then(r => r.json())
    setMembers(members); setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const invite = async () => {
    setInviting(true); setError('')
    try {
      const res = await fetch('/api/workspace/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, role }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Falha ao convidar.'); return }
      setEmail(''); setName(''); setRole('Member')
      await load()
    } finally { setInviting(false) }
  }

  const remove = async (id: string) => {
    await fetch(`/api/workspace/members/${id}`, { method: 'DELETE' })
    await load()
  }

  return (
    <div className="space-y-6 pt-2">
      <div>
        <h2 className="text-2xl font-bold text-slate-100">Membros</h2>
        <p className="text-sm text-slate-500 mt-1">Convide e gerencie quem tem acesso ao workspace.</p>
      </div>

      {/* Invite form */}
      <div className="glass-md rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <UserPlus size={15} className="text-indigo-400" />
          <h3 className="text-sm font-semibold text-slate-200">Convidar membro</h3>
        </div>
        <div className="grid grid-cols-[1.4fr_1fr_auto] gap-2">
          <input
            value={email} onChange={e => setEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && email.trim()) invite() }}
            placeholder="email@empresa.com"
            className="glass-input rounded-lg px-3 py-2 text-sm text-slate-100"
          />
          <select value={role} onChange={e => setRole(e.target.value)} className="glass-input rounded-lg px-3 py-2 text-sm text-slate-100">
            <option>Member</option>
            <option>Sales Manager</option>
            <option>Account Executive</option>
            <option>Customer Success</option>
            <option>Sales Director</option>
            <option>Admin</option>
          </select>
          <button
            onClick={invite}
            disabled={!email.trim() || inviting}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
          >
            {inviting ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
            Convidar
          </button>
        </div>
        <input
          value={name} onChange={e => setName(e.target.value)}
          placeholder="Nome (opcional)"
          className="glass-input rounded-lg px-3 py-2 text-sm text-slate-100 w-full mt-2"
        />
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      </div>

      {/* Member list */}
      <div>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
          {members.length} {members.length === 1 ? 'membro' : 'membros'}
        </p>
        {loading ? (
          <div className="flex items-center justify-center py-10 text-slate-600"><Loader2 className="animate-spin" size={18} /></div>
        ) : (
          <div className="space-y-1.5">
            {members.map(m => (
              <div key={m.id} className="group flex items-center gap-3 px-3 py-2.5 glass-md rounded-xl">
                <div className={`w-9 h-9 rounded-full ${m.color} flex items-center justify-center flex-shrink-0`}>
                  <span className="text-xs font-bold text-white">{m.initials}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-slate-200 truncate">{m.name}</span>
                    {m.role === 'Owner' && <Crown size={12} className="text-amber-400 flex-shrink-0" />}
                  </div>
                  <span className="text-xs text-slate-500 truncate">{m.email}</span>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  m.status === 'invited' ? 'bg-amber-500/15 text-amber-300' : 'bg-slate-700/60 text-slate-400'
                }`}>
                  {m.status === 'invited' ? 'Convidado' : m.role}
                </span>
                {m.role !== 'Owner' && (
                  <button
                    onClick={() => remove(m.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                    title="Remover"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Teams section ──────────────────────────────────────────────────────────────

function TeamsSection() {
  const [teams, setTeams]     = useState<Team[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName]       = useState('')
  const [color, setColor]     = useState(TEAM_COLORS[0])
  const [creating, setCreating] = useState(false)
  const [error, setError]     = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [t, m] = await Promise.all([
      fetch('/api/workspace/teams').then(r => r.json()),
      fetch('/api/workspace/members').then(r => r.json()),
    ])
    setTeams(t.teams || []); setMembers(m.members || []); setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const create = async () => {
    if (!name.trim()) return
    setCreating(true); setError('')
    try {
      const res = await fetch('/api/workspace/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Falha ao criar equipe.'); return }
      setName(''); setColor(TEAM_COLORS[teams.length % TEAM_COLORS.length])
      await load()
    } finally { setCreating(false) }
  }

  const patch = async (id: string, body: Record<string, unknown>) => {
    await fetch(`/api/workspace/teams/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    await load()
  }

  const removeTeam = async (id: string) => {
    await fetch(`/api/workspace/teams/${id}`, { method: 'DELETE' })
    await load()
  }

  const toggleMember = (team: Team, memberId: string) => {
    const next = team.memberIds.includes(memberId)
      ? team.memberIds.filter(x => x !== memberId)
      : [...team.memberIds, memberId]
    patch(team.id, { memberIds: next })
  }

  return (
    <div className="space-y-6 pt-2">
      <div>
        <h2 className="text-2xl font-bold text-slate-100">Equipes</h2>
        <p className="text-sm text-slate-500 mt-1">
          Crie equipes para organizar o time. Mencione uma equipe nas notas de um deal com <span className="text-indigo-400">@NomeDaEquipe</span> para notificar todos os membros.
        </p>
      </div>

      {/* Create team */}
      <div className="glass-md rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <UsersRound size={15} className="text-indigo-400" />
          <h3 className="text-sm font-semibold text-slate-200">Nova equipe</h3>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && name.trim()) create() }}
            placeholder="Ex.: Vendas, Customer Success…"
            className="flex-1 glass-input rounded-lg px-3 py-2 text-sm text-slate-100"
          />
          <button
            onClick={create}
            disabled={!name.trim() || creating}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Criar equipe
          </button>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <span className="text-[11px] text-slate-500">Cor:</span>
          {TEAM_COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-5 h-5 rounded-full ${c} transition-transform ${color === c ? 'ring-2 ring-white/70 scale-110' : 'opacity-70 hover:opacity-100'}`}
              title={c}
            />
          ))}
        </div>
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      </div>

      {/* Teams list */}
      {loading ? (
        <div className="flex items-center justify-center py-10 text-slate-600"><Loader2 className="animate-spin" size={18} /></div>
      ) : teams.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-6">Nenhuma equipe ainda. Crie a primeira acima.</p>
      ) : (
        <div className="space-y-3">
          {teams.map(team => {
            const available = members.filter(m => !team.memberIds.includes(m.id))
            return (
              <div key={team.id} className="glass-md rounded-xl p-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <span className={`w-3 h-3 rounded-full ${team.color} flex-shrink-0`} />
                  <span className="text-sm font-semibold text-slate-200">{team.name}</span>
                  <span className="text-[11px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">@{team.name}</span>
                  <span className="text-[11px] text-slate-500">
                    {team.members.length} {team.members.length === 1 ? 'membro' : 'membros'}
                  </span>
                  <button
                    onClick={() => removeTeam(team.id)}
                    className="ml-auto p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Excluir equipe"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Member chips */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {team.members.map(m => (
                    <span key={m.id} className="group/chip flex items-center gap-1.5 pl-1 pr-2 py-1 bg-white/[0.05] rounded-full">
                      <span className={`w-5 h-5 rounded-full ${m.color} flex items-center justify-center text-[8px] font-bold text-white`}>{m.initials}</span>
                      <span className="text-xs text-slate-300">{m.name}</span>
                      <button
                        onClick={() => toggleMember(team, m.id)}
                        className="text-slate-500 hover:text-red-400 transition-colors"
                        title="Remover da equipe"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}

                  {/* Add member */}
                  {available.length > 0 && (
                    <select
                      value=""
                      onChange={e => { if (e.target.value) toggleMember(team, e.target.value) }}
                      className="glass-input text-xs rounded-full px-2.5 py-1 text-slate-400"
                    >
                      <option value="">+ Adicionar membro</option>
                      {available.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
