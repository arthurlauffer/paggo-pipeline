'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Send, Bot, User, Loader2, AlertTriangle, Check, CheckCircle2, XCircle } from 'lucide-react'

interface PendingAction {
  id: string
  name: string
  args: Record<string, unknown>
  title: string
  description: string
  details?: string
  warnings?: string[]
}

type ActionResult = { status: 'running' | 'done' | 'error'; summary?: string; error?: string }

interface Message {
  role: 'user' | 'assistant'
  content: string
  pendingActions?: PendingAction[]
  actionState?: 'pending' | 'cancelled'
  actionResults?: Record<string, ActionResult>
}

const SUGGESTIONS = [
  'Quais 10 deals estão mais em risco agora?',
  'Resuma a saúde do funil por segmento',
  'Quais deals ENT estão single-threaded?',
  'Deals acima de R$50k sem atividade em 14+ dias',
  'Quem está carregando o maior pipeline em risco?',
]

interface Props {
  isOpen: boolean
  onClose: () => void
  onDataChanged: () => void
  initialMessage?: string
  onInitialMessageConsumed?: () => void
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

type InlineNode = string | { bold: string } | { italic: string }

function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = []
  // handles **bold** and *italic*
  const regex = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (m[2] !== undefined) nodes.push({ bold: m[2] })
    else if (m[3] !== undefined) nodes.push({ italic: m[3] })
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function InlineContent({ text }: { text: string }) {
  const nodes = parseInline(text)
  return (
    <>
      {nodes.map((n, i) =>
        typeof n === 'string' ? (
          <span key={i}>{n}</span>
        ) : 'bold' in n ? (
          <strong key={i} className="font-semibold text-slate-100">{n.bold}</strong>
        ) : (
          <em key={i} className="italic">{n.italic}</em>
        )
      )}
    </>
  )
}

function MarkdownMessage({ content }: { content: string }) {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let listBuffer: { num: number | null; text: string }[] = []

  function flushList() {
    if (listBuffer.length === 0) return
    const isOrdered = listBuffer[0].num !== null
    elements.push(
      <div key={`list-${elements.length}`} className={`space-y-1 ${isOrdered ? 'pl-0' : 'pl-1'}`}>
        {listBuffer.map((item, i) => (
          <div key={i} className="flex gap-2 items-start">
            <span className="text-slate-400 flex-shrink-0 text-xs mt-0.5 min-w-[14px]">
              {item.num !== null ? `${item.num}.` : '•'}
            </span>
            <span className="leading-relaxed"><InlineContent text={item.text} /></span>
          </div>
        ))}
      </div>
    )
    listBuffer = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Numbered list item
    const numMatch = line.match(/^(\d+)\.\s+(.+)/)
    if (numMatch) {
      listBuffer.push({ num: parseInt(numMatch[1]), text: numMatch[2] })
      continue
    }

    // Bullet list item (* or -)
    const bulletMatch = line.match(/^[\*\-]\s+(.+)/)
    if (bulletMatch) {
      listBuffer.push({ num: null, text: bulletMatch[1] })
      continue
    }

    // Flush any pending list
    flushList()

    // Heading-style lines (### or ##)
    const headingMatch = line.match(/^#{1,3}\s+(.+)/)
    if (headingMatch) {
      elements.push(
        <div key={i} className="font-semibold text-slate-100 mt-1">
          <InlineContent text={headingMatch[1]} />
        </div>
      )
      continue
    }

    // Empty line → small gap
    if (line.trim() === '') {
      elements.push(<div key={i} className="h-1.5" />)
      continue
    }

    // Horizontal rule
    if (/^[-_*]{3,}$/.test(line.trim())) {
      elements.push(<hr key={i} className="border-slate-600 my-1" />)
      continue
    }

    // Regular paragraph line
    elements.push(
      <div key={i} className="leading-relaxed">
        <InlineContent text={line} />
      </div>
    )
  }

  flushList()

  return <div className="space-y-0.5 text-sm">{elements}</div>
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AgentChat({ isOpen, onClose, onDataChanged, initialMessage, onInitialMessageConsumed }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [approving, setApproving] = useState(false)
  const [pendingSend, setPendingSend] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<Message[]>([])

  useEffect(() => {
    messagesRef.current = messages
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-send initial message when chat opens with a pre-filled prompt
  useEffect(() => {
    if (isOpen && initialMessage) {
      setPendingSend(initialMessage)
      onInitialMessageConsumed?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialMessage])

  // Consume pendingSend when not loading
  useEffect(() => {
    if (pendingSend && !loading) {
      const msg = pendingSend
      setPendingSend(null)
      send(msg)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSend, loading])

  async function send(text?: string) {
    const content = text || input.trim()
    if (!content || loading) return

    const userMsg: Message = { role: 'user', content }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMsg] }),
      })
      const data = await res.json()

      if (data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: `❌ Erro: ${data.error}` }])
      } else {
        const hasPending = Array.isArray(data.pendingActions) && data.pendingActions.length > 0
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.content,
          pendingActions: hasPending ? data.pendingActions : undefined,
          actionState: hasPending ? 'pending' : undefined,
        }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ Erro ao conectar com o agente. Verifique a GOOGLE_AI_API_KEY no .env.local.' }])
    } finally {
      setLoading(false)
    }
  }

  function setActionResult(msgIndex: number, actionId: string, result: ActionResult) {
    setMessages(prev => prev.map((m, i) =>
      i === msgIndex ? { ...m, actionResults: { ...(m.actionResults ?? {}), [actionId]: result } } : m
    ))
  }

  // Commits ONE action server-side; updates that card's status. Returns success.
  async function runAction(msgIndex: number, action: PendingAction): Promise<boolean> {
    setActionResult(msgIndex, action.id, { status: 'running' })
    try {
      const res = await fetch('/api/agent/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actions: [{ id: action.id, name: action.name, args: action.args }] }),
      })
      const data = await res.json()
      const r = data?.results?.[0]
      if (r?.success) {
        setActionResult(msgIndex, action.id, { status: 'done', summary: r.summary })
        onDataChanged()
        return true
      }
      setActionResult(msgIndex, action.id, { status: 'error', error: r?.error || data?.error || 'Falhou' })
      return false
    } catch {
      setActionResult(msgIndex, action.id, { status: 'error', error: 'Erro de conexão' })
      return false
    }
  }

  // Approve a single email/action.
  async function approveOne(msgIndex: number, action: PendingAction) {
    if (approving) return
    setApproving(true)
    await runAction(msgIndex, action)
    setApproving(false)
  }

  // Approve all not-yet-done actions, sequentially, so progress shows card by card.
  async function approveAll(msgIndex: number, actions: PendingAction[]) {
    if (approving) return
    setApproving(true)
    for (const action of actions) {
      const current = messagesRef.current[msgIndex]?.actionResults?.[action.id]?.status
      if (current === 'done') continue
      await runAction(msgIndex, action)
    }
    setApproving(false)
  }

  function cancelActions(msgIndex: number) {
    setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, actionState: 'cancelled' } : m))
  }

  if (!isOpen) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[440px] max-h-[78vh] flex flex-col glass-strong rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center">
            <Bot size={14} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-100">Ask Paggo CRM</div>
            <div className="text-[10px] text-emerald-400">● Online</div>
          </div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-400 text-center">
              Pergunte sobre o pipeline ou peça para executar ações. O agente sempre pede confirmação antes de fazer mudanças.
            </p>
            <div className="space-y-2">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="w-full text-left text-xs px-3 py-2 text-slate-300 rounded-xl transition-colors glass-input hover:bg-white/[0.07]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <div className="w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot size={12} className="text-white" />
                </div>
              )}
              <div className={`max-w-[88%] rounded-2xl px-3 py-2.5 ${
                m.role === 'user'
                  ? 'bg-indigo-600 text-white text-sm leading-relaxed rounded-tr-sm'
                  : 'glass text-slate-200 rounded-tl-sm'
              }`}>
                {m.role === 'assistant'
                  ? <MarkdownMessage content={m.content} />
                  : m.content
                }

                {m.role === 'assistant' && m.pendingActions && m.pendingActions.length > 0 && (() => {
                  const results   = m.actionResults ?? {}
                  const doneCount  = m.pendingActions.filter(a => results[a.id]?.status === 'done').length
                  const total      = m.pendingActions.length
                  const allDone    = doneCount === total
                  const cancelled  = m.actionState === 'cancelled'

                  return (
                    <div className="mt-3 space-y-2">
                      <div className="text-[11px] font-semibold text-amber-300/90 uppercase tracking-wide flex items-center gap-1.5">
                        <AlertTriangle size={12} />
                        {allDone
                          ? `${total} ação(ões) concluída(s)`
                          : `${total} ação(ões) para aprovar${doneCount ? ` · ${doneCount}/${total} prontas` : ''}`}
                      </div>

                      <div className="space-y-1.5">
                        {m.pendingActions.map((a, ai) => {
                          const r = results[a.id]
                          return (
                            <div key={a.id} className="glass-input rounded-xl px-3 py-2 border border-white/[0.06]">
                              <div className="flex items-start gap-2">
                                <span className="text-[10px] text-slate-500 mt-0.5 min-w-[16px]">{ai + 1}.</span>
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                                    {a.title}
                                    {r?.status === 'done' && <CheckCircle2 size={12} className="text-emerald-400 flex-shrink-0" />}
                                    {r?.status === 'error' && <XCircle size={12} className="text-rose-400 flex-shrink-0" />}
                                    {r?.status === 'running' && <Loader2 size={12} className="text-indigo-400 animate-spin flex-shrink-0" />}
                                  </div>
                                  <div className="text-[11px] text-slate-400 leading-relaxed">{a.description}</div>

                                  {a.details && (
                                    <pre className="mt-1.5 whitespace-pre-wrap font-sans text-[11px] text-slate-300 leading-relaxed bg-black/20 rounded-lg px-2.5 py-2 border border-white/[0.05]">
                                      {a.details}
                                    </pre>
                                  )}

                                  {a.warnings && a.warnings.length > 0 && (
                                    <div className="mt-1 text-[10px] text-amber-400/90 flex items-start gap-1">
                                      <AlertTriangle size={10} className="mt-0.5 flex-shrink-0" />
                                      <span>{a.warnings.join(' · ')}</span>
                                    </div>
                                  )}

                                  {r?.status === 'done' && (
                                    <div className="mt-1 text-[10px] text-emerald-400">✓ {r.summary || 'Concluído'}</div>
                                  )}
                                  {r?.status === 'error' && (
                                    <div className="mt-1 text-[10px] text-rose-400">✕ {r.error}</div>
                                  )}

                                  {/* Per-card approve (email by email) */}
                                  {!cancelled && r?.status !== 'done' && (
                                    <button
                                      onClick={() => approveOne(i, a)}
                                      disabled={approving}
                                      className="mt-2 flex items-center gap-1.5 text-[11px] font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg px-2.5 py-1 transition-colors"
                                    >
                                      <Check size={11} /> {r?.status === 'error' ? 'Tentar de novo' : 'Aprovar'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {!cancelled && !allDone && (
                        <div className="flex gap-2 pt-0.5">
                          <button
                            onClick={() => approveAll(i, m.pendingActions!)}
                            disabled={approving}
                            className="flex items-center gap-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg px-3 py-1.5 transition-colors"
                          >
                            {approving
                              ? <><Loader2 size={13} className="animate-spin" /> Executando {doneCount}/{total}…</>
                              : <><Check size={13} /> Aprovar todos</>}
                          </button>
                          <button
                            onClick={() => cancelActions(i)}
                            disabled={approving}
                            className="flex items-center gap-1.5 text-xs font-medium glass-input hover:bg-white/[0.07] disabled:opacity-50 text-slate-300 rounded-lg px-3 py-1.5 transition-colors"
                          >
                            <X size={13} /> Cancelar
                          </button>
                        </div>
                      )}

                      {allDone && (
                        <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 pt-0.5">
                          <CheckCircle2 size={12} /> Todas as ações concluídas
                        </div>
                      )}
                      {cancelled && !allDone && (
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 pt-0.5">
                          <XCircle size={12} /> Ações canceladas
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
              {m.role === 'user' && (
                <div className="w-6 h-6 bg-slate-700 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <User size={12} className="text-slate-300" />
                </div>
              )}
            </div>
          ))
        )}

        {loading && (
          <div className="flex gap-2 items-start">
            <div className="w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center flex-shrink-0">
              <Bot size={12} className="text-white" />
            </div>
            <div className="glass rounded-2xl rounded-tl-sm px-3 py-2.5">
              <div className="flex items-center gap-1.5">
                <Loader2 size={13} className="text-indigo-400 animate-spin" />
                <span className="text-xs text-slate-500">Analisando pipeline…</span>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="Pergunte ou peça uma ação…"
            disabled={loading}
            className="flex-1 glass-input text-sm rounded-xl px-3 py-2 disabled:opacity-50"
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            className="w-9 h-9 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl flex items-center justify-center transition-colors"
          >
            <Send size={14} className="text-white" />
          </button>
        </div>
        <p className="text-[10px] text-slate-500 mt-1.5 text-center">
          Ações destrutivas exigem confirmação explícita
        </p>
      </div>
    </div>
  )
}
