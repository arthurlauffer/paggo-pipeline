import { NextRequest, NextResponse } from 'next/server'
import { queryOne, run } from '@/lib/db'

export const dynamic = 'force-dynamic'

function slugify(s: string) {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48) || 'workspace'
}

export async function GET() {
  const ws = await queryOne(`SELECT * FROM workspace_settings WHERE id = 'default'`)
  return NextResponse.json(ws)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const now  = new Date().toISOString()

  const cur = await queryOne(`SELECT * FROM workspace_settings WHERE id = 'default'`) as any

  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 60) : cur?.name
  const slug = typeof body.slug === 'string' && body.slug.trim() ? slugify(body.slug) : cur?.slug
  const logo = body.logo === null ? null : (typeof body.logo === 'string' ? body.logo : cur?.logo)

  await run(`
    UPDATE workspace_settings SET name = $1, slug = $2, logo = $3, updated_at = $4 WHERE id = 'default'
  `, [name, slug, logo, now])

  return NextResponse.json(await queryOne(`SELECT * FROM workspace_settings WHERE id = 'default'`))
}
