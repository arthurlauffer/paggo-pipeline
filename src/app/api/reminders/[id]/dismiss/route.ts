import { NextRequest, NextResponse } from 'next/server'
import { runReturning } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  const rows = await runReturning(`UPDATE reminders SET "isDismissed" = 1 WHERE id = $1 RETURNING id`, [params.id])

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Reminder não encontrado' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
