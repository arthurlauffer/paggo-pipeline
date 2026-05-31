import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne, run } from '@/lib/db'
import { computeRisk } from '@/lib/risk'
import type { Stage } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  // Filters accept comma-separated values for multi-select (e.g. stage=LEAD,DEMO).
  const splitParam = (v: string | null): string[] =>
    (v ?? '').split(',').map(s => s.trim()).filter(Boolean)

  const stages         = splitParam(searchParams.get('stage'))
  const ownerNames     = splitParam(searchParams.get('ownerName'))
  const segments       = splitParam(searchParams.get('accountSegment'))
  const industry       = searchParams.get('industry')
  const riskLevels     = splitParam(searchParams.get('riskLevel'))
  const search         = searchParams.get('search')
  const sortBy         = searchParams.get('sortBy') || 'riskScore'
  const sortOrder      = searchParams.get('sortOrder') || 'desc'
  const page           = parseInt(searchParams.get('page') || '1')
  const limit          = parseInt(searchParams.get('limit') || '50')
  const includesClosed = searchParams.get('includesClosed') === 'true'

  const SORT_COL: Record<string, string> = {
    riskScore: '"riskScore"', amount: 'amount', daysInCurrentStage: '"daysInCurrentStage"',
    lastActivityAt: '"lastActivityAt"', expectedCloseDate: '"expectedCloseDate"',
    accountName: '"accountName"', ownerName: '"ownerName"', stage: 'stage', createdAt: '"createdAt"',
  }
  const safeSortCol   = SORT_COL[sortBy] ?? '"riskScore"'
  const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC'

  const conditions: string[] = []
  const values: unknown[] = []

  // Builds `col IN ($a,$b,...)` for a list of values.
  const inClause = (col: string, list: string[]) => {
    if (!list.length) return
    const placeholders = list.map(v => { values.push(v); return `$${values.length}` })
    conditions.push(`${col} IN (${placeholders.join(', ')})`)
  }

  if (!includesClosed) conditions.push("stage NOT IN ('CLOSED_WON', 'CLOSED_LOST')")
  inClause('stage',            stages)
  inClause('"ownerName"',      ownerNames)
  inClause('"accountSegment"', segments)
  inClause('"riskLevel"',      riskLevels)
  if (industry)       { values.push(industry);       conditions.push(`industry = $${values.length}`) }
  if (search) {
    values.push(`%${search}%`)
    const i = values.length
    conditions.push(`("accountName" ILIKE $${i} OR "dealId" ILIKE $${i} OR "ownerName" ILIKE $${i})`)
  }

  const where  = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const offset = (page - 1) * limit

  const countRow = await queryOne<{ c: string }>(`SELECT COUNT(*) as c FROM deals ${where}`, values)
  const total    = Number(countRow?.c ?? 0)

  // Add limit/offset params after the shared where params
  const paginatedValues = [...values, limit, offset]
  const deals = await query(`
    SELECT deals.*,
      (SELECT COUNT(*) FROM comments WHERE comments."dealId" = deals."dealId") AS "commentCount"
    FROM deals
    ${where}
    ORDER BY ${safeSortCol} ${safeSortOrder}
    LIMIT $${paginatedValues.length - 1} OFFSET $${paginatedValues.length}
  `, paginatedValues)

  return NextResponse.json({ deals, total, page, limit })
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  const {
    accountName,
    accountSegment = 'SMB',
    industry = 'Outros',
    ownerName,
    stage = 'LEAD',
    amount,
    expectedCloseDate,
    source = 'MANUAL',
    productInterest = '',
  } = body

  if (!accountName?.trim() || !ownerName?.trim() || !amount || !expectedCloseDate) {
    return NextResponse.json(
      { error: 'accountName, ownerName, amount e expectedCloseDate são obrigatórios' },
      { status: 400 }
    )
  }

  const now    = new Date().toISOString()
  const dealId = `DEAL-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  const risk   = computeRisk({ stage: stage as Stage, lastActivityAt: null, daysInCurrentStage: 0, contactsLogged: 0, previousDealsWithAccount: 0, expectedCloseDate } as any)

  await run(`
    INSERT INTO deals (
      "dealId", "accountName", "accountSegment", industry, "ownerName", stage, amount,
      "createdAt", "expectedCloseDate", "lastActivityAt", "lastActivityType",
      "daysInCurrentStage", "contactsLogged", source, "productInterest",
      "previousDealsWithAccount", "riskScore", "riskFlags", "riskLevel", "updatedAt"
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, NULL, NULL,
      0, 0, $10, $11,
      0, $12, $13, $14, $8
    )
  `, [
    dealId, accountName.trim(), accountSegment, industry, ownerName.trim(), stage, Number(amount),
    now, expectedCloseDate,
    source, productInterest?.trim() || '',
    risk.score, JSON.stringify(risk.flags), risk.level,
  ])

  const deal = await queryOne(`SELECT * FROM deals WHERE "dealId" = $1`, [dealId])
  return NextResponse.json({ deal }, { status: 201 })
}
