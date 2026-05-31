import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

const ME = 'user-0'

interface CommentRow {
  id: string; dealId: string; authorId: string; authorName: string
  content: string; mentionedUsers: string; createdAt: string
  accountName: string; ownerName: string
}

export async function GET() {
  // Teams the current user belongs to
  const teamRows = await query<{ name: string; memberIds: string }>('SELECT name, "memberIds" FROM teams')
  const myTeamNames = teamRows
    .filter(t => { try { return (JSON.parse(t.memberIds || '[]') as string[]).includes(ME) } catch { return false } })
    .map(t => t.name)

  // Comments that mention me directly (parameterized — no SQL injection)
  const rows = await query<CommentRow>(`
    SELECT c.id, c."dealId", c."authorId", c."authorName", c.content, c."mentionedUsers", c."createdAt",
           d."accountName" as "accountName", d."ownerName" as "ownerName"
    FROM comments c
    JOIN deals d ON c."dealId" = d."dealId"
    WHERE c."mentionedUsers" LIKE $1
      AND c."authorId" != $2
    ORDER BY c."createdAt" DESC
    LIMIT 200
  `, [`%"${ME}"%`, ME])

  const notifications = rows.map(r => {
    const viaTeam = myTeamNames.find(name => r.content.includes(`@${name}`)) || null
    return { id: r.id, dealId: r.dealId, accountName: r.accountName, ownerName: r.ownerName, authorId: r.authorId, authorName: r.authorName, content: r.content, createdAt: r.createdAt, viaTeam }
  })

  return NextResponse.json({ notifications, count: notifications.length })
}
