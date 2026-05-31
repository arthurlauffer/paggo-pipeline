import { NextRequest, NextResponse } from 'next/server'
import { commitWrite, WRITE_TOOLS } from '@/lib/agent-tools'

export const dynamic = 'force-dynamic'

type IncomingAction = {
  id?: string
  name: string
  args: Record<string, unknown>
}

// Commits the write actions the user explicitly confirmed in the chat.
// This is the ONLY path that mutates the DB on the agent's behalf — every
// write is recorded in audit_log as originatedBy 'agent'.
export async function POST(req: NextRequest) {
  let body: { actions?: IncomingAction[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
  }

  const actions = Array.isArray(body.actions) ? body.actions : []
  if (actions.length === 0) {
    return NextResponse.json({ error: 'Nenhuma ação para executar.' }, { status: 400 })
  }

  const results: { id?: string; name: string; success: boolean; summary?: string; error?: string }[] = []

  for (const action of actions) {
    if (!action?.name || !WRITE_TOOLS.has(action.name)) {
      results.push({ id: action?.id, name: action?.name ?? '?', success: false, error: 'Ação desconhecida ou não permitida.' })
      continue
    }
    try {
      const r = await commitWrite(action.name, action.args ?? {})
      results.push({ id: action.id, name: action.name, success: r.success, summary: r.summary, error: r.error })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      results.push({ id: action.id, name: action.name, success: false, error: message.slice(0, 200) })
    }
  }

  const succeeded = results.filter(r => r.success).length
  const failed    = results.length - succeeded

  return NextResponse.json({ results, succeeded, failed, total: results.length })
}
