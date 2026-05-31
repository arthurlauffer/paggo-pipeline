'use client'

import { useState, useEffect, useCallback } from 'react'
import { Bell, AtSign, MessageSquare, Check, RefreshCw, Users } from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export const NOTIF_SEEN_KEY = 'paggo_notifications_seen'

interface Notification {
  id: string
  dealId: string
  accountName: string
  ownerName: string
  authorId: string
  authorName: string
  content: string
  createdAt: string
  viaTeam: string | null
}

function relDate(iso: string) {
  try { return formatDistanceToNow(parseISO(iso), { locale: ptBR, addSuffix: true }) } catch { return iso }
}

function initialsOf(name: string) {
  const p = name.trim().split(/\s+/)
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?'
}

// Strip @Você / @Team token so the snippet reads cleanly, then highlight it.
function Snippet({ content }: { content: string }) {
  const parts = content.split(/(@[\wÀ-ſ]+(?:\s[\wÀ-ſ]+)?)/g)
  return (
    <span className="text-xs text-slate-400 leading-relaxed">
      {parts.map((p, i) =>
        p.startsWith('@')
          ? <span key={i} className="text-indigo-400 font-medium">{p}</span>
          : <span key={i}>{p}</span>
      )}
    </span>
  )
}

export function NotificationsView({ onSelectDeal }: { onSelectDeal: (dealId: string) => void }) {
  const [items, setItems]     = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [prevSeen, setPrevSeen] = useState<string>('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/notifications')
    const data = await res.json()
    setItems(data.notifications || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    // Capture the previous "seen" mark to show what's new, then mark all read.
    const prev = typeof window !== 'undefined' ? localStorage.getItem(NOTIF_SEEN_KEY) || '' : ''
    setPrevSeen(prev)
    load().then(() => {
      const now = new Date().toISOString()
      localStorage.setItem(NOTIF_SEEN_KEY, now)
      window.dispatchEvent(new CustomEvent('paggo-notifications-seen'))
    })
  }, [load])

  const unreadCount = items.filter(n => !prevSeen || n.createdAt > prevSeen).length

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-6 py-5 max-w-[860px] mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2.5">
              <Bell size={22} className="text-indigo-400" />
              Notificações
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Menções a você e às suas equipes nos comentários dos deals.
            </p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-1.5 glass-input rounded-xl text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <RefreshCw size={13} /> Atualizar
          </button>
        </div>

        {/* Summary chip */}
        {!loading && items.length > 0 && (
          <div className="mb-3 text-xs text-slate-500">
            {unreadCount > 0
              ? <span className="text-indigo-300 font-medium">{unreadCount} {unreadCount === 1 ? 'nova menção' : 'novas menções'}</span>
              : <span className="flex items-center gap-1 text-emerald-400"><Check size={13} /> Tudo em dia</span>}
            <span> · {items.length} no total</span>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-20 glass rounded-xl" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl glass-md flex items-center justify-center mb-3">
              <Bell size={24} className="text-slate-600" />
            </div>
            <p className="text-sm text-slate-400 font-medium">Nenhuma menção ainda</p>
            <p className="text-xs text-slate-600 mt-1">Quando alguém mencionar você ou sua equipe, aparece aqui.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(n => {
              const isNew = !prevSeen || n.createdAt > prevSeen
              return (
                <button
                  key={n.id}
                  onClick={() => onSelectDeal(n.dealId)}
                  className={`group w-full text-left flex items-start gap-3 p-3.5 rounded-xl transition-all ${
                    isNew ? 'glass-accent hover:bg-white/[0.07]' : 'glass hover:bg-white/[0.05]'
                  }`}
                >
                  {/* Author avatar */}
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-white">
                    {initialsOf(n.authorName)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium text-slate-200">{n.authorName}</span>
                      {n.viaTeam ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                          mencionou <Users size={11} className="text-indigo-400" />
                          <span className="text-indigo-300 font-medium">@{n.viaTeam}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                          mencionou <AtSign size={11} className="text-indigo-400" /><span className="text-indigo-300 font-medium">você</span>
                        </span>
                      )}
                      {isNew && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />}
                    </div>

                    <div className="mt-1 line-clamp-2"><Snippet content={n.content} /></div>

                    <div className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-500">
                      <span className="inline-flex items-center gap-1 text-slate-400">
                        <MessageSquare size={11} /> {n.accountName}
                      </span>
                      <span>·</span>
                      <span>{n.ownerName}</span>
                      <span>·</span>
                      <span>{relDate(n.createdAt)}</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
