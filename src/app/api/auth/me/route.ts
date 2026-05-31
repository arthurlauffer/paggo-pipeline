import { NextResponse } from 'next/server'
import { getStoredCredentials } from '@/lib/google-calendar'
import { queryOne, run } from '@/lib/db'

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

type Member = { id: string; name: string; email: string | null; initials: string; color: string }

const PLACEHOLDER_OWNER_EMAIL = 'voce@paggo.com.br'

/**
 * Makes sure the logged-in Google user has a row in team_members so they:
 *  - show up in the workspace settings (Membros), and
 *  - can be @mentioned in deal comments.
 *
 * The FIRST real user to connect "claims" the seeded owner persona ("Você",
 * id=user-0): we rename that row to the real account instead of creating a
 * duplicate, so the user becomes the Owner and the phantom "Você" disappears.
 * Everyone who connects afterwards gets a normal Member row keyed by email.
 */
async function ensureMember(email: string, displayName: string | null): Promise<Member | null> {
  const name = (displayName?.trim()) || email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  // 1. Is the seeded owner persona still unclaimed? → claim it for this user.
  const owner = await queryOne<{ id: string; email: string | null; color: string }>(
    `SELECT id, email, color FROM team_members WHERE id = 'user-0'`
  )
  if (owner && (owner.email ?? '').toLowerCase() === PLACEHOLDER_OWNER_EMAIL) {
    // Reassign any duplicate row + its comments to user-0, then remove it.
    const dup = await queryOne<{ id: string }>(
      `SELECT id FROM team_members WHERE lower(email) = lower($1) AND id <> 'user-0'`, [email]
    )
    if (dup) {
      await run(`UPDATE comments SET "authorId" = 'user-0' WHERE "authorId" = $1`, [dup.id])
      await run(`DELETE FROM team_members WHERE id = $1`, [dup.id])
    }
    await run(
      `UPDATE team_members SET name = $1, email = $2, initials = $3, status = 'active' WHERE id = 'user-0'`,
      [name, email, initialsOf(name)]
    )
    // Make the historical seeded "Você" comments read as the real owner too.
    await run(`UPDATE comments SET "authorName" = $1 WHERE "authorId" = 'user-0'`, [name])
    return { id: 'user-0', name, email, initials: initialsOf(name), color: owner.color }
  }

  // 2. Already a member (by email)? → return it.
  const existing = await queryOne<Member>(
    `SELECT id, name, email, initials, color FROM team_members WHERE lower(email) = lower($1)`,
    [email]
  )
  if (existing) return existing

  // 3. New member.
  const countRow = await queryOne<{ c: string }>('SELECT COUNT(*) as c FROM team_members')
  const count    = Number(countRow?.c ?? 0)
  const id       = `gid-${Buffer.from(email.toLowerCase()).toString('hex').slice(0, 24)}`
  const now      = new Date().toISOString()

  await run(`
    INSERT INTO team_members (id, name, email, role, initials, color, status, "createdAt")
    VALUES ($1, $2, $3, 'Member', $4, $5, 'active', $6)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email
  `, [id, name, email, initialsOf(name), COLORS[count % COLORS.length], now])

  return { id, name, email, initials: initialsOf(name), color: COLORS[count % COLORS.length] }
}

// Returns the currently logged-in user (based on the session cookie), or authed:false.
export async function GET() {
  const creds = await getStoredCredentials()
  if (!creds?.refresh_token) {
    return NextResponse.json({ authed: false })
  }

  let member: Member | null = null
  if (creds.email) {
    try { member = await ensureMember(creds.email, creds.display_name) } catch { /* non-fatal */ }
  }

  return NextResponse.json({
    authed:      true,
    email:       creds.email        ?? null,
    displayName: creds.display_name ?? null,
    memberId:    member?.id   ?? null,
    memberName:  member?.name ?? null,
  })
}
