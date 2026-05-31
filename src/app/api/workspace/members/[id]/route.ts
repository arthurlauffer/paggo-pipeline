import { NextRequest, NextResponse } from 'next/server'
import { queryOne, run } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const member = await queryOne(`SELECT * FROM team_members WHERE id = $1`, [params.id]) as any
  if (!member) return NextResponse.json({ error: 'Membro não encontrado.' }, { status: 404 })
  if (member.role === 'Owner') {
    return NextResponse.json({ error: 'O owner do workspace não pode ser removido.' }, { status: 403 })
  }
  await run(`DELETE FROM team_members WHERE id = $1`, [params.id])
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { role, name } = await req.json().catch(() => ({}))
  const member = await queryOne(`SELECT * FROM team_members WHERE id = $1`, [params.id]) as any
  if (!member) return NextResponse.json({ error: 'Membro não encontrado.' }, { status: 404 })

  await run(`UPDATE team_members SET role = $1, name = $2 WHERE id = $3`, [
    role?.trim() || member.role,
    name?.trim() || member.name,
    params.id,
  ])
  return NextResponse.json({ member: await queryOne(`SELECT * FROM team_members WHERE id = $1`, [params.id]) })
}
