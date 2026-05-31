import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'
import type { FunctionDeclaration, Part } from '@google/generative-ai'
import { query, queryOne, run } from '@/lib/db'
import { computeRisk } from '@/lib/risk'
import { VALID_TRANSITIONS, STAGE_WEIGHTS } from '@/lib/types'
import type { Stage } from '@/lib/types'
import { getCalendarClient, isConnected } from '@/lib/google-calendar'

export const dynamic = 'force-dynamic'

const TODAY = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

const SYSTEM_PROMPT = `Você é um assistente de inteligência de pipeline de vendas B2B. Hoje é ${TODAY}.

Você ajuda gerentes de vendas a:
1. Entender e navegar o pipeline em linguagem natural
2. Identificar deals em risco e priorizar atenção
3. Executar operações de CRM (mover estágio, registrar atividades, agendar próximos passos, reatribuir owners, fechar deals)
4. Redigir emails de follow-up personalizados com dados reais
5. Criar lembretes/alertas para ações futuras (contato com cliente, follow-up, etc.)

REGRAS DE SEGURANÇA CRÍTICAS:
- NUNCA invente IDs de deal, nomes de conta, valores ou nomes de owner — use apenas dados do banco
- Para QUALQUER operação de escrita (mudança de estágio, fechar deal, reatribuir, agendar atividade, criar lembrete), você DEVE primeiro descrever exatamente o que vai fazer e perguntar ao usuário para confirmar antes de executar a ferramenta de escrita
- Para operações em bulk (múltiplos deals), mostre a lista completa antes de executar
- Se os dados solicitados não existirem, diga isso claramente em vez de adivinhar
- Quando fechar um deal como CLOSED_LOST, sempre informe qual motivo será registrado

FLUXO PARA AÇÕES DE ESCRITA:
1. Use ferramentas de leitura para reunir contexto (search_deals, get_deal, draft_email)
2. Apresente o plano detalhado: "Vou fazer X com o deal Y. Confirmar?"
3. AGUARDE o usuário dizer "confirmar", "sim", "pode executar" ou similar
4. Só então chame a ferramenta de escrita
5. Reporte o que foi feito

PARA EMAILS DE FOLLOW-UP:
- Use draft_email para buscar contexto completo do deal
- Componha um email profissional em português usando os dados reais (nome da conta, estágio, histórico de atividades, valor, owner)
- Apresente o rascunho para revisão
- Pergunte se quer registrar como atividade EMAIL no deal

PARA AGENDA (get_calendar_events):
- Use esta ferramenta quando o usuário perguntar sobre reuniões, compromissos, agenda ou próximos eventos
- Pode vincular eventos a deals usando link_calendar_event
- Mostre horários, participantes e empresas identificadas
- Ajude o usuário a se preparar para reuniões com contexto dos deals vinculados

PARA LEMBRETES (create_reminder):
- Quando o usuário pedir "me lembre em X dias" ou "alerte quando...", calcule a data a partir de HOJE
- Use ISO completo: ex. "2026-06-02T09:00:00.000Z"
- Sempre mostre a data calculada e peça confirmação antes de criar
- Após criar, confirme com: "✅ Lembrete agendado para [data]. Você verá um alerta no sino 🔔 quando a data chegar."

Responda sempre em português brasileiro. Seja direto e profissional.`

const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'search_deals',
    description: 'Busca e filtra deals no pipeline. Retorna lista de deals com detalhes.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        stage:               { type: SchemaType.STRING,  description: 'Filtrar por estágio: LEAD, QUALIFIED, DISCOVERY, DEMO, PROPOSAL, NEGOTIATION' },
        ownerName:           { type: SchemaType.STRING,  description: 'Filtrar por nome do owner' },
        accountSegment:      { type: SchemaType.STRING,  description: 'Filtrar por segmento: SMB, MID, ENT' },
        industry:            { type: SchemaType.STRING,  description: 'Filtrar por indústria' },
        riskLevel:           { type: SchemaType.STRING,  description: 'Filtrar por risco: HIGH, MEDIUM, LOW' },
        minAmount:           { type: SchemaType.NUMBER,  description: 'Valor mínimo do deal em BRL' },
        minDaysInStage:      { type: SchemaType.NUMBER,  description: 'Deals no estágio há pelo menos N dias' },
        minDaysSinceActivity:{ type: SchemaType.NUMBER,  description: 'Deals sem atividade por pelo menos N dias' },
        hasOverdueClose:     { type: SchemaType.BOOLEAN, description: 'Apenas deals com close date vencida' },
        limit:               { type: SchemaType.NUMBER,  description: 'Máximo de resultados (padrão 20)' },
        sortBy:              { type: SchemaType.STRING,  description: 'Ordenar por: riskScore, amount, daysInCurrentStage, lastActivityAt' },
      },
    },
  },
  {
    name: 'get_deal',
    description: 'Busca todos os detalhes de um deal específico, incluindo atividades e audit log.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: { dealId: { type: SchemaType.STRING, description: 'ID do deal (ex: DEAL-404024)' } },
      required: ['dealId'],
    },
  },
  {
    name: 'get_pipeline_summary',
    description: 'Retorna estatísticas agregadas do pipeline: valor total, por estágio, por owner, distribuição de risco.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        ownerName:      { type: SchemaType.STRING, description: 'Filtrar por owner' },
        accountSegment: { type: SchemaType.STRING, description: 'Filtrar por segmento' },
      },
    },
  },
  {
    name: 'get_risky_deals',
    description: 'Retorna os N deals com maior risk score (mais críticos primeiro).',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        limit:     { type: SchemaType.NUMBER, description: 'Número de deals (padrão 10)' },
        minScore:  { type: SchemaType.NUMBER, description: 'Score mínimo de risco (0-100)' },
        stage:     { type: SchemaType.STRING, description: 'Filtrar por estágio' },
        ownerName: { type: SchemaType.STRING, description: 'Filtrar por owner' },
      },
    },
  },
  {
    name: 'update_stage',
    description: 'Move um deal para um novo estágio. Valida a transição. REQUER confirmação antes de chamar.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        dealId:   { type: SchemaType.STRING, description: 'ID do deal' },
        newStage: { type: SchemaType.STRING, description: 'Estágio destino' },
        reason:   { type: SchemaType.STRING, description: 'Motivo da mudança' },
      },
      required: ['dealId', 'newStage'],
    },
  },
  {
    name: 'log_activity',
    description: 'Registra uma atividade concluída num deal. REQUER confirmação antes de chamar.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        dealId:     { type: SchemaType.STRING, description: 'ID do deal' },
        type:       { type: SchemaType.STRING, description: 'Tipo: CALL, EMAIL, MEETING, NOTE' },
        notes:      { type: SchemaType.STRING, description: 'Notas sobre a atividade' },
        activityAt: { type: SchemaType.STRING, description: 'Timestamp ISO (padrão: agora)' },
      },
      required: ['dealId', 'type', 'notes'],
    },
  },
  {
    name: 'schedule_next_step',
    description: 'Agenda um próximo passo para um deal. REQUER confirmação antes de chamar.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        dealId: { type: SchemaType.STRING, description: 'ID do deal' },
        type:   { type: SchemaType.STRING, description: 'Tipo: CALL, EMAIL, MEETING, NOTE' },
        notes:  { type: SchemaType.STRING, description: 'Descrição do próximo passo' },
        dueAt:  { type: SchemaType.STRING, description: 'Timestamp ISO de vencimento' },
      },
      required: ['dealId', 'type', 'dueAt'],
    },
  },
  {
    name: 'reassign_owner',
    description: 'Muda o owner de um deal. REQUER confirmação antes de chamar.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        dealId:   { type: SchemaType.STRING, description: 'ID do deal' },
        newOwner: { type: SchemaType.STRING, description: 'Nome do novo owner' },
        reason:   { type: SchemaType.STRING, description: 'Motivo da reatribuição' },
      },
      required: ['dealId', 'newOwner'],
    },
  },
  {
    name: 'close_deal',
    description: 'Fecha um deal como ganho ou perdido. REQUER confirmação antes de chamar.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        dealId:     { type: SchemaType.STRING, description: 'ID do deal' },
        outcome:    { type: SchemaType.STRING, description: 'CLOSED_WON ou CLOSED_LOST' },
        lostReason: { type: SchemaType.STRING, description: 'Obrigatório se CLOSED_LOST: NO_BUDGET, LOST_TO_COMPETITOR, NO_DECISION, OTHER' },
        notes:      { type: SchemaType.STRING, description: 'Notas adicionais' },
      },
      required: ['dealId', 'outcome'],
    },
  },
  {
    name: 'draft_email',
    description: 'Busca contexto completo de um deal para redigir email de follow-up personalizado.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        dealId:    { type: SchemaType.STRING, description: 'ID do deal' },
        emailType: { type: SchemaType.STRING, description: 'Tipo do email: FOLLOW_UP, CHECK_IN, PROPOSAL_FOLLOW_UP, MEETING_REQUEST, CLOSING, REACTIVATION' },
      },
      required: ['dealId', 'emailType'],
    },
  },
  {
    name: 'create_reminder',
    description: 'Cria um lembrete/alerta que aparecerá no sino de notificações na data programada. REQUER confirmação antes de chamar.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        dealId:   { type: SchemaType.STRING, description: 'ID do deal relacionado (opcional)' },
        dealName: { type: SchemaType.STRING, description: 'Nome da conta para exibição no alerta' },
        message:  { type: SchemaType.STRING, description: 'Mensagem do lembrete' },
        triggerAt:{ type: SchemaType.STRING, description: 'Data/hora ISO quando o alerta deve disparar' },
      },
      required: ['message', 'triggerAt'],
    },
  },
  {
    name: 'get_calendar_events',
    description: 'Busca os próximos compromissos do Google Calendar (próximos 14 dias).',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        onlyWithDeals: { type: SchemaType.BOOLEAN, description: 'Se true, retorna apenas eventos vinculados a deals' },
        searchTitle:   { type: SchemaType.STRING,  description: 'Filtrar eventos pelo título' },
      },
    },
  },
  {
    name: 'add_meeting_note',
    description: 'Adiciona uma nota/anotação a um evento do calendário.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        eventId:    { type: SchemaType.STRING, description: 'ID do evento do calendário' },
        eventTitle: { type: SchemaType.STRING, description: 'Título do evento' },
        content:    { type: SchemaType.STRING, description: 'Conteúdo da nota/anotação' },
      },
      required: ['eventId', 'content'],
    },
  },
]

// ─── Tool execution ───────────────────────────────────────────────────────────

async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const now = new Date().toISOString()

  if (name === 'search_deals') {
    const conditions: string[] = ["stage NOT IN ('CLOSED_WON','CLOSED_LOST')"]
    const values: unknown[] = []
    if (args.stage)          { values.push(args.stage);          conditions.push(`stage = $${values.length}`) }
    if (args.ownerName)      { values.push(args.ownerName);      conditions.push(`"ownerName" = $${values.length}`) }
    if (args.accountSegment) { values.push(args.accountSegment); conditions.push(`"accountSegment" = $${values.length}`) }
    if (args.industry)       { values.push(args.industry);       conditions.push(`industry = $${values.length}`) }
    if (args.riskLevel)      { values.push(args.riskLevel);      conditions.push(`"riskLevel" = $${values.length}`) }
    if (args.minAmount)      { values.push(args.minAmount);      conditions.push(`amount >= $${values.length}`) }
    if (args.minDaysInStage) { values.push(args.minDaysInStage); conditions.push(`"daysInCurrentStage" >= $${values.length}`) }
    if (args.hasOverdueClose){ values.push(now);                 conditions.push(`"expectedCloseDate" < $${values.length}`) }
    if (args.minDaysSinceActivity) {
      const cutoff = new Date(Date.now() - (args.minDaysSinceActivity as number) * 86_400_000).toISOString()
      values.push(cutoff)
      conditions.push(`("lastActivityAt" IS NULL OR "lastActivityAt" < $${values.length})`)
    }
    const orderMap: Record<string, string> = {
      riskScore: '"riskScore" DESC', amount: 'amount DESC',
      daysInCurrentStage: '"daysInCurrentStage" DESC', lastActivityAt: '"lastActivityAt" ASC',
    }
    const order = orderMap[(args.sortBy as string) || 'riskScore'] || '"riskScore" DESC'
    const limit = Math.min((args.limit as number) || 20, 100)
    const rows = await query(
      `SELECT "dealId","accountName","accountSegment",industry,"ownerName",stage,amount,"expectedCloseDate","lastActivityAt","lastActivityType","daysInCurrentStage","contactsLogged","riskScore","riskLevel","riskFlags" FROM deals WHERE ${conditions.join(' AND ')} ORDER BY ${order} LIMIT ${limit}`,
      values
    )
    return { deals: rows, count: rows.length }
  }

  if (name === 'get_deal') {
    const deal = await queryOne(`SELECT * FROM deals WHERE "dealId" = $1`, [args.dealId as string])
    if (!deal) return { error: `Deal ${args.dealId} não encontrado` }
    const [activities, audit] = await Promise.all([
      query(`SELECT * FROM activities WHERE "dealId" = $1 ORDER BY "activityAt" DESC LIMIT 10`, [args.dealId as string]),
      query(`SELECT * FROM audit_log WHERE "dealId" = $1 ORDER BY "createdAt" DESC LIMIT 10`, [args.dealId as string]),
    ])
    return { deal, activities, audit }
  }

  if (name === 'get_pipeline_summary') {
    const conds: string[] = ["stage NOT IN ('CLOSED_WON','CLOSED_LOST')"]
    const vals: unknown[] = []
    if (args.ownerName)      { vals.push(args.ownerName);      conds.push(`"ownerName" = $${vals.length}`) }
    if (args.accountSegment) { vals.push(args.accountSegment); conds.push(`"accountSegment" = $${vals.length}`) }
    const deals = await query(`SELECT * FROM deals WHERE ${conds.join(' AND ')}`, vals) as any[]
    const totalValue = deals.reduce((s, d) => s + d.amount, 0)
    const weighted   = deals.reduce((s, d) => s + d.amount * (STAGE_WEIGHTS[d.stage as Stage] || 0), 0)
    const byStage    = ['LEAD','QUALIFIED','DISCOVERY','DEMO','PROPOSAL','NEGOTIATION'].map(stage => {
      const g = deals.filter(d => d.stage === stage)
      return { stage, count: g.length, value: Math.round(g.reduce((s, d) => s + d.amount, 0)) }
    })
    return {
      totalOpenDeals: deals.length, totalOpenValue: Math.round(totalValue), weightedValue: Math.round(weighted),
      highRisk: deals.filter(d => d.riskLevel === 'HIGH').length,
      mediumRisk: deals.filter(d => d.riskLevel === 'MEDIUM').length,
      overdue: deals.filter(d => new Date(d.expectedCloseDate) < new Date()).length,
      byStage,
    }
  }

  if (name === 'get_risky_deals') {
    const limit    = Math.min((args.limit as number) || 10, 50)
    const minScore = (args.minScore as number) || 0
    const conds: string[] = [`"riskScore" >= $1`, "stage NOT IN ('CLOSED_WON','CLOSED_LOST')"]
    const vals: unknown[] = [minScore]
    if (args.stage)     { vals.push(args.stage);     conds.push(`stage = $${vals.length}`) }
    if (args.ownerName) { vals.push(args.ownerName); conds.push(`"ownerName" = $${vals.length}`) }
    const rows = await query(
      `SELECT "dealId","accountName","accountSegment","ownerName",stage,amount,"expectedCloseDate","lastActivityAt","daysInCurrentStage","contactsLogged","riskScore","riskLevel","riskFlags" FROM deals WHERE ${conds.join(' AND ')} ORDER BY "riskScore" DESC LIMIT ${limit}`,
      vals
    )
    return { deals: rows, count: rows.length }
  }

  if (name === 'update_stage') {
    const deal = await queryOne(`SELECT * FROM deals WHERE "dealId" = $1`, [args.dealId as string]) as any
    if (!deal) return { error: `Deal ${args.dealId} não encontrado` }
    const valid = VALID_TRANSITIONS[deal.stage as Stage]
    if (!valid.includes(args.newStage as Stage)) return { error: `Transição inválida: ${deal.stage} → ${args.newStage}. Permitidas: ${valid.join(', ')}` }
    const risk = computeRisk({ ...deal, stage: args.newStage as Stage })
    await run(`UPDATE deals SET stage=$1,"riskScore"=$2,"riskFlags"=$3,"riskLevel"=$4,"daysInCurrentStage"=0,"updatedAt"=$5 WHERE "dealId"=$6`,
      [args.newStage, risk.score, JSON.stringify(risk.flags), risk.level, now, args.dealId])
    await run(`INSERT INTO audit_log ("dealId",action,"oldValue","newValue",reason,"performedBy","originatedBy","createdAt") VALUES ($1,'STAGE_CHANGE',$2,$3,$4,'manager','agent',$5)`,
      [args.dealId, deal.stage, args.newStage, args.reason || null, now])
    return { success: true, dealId: args.dealId, oldStage: deal.stage, newStage: args.newStage }
  }

  if (name === 'log_activity') {
    const deal = await queryOne(`SELECT * FROM deals WHERE "dealId" = $1`, [args.dealId as string]) as any
    if (!deal) return { error: `Deal ${args.dealId} não encontrado` }
    const at = (args.activityAt as string) || now
    await run(`INSERT INTO activities ("dealId",type,notes,"activityAt","isNextStep","isCompleted","createdAt","createdBy") VALUES ($1,$2,$3,$4,0,1,$5,'agent')`,
      [args.dealId, args.type, args.notes || '', at, now])
    const risk = computeRisk({ ...deal, lastActivityAt: at })
    await run(`UPDATE deals SET "lastActivityAt"=$1,"lastActivityType"=$2,"riskScore"=$3,"riskFlags"=$4,"riskLevel"=$5,"updatedAt"=$6 WHERE "dealId"=$7`,
      [at, args.type, risk.score, JSON.stringify(risk.flags), risk.level, now, args.dealId])
    await run(`INSERT INTO audit_log ("dealId",action,"newValue",notes,"performedBy","originatedBy","createdAt") VALUES ($1,'ACTIVITY_LOGGED',$2,$3,'manager','agent',$4)`,
      [args.dealId, args.type, args.notes || '', now])
    return { success: true, dealId: args.dealId, type: args.type }
  }

  if (name === 'schedule_next_step') {
    const deal = await queryOne(`SELECT "dealId" FROM deals WHERE "dealId" = $1`, [args.dealId as string])
    if (!deal) return { error: `Deal ${args.dealId} não encontrado` }
    await run(`INSERT INTO activities ("dealId",type,notes,"activityAt","isNextStep","isCompleted","dueAt","createdAt","createdBy") VALUES ($1,$2,$3,$4,1,0,$4,$5,'agent')`,
      [args.dealId, args.type, args.notes || '', args.dueAt, now])
    await run(`INSERT INTO audit_log ("dealId",action,"newValue",notes,"performedBy","originatedBy","createdAt") VALUES ($1,'NEXT_STEP_SCHEDULED',$2,$3,'manager','agent',$4)`,
      [args.dealId, `${args.type} em ${args.dueAt}`, args.notes || '', now])
    return { success: true, dealId: args.dealId, type: args.type, dueAt: args.dueAt }
  }

  if (name === 'reassign_owner') {
    const deal = await queryOne(`SELECT * FROM deals WHERE "dealId" = $1`, [args.dealId as string]) as any
    if (!deal) return { error: `Deal ${args.dealId} não encontrado` }
    await run(`UPDATE deals SET "ownerName"=$1,"updatedAt"=$2 WHERE "dealId"=$3`, [args.newOwner, now, args.dealId])
    await run(`INSERT INTO audit_log ("dealId",action,"oldValue","newValue",reason,"performedBy","originatedBy","createdAt") VALUES ($1,'OWNER_REASSIGNED',$2,$3,$4,'manager','agent',$5)`,
      [args.dealId, deal.ownerName, args.newOwner, args.reason || null, now])
    return { success: true, dealId: args.dealId, oldOwner: deal.ownerName, newOwner: args.newOwner }
  }

  if (name === 'close_deal') {
    const deal = await queryOne(`SELECT * FROM deals WHERE "dealId" = $1`, [args.dealId as string]) as any
    if (!deal) return { error: `Deal ${args.dealId} não encontrado` }
    const valid = VALID_TRANSITIONS[deal.stage as Stage]
    if (!valid.includes(args.outcome as Stage)) return { error: `Não é possível fechar a partir de ${deal.stage}` }
    await run(`UPDATE deals SET stage=$1,"riskScore"=0,"riskFlags"='[]',"riskLevel"='LOW',"updatedAt"=$2 WHERE "dealId"=$3`,
      [args.outcome, now, args.dealId])
    await run(`INSERT INTO audit_log ("dealId",action,"oldValue","newValue",reason,notes,"performedBy","originatedBy","createdAt") VALUES ($1,'DEAL_CLOSED',$2,$3,$4,$5,'manager','agent',$6)`,
      [args.dealId, deal.stage, args.outcome, args.lostReason || 'WON', args.notes || null, now])
    return { success: true, dealId: args.dealId, outcome: args.outcome }
  }

  if (name === 'draft_email') {
    const deal = await queryOne(`SELECT * FROM deals WHERE "dealId" = $1`, [args.dealId as string]) as any
    if (!deal) return { error: `Deal ${args.dealId} não encontrado` }
    const [activities, nextSteps] = await Promise.all([
      query(`SELECT type,notes,"activityAt","createdBy" FROM activities WHERE "dealId"=$1 AND "isNextStep"=0 ORDER BY "activityAt" DESC LIMIT 5`, [args.dealId as string]),
      query(`SELECT type,notes,"dueAt" FROM activities WHERE "dealId"=$1 AND "isNextStep"=1 AND "isCompleted"=0 ORDER BY "dueAt" ASC LIMIT 3`, [args.dealId as string]),
    ])
    return {
      emailType: args.emailType,
      deal: {
        dealId: deal.dealId, accountName: deal.accountName, accountSegment: deal.accountSegment,
        industry: deal.industry, ownerName: deal.ownerName, stage: deal.stage, amount: deal.amount,
        expectedCloseDate: deal.expectedCloseDate, lastActivityAt: deal.lastActivityAt,
        daysInCurrentStage: deal.daysInCurrentStage, riskLevel: deal.riskLevel,
        riskFlags: JSON.parse(deal.riskFlags || '[]'), productInterest: deal.productInterest,
      },
      recentActivities: activities,
      pendingNextSteps: nextSteps,
      instruction: `Com base nesses dados reais, componha um email de ${args.emailType} em português brasileiro — profissional, personalizado, direto ao ponto. Use o nome da conta, mencione o estágio, o valor e o histórico. Apresente o rascunho formatado com Assunto: e Corpo:.`,
    }
  }

  if (name === 'create_reminder') {
    const id = `REM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    await run(`INSERT INTO reminders (id,"dealId","dealName",message,"triggerAt","createdBy","isDismissed","createdAt") VALUES ($1,$2,$3,$4,$5,'agent',0,$6)`,
      [id, args.dealId || null, args.dealName || null, args.message, args.triggerAt, now])
    return { success: true, reminderId: id, triggerAt: args.triggerAt, message: args.message }
  }

  if (name === 'get_calendar_events') {
    if (!await isConnected()) {
      return { error: 'Google Calendar não está conectado. O usuário precisa conectar em /api/auth/google.' }
    }
    try {
      const calendar    = await getCalendarClient()
      const now2        = new Date()
      const twoWeeksOut = new Date(now2.getTime() + 14 * 24 * 60 * 60 * 1000)
      const res         = await calendar.events.list({ calendarId: 'primary', timeMin: now2.toISOString(), timeMax: twoWeeksOut.toISOString(), singleEvents: true, orderBy: 'startTime', maxResults: 25 })
      const items       = res.data.items ?? []

      const PERSONAL_PROVIDERS = new Set(['gmail.com','googlemail.com','yahoo.com','hotmail.com','outlook.com','live.com','icloud.com','me.com','msn.com','aol.com','protonmail.com'])
      const eventIds = items.map(e => e.id).filter(Boolean) as string[]
      const links = eventIds.length
        ? await query(`SELECT l.event_id, l.deal_id, d."accountName", d.stage, d."ownerName" FROM calendar_event_links l LEFT JOIN deals d ON l.deal_id = d."dealId" WHERE l.event_id = ANY($1)`, [eventIds])
        : []
      const linkMap: Record<string, any> = {}
      ;(links as any[]).forEach(l => { linkMap[l.event_id] = l })

      let events = items.map(e => {
        const linked    = linkMap[e.id!]
        const attendees = (e.attendees ?? []).map((a: any) => ({ email: a.email ?? '', name: a.displayName || a.email?.split('@')[0] || '', responseStatus: a.responseStatus ?? 'needsAction', self: !!a.self }))
        const corpDomains = [...new Set(attendees.map((a: any) => a.email.split('@')[1]).filter((d: string) => d && !PERSONAL_PROVIDERS.has(d)))]
        return {
          id: e.id, title: e.summary || '(sem título)', start: e.start?.dateTime || e.start?.date || null,
          end: e.end?.dateTime || e.end?.date || null, allDay: !e.start?.dateTime, location: e.location || null,
          meetLink: e.hangoutLink || null, attendees, corporateDomains: corpDomains,
          linkedDeal: linked ? { dealId: linked.deal_id, accountName: linked.accountName, stage: linked.stage, ownerName: linked.ownerName } : null,
        }
      })
      if (args.onlyWithDeals) events = events.filter((e: any) => e.linkedDeal)
      if (args.searchTitle) { const q = (args.searchTitle as string).toLowerCase(); events = events.filter((e: any) => e.title.toLowerCase().includes(q)) }
      return { connected: true, eventCount: events.length, events, summary: `${events.length} compromisso${events.length !== 1 ? 's' : ''} nos próximos 14 dias` }
    } catch (err: any) {
      return { error: `Erro ao buscar agenda: ${err.message}` }
    }
  }

  if (name === 'add_meeting_note') {
    const id = `CNOTE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    await run(`INSERT INTO calendar_event_notes (id,event_id,event_title,content,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$5)`,
      [id, args.eventId, args.eventTitle || null, args.content, now])
    return { success: true, noteId: id, eventId: args.eventId, content: args.content }
  }

  return { error: `Ferramenta desconhecida: ${name}` }
}

// ─── Main handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { messages } = await req.json()

  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GOOGLE_AI_API_KEY não configurada. Adicione no arquivo .env.local e reinicie o servidor.' },
      { status: 500 }
    )
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: SYSTEM_PROMPT,
      tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
    })

    const history = messages.slice(0, -1).map((m: { role: string; content: string }) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }] as Part[],
    }))

    const chat        = model.startChat({ history })
    const lastMessage = messages[messages.length - 1].content

    let currentParts: string | Part[] = lastMessage

    for (let i = 0; i < 10; i++) {
      const result   = await chat.sendMessage(currentParts)
      const response = result.response
      const parts    = response.candidates?.[0]?.content?.parts ?? []
      const fnCalls  = parts.filter((p: Part) => !!p.functionCall)

      if (fnCalls.length === 0) {
        return NextResponse.json({ role: 'assistant', content: response.text() })
      }

      const fnResponses: Part[] = await Promise.all(
        fnCalls.map(async (p: Part) => {
          const { name, args } = p.functionCall!
          const toolResult = await executeTool(name, args as Record<string, unknown>)
          return { functionResponse: { name, response: toolResult } } as Part
        })
      )
      currentParts = fnResponses
    }

    return NextResponse.json({ role: 'assistant', content: 'Limite de iterações atingido. Tente novamente.' })
  } catch (err: unknown) {
    console.error('[agent] Error:', err)
    const message = err instanceof Error ? err.message : String(err)
    const userMessage = message.includes('429') ? 'Limite de requisições da API atingido. Aguarde alguns segundos e tente novamente.'
      : message.includes('403') || message.includes('API key') ? 'Chave de API inválida ou sem permissão. Verifique o GOOGLE_AI_API_KEY no .env.local.'
      : message.includes('404') ? 'Modelo não disponível para esta chave de API.'
      : `Erro na API Gemini: ${message.slice(0, 200)}`
    return NextResponse.json({ error: userMessage }, { status: 500 })
  }
}
