import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne, run } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const comments = await query(`SELECT * FROM comments WHERE "dealId" = $1 ORDER BY "createdAt" DESC`, [params.id])
  return NextResponse.json({ comments })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const { content, authorId = 'user-0', authorName = 'Você', mentionedUsers = [] } = body

  if (!content?.trim()) {
    return NextResponse.json({ error: 'Conteúdo obrigatório' }, { status: 400 })
  }

  const id  = `CMT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const now = new Date().toISOString()

  await run(`
    INSERT INTO comments (id, "dealId", "authorId", "authorName", content, "mentionedUsers", "createdAt")
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [id, params.id, authorId, authorName, content.trim(), JSON.stringify(mentionedUsers), now])

  const comment = await queryOne(`SELECT * FROM comments WHERE id = $1`, [id])
  return NextResponse.json({ comment }, { status: 201 })
}
