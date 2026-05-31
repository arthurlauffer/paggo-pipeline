import { NextResponse } from 'next/server'
import { queryOne, run } from '@/lib/db'
import { computeRisk } from '@/lib/risk'
import { seedActivity } from '@/lib/seed-activity'
import Papa from 'papaparse'

export const dynamic = 'force-dynamic'

export const maxDuration = 60

interface CsvRow {
  dealId: string; accountName: string; accountSegment: string; industry: string
  ownerName: string; stage: string; amount: string; createdAt: string
  expectedCloseDate: string; lastActivityAt: string; lastActivityType: string
  daysInCurrentStage: string; contactsLogged: string; source: string
  productInterest: string; previousDealsWithAccount: string
}

export async function POST() {
  // Try to load CSV: first from /data/deals.csv (local), then from /deals.csv (public/)
  let csvContent: string | null = null

  // In Node.js environments (local dev / non-edge), try filesystem first
  try {
    const fs   = await import('fs')
    const path = await import('path')
    const candidates = [
      process.env.CSV_PATH,
      path.join(process.cwd(), 'data', 'deals.csv'),
      path.join(process.cwd(), '..', 'deals.csv'),
    ].filter(Boolean) as string[]

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        csvContent = fs.readFileSync(p, 'utf8')
        break
      }
    }
  } catch { /* running in edge/serverless without fs */ }

  // Fallback: fetch from public/ (works on Vercel)
  if (!csvContent) {
    try {
      const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
      const res  = await fetch(`${base}/data/deals.csv`)
      if (res.ok) csvContent = await res.text()
    } catch { /* ignore */ }
  }

  if (!csvContent) {
    return NextResponse.json(
      { error: 'CSV não encontrado. Coloque deals.csv em data/ ou em public/data/ e faça o deploy novamente.' },
      { status: 400 }
    )
  }

  const parsed = Papa.parse<CsvRow>(csvContent, { header: true, skipEmptyLines: true })
  const rows   = parsed.data
  const now    = new Date().toISOString()

  for (const row of rows) {
    const risk = computeRisk({
      stage: row.stage as any, amount: parseFloat(row.amount) || 0,
      expectedCloseDate: row.expectedCloseDate, lastActivityAt: row.lastActivityAt || null,
      daysInCurrentStage: parseInt(row.daysInCurrentStage) || 0,
      contactsLogged: parseInt(row.contactsLogged) || 0,
      accountSegment: row.accountSegment,
    })

    await run(`
      INSERT INTO deals (
        "dealId","accountName","accountSegment",industry,"ownerName",stage,amount,
        "createdAt","expectedCloseDate","lastActivityAt","lastActivityType",
        "daysInCurrentStage","contactsLogged",source,"productInterest",
        "previousDealsWithAccount","riskScore","riskFlags","riskLevel","updatedAt"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$8)
      ON CONFLICT ("dealId") DO UPDATE SET
        "accountName"=EXCLUDED."accountName","accountSegment"=EXCLUDED."accountSegment",
        industry=EXCLUDED.industry,"ownerName"=EXCLUDED."ownerName",stage=EXCLUDED.stage,
        amount=EXCLUDED.amount,"expectedCloseDate"=EXCLUDED."expectedCloseDate",
        "lastActivityAt"=EXCLUDED."lastActivityAt","lastActivityType"=EXCLUDED."lastActivityType",
        "daysInCurrentStage"=EXCLUDED."daysInCurrentStage","contactsLogged"=EXCLUDED."contactsLogged",
        source=EXCLUDED.source,"productInterest"=EXCLUDED."productInterest",
        "previousDealsWithAccount"=EXCLUDED."previousDealsWithAccount",
        "riskScore"=EXCLUDED."riskScore","riskFlags"=EXCLUDED."riskFlags",
        "riskLevel"=EXCLUDED."riskLevel","updatedAt"=EXCLUDED."updatedAt"
    `, [
      row.dealId, row.accountName, row.accountSegment, row.industry, row.ownerName, row.stage,
      parseFloat(row.amount) || 0, row.createdAt, row.expectedCloseDate,
      row.lastActivityAt || null, row.lastActivityType || null,
      parseInt(row.daysInCurrentStage) || 0, parseInt(row.contactsLogged) || 0,
      row.source, row.productInterest, parseInt(row.previousDealsWithAccount) || 0,
      risk.score, JSON.stringify(risk.flags), risk.level,
    ])
  }

  let activity = { dealsTouched: 0, activities: 0, comments: 0 }
  try { activity = await seedActivity(500) } catch (e) { console.error('[seed] activity seeding failed:', e) }

  return NextResponse.json({ seeded: rows.length, activity })
}

export async function GET() {
  const row = await queryOne<{ c: string }>('SELECT COUNT(*) as c FROM deals')
  return NextResponse.json({ count: Number(row?.c ?? 0) })
}
