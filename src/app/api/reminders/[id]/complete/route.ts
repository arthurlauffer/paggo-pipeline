import { NextRequest, NextResponse } from 'next/server'
import { queryOne, run } from '@/lib/db'
import { computeRisk } from '@/lib/risk'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const reminder = await queryOne(`SELECT * FROM reminders WHERE id = $1`, [params.id]) as any
  if (!reminder) return NextResponse.json({ error: 'Reminder não encontrado' }, { status: 404 })

  const { note = '' } = await req.json().catch(() => ({}))
  const now = new Date().toISOString()

  await run(`UPDATE reminders SET "isDismissed" = 1 WHERE id = $1`, [params.id])

  if (reminder.dealId) {
    const deal = await queryOne(`SELECT * FROM deals WHERE "dealId" = $1`, [reminder.dealId]) as any
    if (deal) {
      const activityNotes = [
        `✅ Lembrete concluído: ${reminder.message}`,
        note.trim() ? note.trim() : null,
      ].filter(Boolean).join('\n\n')

      await run(`
        INSERT INTO activities ("dealId", type, notes, "activityAt", "isNextStep", "isCompleted", "createdAt", "createdBy")
        VALUES ($1, 'NOTE', $2, $3, 0, 1, $3, 'manager')
      `, [reminder.dealId, activityNotes, now])

      const commentId      = `CMT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const commentContent = [
        `🔔 **Lembrete concluído:** ${reminder.message}`,
        note.trim() ? note.trim() : null,
      ].filter(Boolean).join('\n\n')

      await run(`
        INSERT INTO comments (id, "dealId", "authorId", "authorName", content, "mentionedUsers", "createdAt")
        VALUES ($1, $2, 'user-0', 'Você', $3, '[]', $4)
      `, [commentId, reminder.dealId, commentContent, now])

      const risk = computeRisk({ ...deal, lastActivityAt: now })
      await run(`
        UPDATE deals SET "lastActivityAt" = $1, "lastActivityType" = 'NOTE',
          "riskScore" = $2, "riskFlags" = $3, "riskLevel" = $4, "updatedAt" = $1
        WHERE "dealId" = $5
      `, [now, risk.score, JSON.stringify(risk.flags), risk.level, reminder.dealId])

      await run(`
        INSERT INTO audit_log ("dealId", action, "newValue", notes, "performedBy", "originatedBy", "createdAt")
        VALUES ($1, 'ACTIVITY_LOGGED', 'NOTE', $2, 'manager', 'manager', $3)
      `, [reminder.dealId, activityNotes, now])
    }
  }

  return NextResponse.json({ ok: true })
}
