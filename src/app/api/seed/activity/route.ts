import { NextRequest, NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { seedActivity } from '@/lib/seed-activity'

export const dynamic = 'force-dynamic'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const dealCountRow = await queryOne<{ c: string }>('SELECT COUNT(*) as c FROM deals')
  const dealCount    = Number(dealCountRow?.c ?? 0)

  if (dealCount === 0) {
    return NextResponse.json({ error: 'Seed deals first (POST /api/seed).' }, { status: 400 })
  }

  const sizeParam = Number(req.nextUrl.searchParams.get('size'))
  const size      = Number.isFinite(sizeParam) && sizeParam > 0 ? Math.min(sizeParam, 2000) : 500

  const result = await seedActivity(size)
  return NextResponse.json({ ok: true, ...result })
}

export async function GET() {
  const [acts, cmts] = await Promise.all([
    queryOne<{ c: string }>(`SELECT COUNT(*) as c FROM activities WHERE "createdBy" = 'seed'`),
    queryOne<{ c: string }>(`SELECT COUNT(*) as c FROM comments WHERE "authorId" LIKE 'seed-%'`),
  ])
  return NextResponse.json({ activities: Number(acts?.c ?? 0), comments: Number(cmts?.c ?? 0) })
}
