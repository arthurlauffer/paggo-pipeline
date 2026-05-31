import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne, run } from '@/lib/db'

export const dynamic = 'force-dynamic'

interface TeamRow { id: string; name: string; color: string; memberIds: string; createdAt: string }
interface MemberRow { id: string; name: string; email: string | null; role: string; initials: string; color: string; status: string }

async function hydrate(t: TeamRow) {
  let ids: string[] = []
  try { ids = JSON.parse(t.memberIds || '[]') } catch { ids = [] }
  const members: MemberRow[] = ids.length
    ? await query<MemberRow>(`SELECT id, name, email, role, initials, color, status FROM team_members WHERE id = ANY($1)`, [ids])
    : []
  members.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
  return { id: t.id, name: t.name, color: t.color, memberIds: ids, members, createdAt: t.createdAt }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const row = await queryOne<TeamRow>(`SELECT * FROM teams WHERE id = $1`, [params.id])
  if (!row) return NextResponse.json({ error: 'Equipe não encontrada.' }, { status: 404 })

  const body      = await req.json().catch(() => ({}))
  const name      = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : row.name
  const color     = typeof body.color === 'string' && body.color ? body.color : row.color
  const memberIds = Array.isArray(body.memberIds)
    ? JSON.stringify(body.memberIds.filter((x: unknown) => typeof x === 'string'))
    : row.memberIds

  await run(`UPDATE teams SET name = $1, color = $2, "memberIds" = $3 WHERE id = $4`, [name, color, memberIds, params.id])

  const updated = await queryOne<TeamRow>(`SELECT * FROM teams WHERE id = $1`, [params.id])
  return NextResponse.json({ team: await hydrate(updated!) })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await run(`DELETE FROM teams WHERE id = $1`, [params.id])
  return NextResponse.json({ ok: true })
}
