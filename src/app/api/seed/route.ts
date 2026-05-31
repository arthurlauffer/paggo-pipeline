import { NextResponse } from 'next/server'
import { queryOne, run } from '@/lib/db'
import { computeRisk } from '@/lib/risk'
import Papa from 'papaparse'
import path from 'path'
import fs from 'fs'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface CsvRow {
  dealId: string; accountName: string; accountSegment: string; industry: string
  ownerName: string; stage: string; amount: string; createdAt: string
  expectedCloseDate: string; lastActivityAt: string; lastActivityType: string
  daysInCurrentStage: string; contactsLogged: string; source: string
  productInterest: string; previousDealsWithAccount: string
}

const BATCH_SIZE = 500

export async function POST() {
  try {
    let csvContent: string | null = null

    // Try filesystem (local dev + Vercel with outputFileTracingIncludes)
    const candidates = [
      process.env.CSV_PATH,
      path.join(process.cwd(), 'public', 'data', 'deals.csv'),
      path.join(process.cwd(), 'data', 'deals.csv'),
    ].filter(Boolean) as string[]

    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) { csvContent = fs.readFileSync(p, 'utf8'); break }
      } catch { /* skip */ }
    }

    if (!csvContent) {
      return NextResponse.json(
        { error: 'CSV não encontrado.', tried: candidates },
        { status: 400 }
      )
    }

    const parsed = Papa.parse<CsvRow>(csvContent, { header: true, skipEmptyLines: true })
    const rows   = parsed.data
    const now    = new Date().toISOString()

    // Pre-compute all row data (pure JS — no DB calls)
    const rowData = rows.map(row => {
      const risk = computeRisk({
        stage: row.stage as any,
        amount: parseFloat(row.amount) || 0,
        expectedCloseDate: row.expectedCloseDate,
        lastActivityAt: row.lastActivityAt || null,
        daysInCurrentStage: parseInt(row.daysInCurrentStage) || 0,
        contactsLogged: parseInt(row.contactsLogged) || 0,
        accountSegment: row.accountSegment,
      })
      return [
        row.dealId, row.accountName, row.accountSegment, row.industry,
        row.ownerName, row.stage, parseFloat(row.amount) || 0,
        row.createdAt, row.expectedCloseDate,
        row.lastActivityAt || null, row.lastActivityType || null,
        parseInt(row.daysInCurrentStage) || 0, parseInt(row.contactsLogged) || 0,
        row.source, row.productInterest, parseInt(row.previousDealsWithAccount) || 0,
        risk.score, JSON.stringify(risk.flags), risk.level, now,
      ]
    })

    const COLS = 20

    // Bulk INSERT in batches of 500 — ~16 queries instead of 8001
    for (let b = 0; b < rowData.length; b += BATCH_SIZE) {
      const batch  = rowData.slice(b, b + BATCH_SIZE)
      const values: unknown[] = []

      const placeholders = batch.map((rd, i) => {
        values.push(...rd)
        const base = i * COLS
        return `(${Array.from({ length: COLS }, (_, j) => `$${base + j + 1}`).join(',')})`
      }).join(',')

      await run(`
        INSERT INTO deals (
          "dealId","accountName","accountSegment",industry,"ownerName",stage,amount,
          "createdAt","expectedCloseDate","lastActivityAt","lastActivityType",
          "daysInCurrentStage","contactsLogged",source,"productInterest",
          "previousDealsWithAccount","riskScore","riskFlags","riskLevel","updatedAt"
        ) VALUES ${placeholders}
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
      `, values)
    }

    return NextResponse.json({
      seeded: rows.length,
      note: 'Chame POST /api/seed/activity para gerar atividades de exemplo.',
    })
  } catch (err: any) {
    console.error('[seed] error:', err)
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 })
  }
}

export async function GET() {
  const row = await queryOne<{ c: string }>('SELECT COUNT(*) as c FROM deals')
  return NextResponse.json({ count: Number(row?.c ?? 0) })
}
