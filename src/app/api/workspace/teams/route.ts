import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne, run } from '@/lib/db'

export const dynamic = 'force-dynamic'

const COLORS = [
  'bg-indigo-500', 'bg-purple-500', 'bg-blue-500', 'bg-emerald-500',
  'bg-amber-500', 'bg-pink-500', 'bg-cyan-500', 'bg-rose-500', 'bg-teal-500',
]

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

export async function GET() {
  const rows = await query<TeamRow>(`SELECT * FROM teams ORDER BY "createdAt" ASC`)
  const teams = await Promise.all(rows.map(hydrate))
  return NextResponse.json({ teams })
}

export async function POST(req: NextRequest) {
  const { name, color, memberIds } = await req.json().catch(() => ({}))

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Nome da equipe é obrigatório.' }, { status: 400 })
  }
  const dup = await queryOne(`SELECT id FROM teams WHERE lower(name) = lower($1)`, [name.trim()])
  if (dup) {
    return NextResponse.json({ error: 'Já existe uma equipe com esse nome.' }, { status: 409 })
  }

  const countRow = await queryOne<{ c: string }>('SELECT COUNT(*) as c FROM teams')
  const count    = Number(countRow?.c ?? 0)
  const id       = `team-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`
  const now      = new Date().toISOString()
  const ids      = Array.isArray(memberIds) ? memberIds.filter((x: unknown) => typeof x === 'string') : []

  await run(`INSERT INTO teams (id, name, color, "memberIds", "createdAt") VALUES ($1, $2, $3, $4, $5)`,
    [id, name.trim(), color || COLORS[count % COLORS.length], JSON.stringify(ids), now])

  const row = await queryOne<TeamRow>(`SELECT * FROM teams WHERE id = $1`, [id])
  return NextResponse.json({ team: await hydrate(row!) }, { status: 201 })
}
