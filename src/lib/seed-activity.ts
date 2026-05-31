import { query, queryOne, run } from './db'
import { computeRisk } from './risk'
import { TEAM_MEMBERS } from './types'

// ─── Content templates (pt-BR) ──────────────────────────────────────────────

const ACTIVITY_TEMPLATES: Record<string, string[]> = {
  CALL: [
    'Liguei para o decisor — confirmou interesse e pediu proposta formal.',
    'Ligação de follow-up. Cliente avaliando orçamento interno, retorno em 1 semana.',
    'Call de alinhamento com o time técnico do cliente. Boa receptividade.',
    'Tentativa de contato sem sucesso, deixei recado. Vou tentar de novo amanhã.',
    'Ligação rápida para checar o status da aprovação interna. Segue em análise.',
    'Conversa com o champion — ele vai levar a proposta pro comitê na sexta.',
    'Liguei para entender objeções de pricing. Vamos revisar a proposta.',
  ],
  EMAIL: [
    'Enviei a proposta comercial revisada com o desconto aprovado.',
    'Email de follow-up reforçando os diferenciais vs. concorrência.',
    'Mandei o material técnico solicitado e o case de sucesso do setor.',
    'Enviei resumo da reunião com próximos passos acordados.',
    'Email com a agenda da demo e link da call.',
    'Reenviei a proposta — cliente não tinha visto o primeiro email.',
    'Enviei contrato para assinatura. Aguardando retorno do jurídico deles.',
  ],
  MEETING: [
    'Reunião de discovery com o time do cliente. Mapeamos as dores principais.',
    'Demo do produto realizada — boa reação à parte de automação.',
    'Reunião de negociação. Discutimos prazo de pagamento e SLA.',
    'Kickoff técnico com a equipe de implementação do cliente.',
    'Apresentação para o C-level. Decisão deve sair nas próximas 2 semanas.',
    'Reunião de fechamento — alinhamos os últimos detalhes do contrato.',
    'Workshop de avaliação com os usuários finais. Feedback muito positivo.',
  ],
  NOTE: [
    'Cliente pediu desconto de 10% para fechar ainda este trimestre.',
    'Concorrente também está no processo — precisamos acelerar.',
    'Budget aprovado pelo financeiro. Sinal verde para avançar.',
    'Decisor de férias até o fim do mês, processo deve atrasar um pouco.',
    'Champion trocou de área — precisamos achar um novo ponto focal.',
    'Deal com alto potencial de expansão depois do go-live.',
    'Cliente comparando com solução interna. Reforçar ROI no próximo contato.',
  ],
}

const NEXTSTEP_TEMPLATES: Record<string, string[]> = {
  CALL:    ['Ligar para confirmar aprovação do orçamento', 'Follow-up por telefone sobre a proposta'],
  EMAIL:   ['Enviar proposta atualizada', 'Mandar contrato para assinatura', 'Follow-up sobre pricing'],
  MEETING: ['Agendar demo com o time técnico', 'Reunião de negociação final', 'Apresentação para o C-level'],
  NOTE:    ['Revisar condições comerciais', 'Preparar business case de ROI'],
}

type MentionKind = 'peer' | 'you' | 'team'
const COMMENT_TEMPLATES: { text: string; mention?: MentionKind }[] = [
  { text: 'Esse deal está esquentando, vamos priorizar essa semana.' },
  { text: 'Cliente muito engajado na última call. Boa chance de fechar no mês.' },
  { text: 'Risco de perder pro concorrente — precisamos de uma contraproposta rápida.' },
  { text: '{mention} consegue dar suporte no pricing aqui?', mention: 'peer' },
  { text: '{mention} esse é da sua carteira, qual o próximo passo?', mention: 'peer' },
  { text: 'Acabei de falar com o champion, ele está confiante na aprovação.' },
  { text: 'Atenção: expectativa de fechamento pode escorregar pro próximo trimestre.' },
  { text: 'Ótimo trabalho na demo! Cliente elogiou bastante.' },
  { text: 'Vamos preparar um case de ROI antes da reunião com o C-level.' },
  { text: '{mention} podemos alinhar a estratégia desse deal amanhã?', mention: 'peer' },
  { text: 'Subi o desconto pra aprovação da diretoria, retorno em breve.' },
  { text: 'Cliente pediu para incluir o módulo de relatórios no escopo.' },
  { text: '{mention} consegue dar uma olhada nesse deal? Acho que precisa da sua visão.', mention: 'you' },
  { text: '{mention} o cliente perguntou de você na call de hoje, consegue retornar?', mention: 'you' },
  { text: '{mention} esse aqui tá travado no pricing, pode ajudar a destravar?', mention: 'you' },
  { text: '{mention} bora revisar a proposta desse deal antes de enviar?', mention: 'you' },
  { text: '{mention} preciso da sua aprovação no desconto desse contrato.', mention: 'you' },
  { text: '{mention} alguém do time consegue assumir o follow-up dessa conta?', mention: 'team' },
  { text: '{mention} esse deal precisa de atenção do time essa semana.', mention: 'team' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pick<T>(arr: readonly T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min }
function daysAgoISO(days: number, jitterHours = 8) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(randInt(8, 18), randInt(0, 59), 0, 0)
  d.setHours(d.getHours() + randInt(-jitterHours, jitterHours))
  return d.toISOString()
}
function daysFromNowISO(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(randInt(9, 17), 0, 0, 0)
  return d.toISOString()
}

const ACTIVITY_TYPES = ['CALL', 'EMAIL', 'MEETING', 'NOTE'] as const

export interface SeedActivityResult {
  dealsTouched: number
  activities:   number
  comments:     number
}

/**
 * Populates activities + comments for a sample of (mostly open) deals.
 * Async — uses Postgres via @/lib/db helpers.
 */
export async function seedActivity(sampleSize = 500): Promise<SeedActivityResult> {
  const [openDeals, closedDeals] = await Promise.all([
    query<any>(`
      SELECT "dealId", "ownerName", stage, amount, "expectedCloseDate", "daysInCurrentStage",
             "contactsLogged", "accountSegment", "riskScore"
      FROM deals
      WHERE stage NOT IN ('CLOSED_WON','CLOSED_LOST')
      ORDER BY RANDOM()
      LIMIT $1
    `, [Math.floor(sampleSize * 0.85)]),
    query<any>(`
      SELECT "dealId", "ownerName", stage, amount, "expectedCloseDate", "daysInCurrentStage",
             "contactsLogged", "accountSegment", "riskScore"
      FROM deals
      WHERE stage IN ('CLOSED_WON','CLOSED_LOST')
      ORDER BY RANDOM()
      LIMIT $1
    `, [Math.ceil(sampleSize * 0.15)]),
  ])

  const deals = [...openDeals, ...closedDeals]
  const now   = new Date().toISOString()

  // Load teams for @team mentions
  const teamRows = await query<{ name: string; memberIds: string }>('SELECT name, "memberIds" FROM teams')
  const teams = teamRows.map(t => {
    let ids: string[] = []
    try { ids = JSON.parse(t.memberIds || '[]') } catch { ids = [] }
    return { name: t.name, memberIds: ids }
  }).filter(t => t.memberIds.length > 0)

  // Wipe previously generated demo rows
  await Promise.all([
    run(`DELETE FROM activities WHERE "createdBy" = 'seed'`),
    run(`DELETE FROM comments   WHERE "authorId" LIKE 'seed-%'`),
  ])

  let activityCount = 0
  let commentCount  = 0

  for (const deal of deals) {
    const isClosed   = deal.stage === 'CLOSED_WON' || deal.stage === 'CLOSED_LOST'
    const nActs      = randInt(2, 6)
    const dayOffsets = Array.from({ length: nActs }, () =>
      Math.random() < 0.45 ? randInt(0, 6) : randInt(7, 45)
    ).sort((a, b) => b - a)

    let lastAt: string | null   = null
    let lastType: string | null = null

    for (const off of dayOffsets) {
      const type = pick(ACTIVITY_TYPES)
      const at   = daysAgoISO(off)
      await run(`
        INSERT INTO activities ("dealId", type, notes, "activityAt", "isNextStep", "isCompleted", "dueAt", "createdAt", "createdBy")
        VALUES ($1, $2, $3, $4, 0, 1, NULL, $4, 'seed')
      `, [deal.dealId, type, pick(ACTIVITY_TEMPLATES[type]), at])

      await run(`
        INSERT INTO audit_log ("dealId", action, "newValue", notes, "performedBy", "originatedBy", "createdAt")
        VALUES ($1, 'ACTIVITY_LOGGED', $2, '', $3, 'user', $4)
      `, [deal.dealId, type, deal.ownerName, at])

      activityCount++
      if (!lastAt || at > lastAt) { lastAt = at; lastType = type }
    }

    if (!isClosed && Math.random() < 0.7) {
      const type = pick(ACTIVITY_TYPES)
      const due  = daysFromNowISO(randInt(1, 10))
      await run(`
        INSERT INTO activities ("dealId", type, notes, "activityAt", "isNextStep", "isCompleted", "dueAt", "createdAt", "createdBy")
        VALUES ($1, $2, $3, $4, 1, 0, $4, $5, 'seed')
      `, [deal.dealId, type, pick(NEXTSTEP_TEMPLATES[type]), due, now])
      activityCount++
    }

    const nComments = Math.random() < 0.55 ? randInt(1, 3) : 0
    for (let i = 0; i < nComments; i++) {
      const tpl      = pick(COMMENT_TEMPLATES)
      const author   = pick(TEAM_MEMBERS)
      let content    = tpl.text
      const mentioned: string[] = []

      if (tpl.mention === 'peer') {
        const target = pick(TEAM_MEMBERS.filter(m => m.id !== author.id))
        content = content.replace('{mention}', `@${target.name}`)
        mentioned.push(target.id)
      } else if (tpl.mention === 'you') {
        content = content.replace('{mention}', '@Você')
        mentioned.push('user-0')
      } else if (tpl.mention === 'team') {
        if (teams.length) {
          const team = pick(teams)
          content = content.replace('{mention}', `@${team.name}`)
          mentioned.push(...team.memberIds)
        } else {
          const target = pick(TEAM_MEMBERS.filter(m => m.id !== author.id))
          content = content.replace('{mention}', `@${target.name}`)
          mentioned.push(target.id)
        }
      }

      const id = `CMT-seed-${deal.dealId}-${i}-${Math.random().toString(36).slice(2, 6)}`
      await run(`
        INSERT INTO comments (id, "dealId", "authorId", "authorName", content, "mentionedUsers", "createdAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [id, deal.dealId, `seed-${author.id}`, author.name, content, JSON.stringify(mentioned), daysAgoISO(randInt(0, 30))])
      commentCount++
    }

    if (lastAt && !isClosed) {
      const risk = computeRisk({ ...deal, lastActivityAt: lastAt })
      await run(`
        UPDATE deals SET "lastActivityAt" = $1, "lastActivityType" = $2,
          "riskScore" = $3, "riskFlags" = $4, "riskLevel" = $5, "updatedAt" = $6
        WHERE "dealId" = $7
      `, [lastAt, lastType, risk.score, JSON.stringify(risk.flags), risk.level, now, deal.dealId])
    }
  }

  return { dealsTouched: deals.length, activities: activityCount, comments: commentCount }
}
