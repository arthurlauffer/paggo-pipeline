import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne, run } from '@/lib/db'

export const dynamic = 'force-dynamic'

const COLORS = [
  'bg-indigo-500', 'bg-purple-500', 'bg-blue-500', 'bg-emerald-500',
  'bg-amber-500', 'bg-pink-500', 'bg-cyan-500', 'bg-rose-500', 'bg-teal-500',
]

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/)
  const a = parts[0]?.[0] ?? ''
  const b = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (a + b).toUpperCase() || '?'
}

export async function GET() {
  const members = await query(`SELECT * FROM team_members ORDER BY "createdAt" ASC`)
  return NextResponse.json({ members })
}

export async function POST(req: NextRequest) {
  const { name, email, role } = await req.json().catch(() => ({}))

  if (!email?.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
    return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 })
  }

  const existing = await queryOne(`SELECT id FROM team_members WHERE lower(email) = lower($1)`, [email.trim()])
  if (existing) {
    return NextResponse.json({ error: 'Esse e-mail já faz parte do workspace.' }, { status: 409 })
  }

  const displayName = name?.trim() || email.trim().split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
  const countRow    = await queryOne<{ c: string }>('SELECT COUNT(*) as c FROM team_members')
  const count       = Number(countRow?.c ?? 0)
  const id          = `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`
  const now         = new Date().toISOString()

  await run(`
    INSERT INTO team_members (id, name, email, role, initials, color, status, "createdAt")
    VALUES ($1, $2, $3, $4, $5, $6, 'invited', $7)
  `, [id, displayName, email.trim(), role?.trim() || 'Member', initialsOf(displayName), COLORS[count % COLORS.length], now])

  const member = await queryOne(`SELECT * FROM team_members WHERE id = $1`, [id])
  return NextResponse.json({ member }, { status: 201 })
}
