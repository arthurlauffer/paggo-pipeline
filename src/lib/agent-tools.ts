import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'
import type { FunctionDeclaration } from '@google/generative-ai'
import { query, queryOne, run } from './db'
import { computeRisk } from './risk'
import { VALID_TRANSITIONS, STAGE_WEIGHTS } from './types'
import type { Stage } from './types'
import { getCalendarClient, isConnected } from './google-calendar'

export { GoogleGenerativeAI }

const TODAY = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

// ─── System prompt ──────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `Você é o assistente de inteligência de pipeline de vendas B2B do Paggo CRM. Hoje é ${TODAY}.

VISIBILIDADE TOTAL:
Você tem acesso de leitura completo ao pipeline. Para reunir contexto use:
- search_deals: filtra deals (estágio, owner, segmento, valor mínimo, dias sem atividade, etc.)
- get_deal: TODOS os detalhes de um deal — campos, atividades, audit log E as notas/comentários do time
- get_pipeline_summary e get_risky_deals: visões agregadas
- draft_email: contexto completo do deal para redigir um follow-up
Sempre baseie qualquer afirmação em dados retornados por essas ferramentas.

COMO VOCÊ DEVE TRABALHAR (planejar → propor → confirmar → reportar):
1. PLANEJE: para pedidos com várias etapas, primeiro use as ferramentas de LEITURA para descobrir exatamente quais deals/contas/valores estão envolvidos.
2. PROPONHA: descreva o plano completo em texto — liste TODOS os deals afetados (id, conta, valor) e o que será feito em cada um. Em seguida chame as ferramentas de ESCRITA correspondentes.
3. As ferramentas de escrita NÃO executam imediatamente. Elas retornam um PREVIEW e ficam PENDENTES. O usuário verá um cartão com os botões "Confirmar e executar" / "Cancelar".
4. Portanto NUNCA diga que algo "foi feito", "executado", "registrado" ou "agendado". Diga que você está PROPONDO e que aguarda a confirmação do usuário.
5. Para ações em LOTE (vários deals), chame a ferramenta de escrita UMA VEZ POR DEAL, para que cada item apareça na lista de preview.
6. O relatório do que de fato foi feito acontece DEPOIS que o usuário confirma — não antecipe.

FERRAMENTAS DE ESCRITA (sempre exigem confirmação explícita do usuário): update_stage, log_activity, schedule_next_step, reassign_owner, close_deal, create_reminder, queue_for_review, add_meeting_note.

REGRAS DE SEGURANÇA (inquebráveis):
- NUNCA invente IDs de deal, nomes de conta, valores, nomes de owner ou nomes de contato. Use somente o que as leituras retornarem.
- NÃO existe um cadastro de contatos individuais no sistema. Logo, ao redigir um email, NÃO invente o nome de uma pessoa de contato. Use uma saudação neutra (ex.: "Olá, equipe da [Conta]") ou pergunte ao usuário quem é o contato. O owner do deal é quem assina o email.
- Se faltar algum dado necessário, pergunte ou recuse — não adivinhe.
- Ao fechar como CLOSED_LOST, sempre informe qual lostReason será registrado.
- Transições de estágio inválidas serão rejeitadas; respeite o funil.

PARA EMAILS DE FOLLOW-UP:
- Use draft_email para o contexto, componha um email profissional em português adaptado ao estágio do ciclo, com Assunto: e Corpo:, usando dados reais (conta, estágio, valor, histórico).
- Para de fato registrar o envio planejado, proponha schedule_next_step (tipo EMAIL) e/ou queue_for_review.

Responda sempre em português brasileiro. Seja direto e profissional.`

// ─── Tool declarations ────────────────────────────────────────────────────────

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'search_deals',
    description: 'Busca e filtra deals no pipeline. Retorna lista de deals com detalhes. (Leitura)',
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
    description: 'Busca todos os detalhes de um deal: campos, atividades, audit log e notas/comentários do time. (Leitura)',
    parameters: {
      type: SchemaType.OBJECT,
      properties: { dealId: { type: SchemaType.STRING, description: 'ID do deal (ex: DEAL-404024)' } },
      required: ['dealId'],
    },
  },
  {
    name: 'get_pipeline_summary',
    description: 'Estatísticas agregadas do pipeline: valor total, por estágio, por owner, distribuição de risco. (Leitura)',
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
    description: 'Retorna os N deals com maior risk score (mais críticos primeiro). (Leitura)',
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
    name: 'draft_email',
    description: 'Busca contexto completo de um deal para redigir email de follow-up personalizado. (Leitura)',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        dealId:    { type: SchemaType.STRING, description: 'ID do deal' },
        emailType: { type: SchemaType.STRING, description: 'Tipo: FOLLOW_UP, CHECK_IN, PROPOSAL_FOLLOW_UP, MEETING_REQUEST, CLOSING, REACTIVATION' },
      },
      required: ['dealId', 'emailType'],
    },
  },
  {
    name: 'get_calendar_events',
    description: 'Busca os próximos compromissos do Google Calendar (próximos 14 dias). (Leitura)',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        onlyWithDeals: { type: SchemaType.BOOLEAN, description: 'Se true, retorna apenas eventos vinculados a deals' },
        searchTitle:   { type: SchemaType.STRING,  description: 'Filtrar eventos pelo título' },
      },
    },
  },
  // ─── Write tools (proposed → require explicit confirmation) ───
  {
    name: 'update_stage',
    description: 'PROPÕE mover um deal para um novo estágio (valida a transição). Não executa: gera preview e aguarda confirmação.',
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
    description: 'PROPÕE registrar uma atividade concluída num deal. Não executa: gera preview e aguarda confirmação.',
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
    description: 'PROPÕE agendar um próximo passo para um deal. Não executa: gera preview e aguarda confirmação.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        dealId: { type: SchemaType.STRING, description: 'ID do deal' },
        type:   { type: SchemaType.STRING, description: 'Tipo: CALL, EMAIL, MEETING, NOTE' },
        notes:  { type: SchemaType.STRING, description: 'Descrição do próximo passo (inclua o rascunho do email se for o caso)' },
        dueAt:  { type: SchemaType.STRING, description: 'Timestamp ISO de vencimento' },
      },
      required: ['dealId', 'type', 'dueAt'],
    },
  },
  {
    name: 'reassign_owner',
    description: 'PROPÕE mudar o owner de um deal. Não executa: gera preview e aguarda confirmação.',
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
    description: 'PROPÕE fechar um deal como ganho ou perdido. Não executa: gera preview e aguarda confirmação.',
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
    name: 'queue_for_review',
    description: 'PROPÕE enfileirar um deal para revisão do owner: registra uma nota no deal e cria um lembrete. Não executa: gera preview e aguarda confirmação.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        dealId:    { type: SchemaType.STRING, description: 'ID do deal' },
        summary:   { type: SchemaType.STRING, description: 'O que o owner precisa revisar (ex.: o rascunho do email de follow-up)' },
        reviewAt:  { type: SchemaType.STRING, description: 'Timestamp ISO de quando o lembrete de revisão deve aparecer (padrão: amanhã de manhã)' },
      },
      required: ['dealId', 'summary'],
    },
  },
  {
    name: 'create_reminder',
    description: 'PROPÕE criar um lembrete/alerta no sino de notificações. Não executa: gera preview e aguarda confirmação.',
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
    name: 'add_meeting_note',
    description: 'PROPÕE adicionar uma nota a um evento do calendário. Não executa: gera preview e aguarda confirmação.',
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

export const WRITE_TOOLS = new Set([
  'update_stage', 'log_activity', 'schedule_next_step', 'reassign_owner',
  'close_deal', 'queue_for_review', 'create_reminder', 'add_meeting_note',
])

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmtBRL = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n)

const fmtDate = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return String(iso)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Tomorrow 9am local, as ISO.
export function tomorrowMorningISO(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}

// ─── Read tools ───────────────────────────────────────────────────────────────

export async function executeRead(name: string, args: Record<string, unknown>): Promise<unknown> {
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
    const [activities, audit, comments] = await Promise.all([
      query(`SELECT * FROM activities WHERE "dealId" = $1 ORDER BY "activityAt" DESC LIMIT 15`, [args.dealId as string]),
      query(`SELECT action,"oldValue","newValue",reason,notes,"originatedBy","createdAt" FROM audit_log WHERE "dealId" = $1 ORDER BY "createdAt" DESC LIMIT 15`, [args.dealId as string]),
      query(`SELECT "authorName",content,"createdAt" FROM comments WHERE "dealId" = $1 ORDER BY "createdAt" DESC LIMIT 20`, [args.dealId as string]),
    ])
    return { deal, activities, audit, comments }
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
      instruction: `Componha um email de ${args.emailType} em português brasileiro — profissional, personalizado, adaptado ao estágio "${deal.stage}". Use o nome da conta, o valor e o histórico reais. NÃO invente o nome de um contato pessoal: como não há cadastro de contatos, use saudação neutra (ex.: "Olá, equipe da ${deal.accountName}") ou pergunte ao usuário. O owner ${deal.ownerName} assina. Apresente o rascunho com "Assunto:" e "Corpo:".`,
    }
  }

  if (name === 'get_calendar_events') {
    if (!await isConnected()) {
      return { error: 'Google Calendar não está conectado. O usuário precisa conectar primeiro.' }
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
      return { connected: true, eventCount: events.length, events, summary: `${events.length} compromisso(s) nos próximos 14 dias` }
    } catch (err: any) {
      return { error: `Erro ao buscar agenda: ${err.message}` }
    }
  }

  return { error: `Ferramenta de leitura desconhecida: ${name}` }
}

// ─── Write previews (validate, NO db changes) ──────────────────────────────────

export type PreviewResult = {
  ok: boolean
  title: string          // short label for the action card
  description: string    // human-readable preview of the change
  warnings?: string[]
  error?: string
}

export async function previewWrite(name: string, args: Record<string, unknown>): Promise<PreviewResult> {
  if (name === 'update_stage') {
    const deal = await queryOne(`SELECT "accountName",stage,amount FROM deals WHERE "dealId" = $1`, [args.dealId as string]) as any
    if (!deal) return { ok: false, title: 'Mover estágio', description: '', error: `Deal ${args.dealId} não encontrado` }
    const valid = VALID_TRANSITIONS[deal.stage as Stage]
    if (!valid.includes(args.newStage as Stage)) {
      return { ok: false, title: 'Mover estágio', description: '', error: `Transição inválida: ${deal.stage} → ${args.newStage}. Permitidas: ${valid.join(', ') || 'nenhuma'}` }
    }
    return { ok: true, title: `Mover estágio · ${deal.accountName}`, description: `${deal.stage} → ${args.newStage}${args.reason ? ` (motivo: ${args.reason})` : ''}` }
  }

  if (name === 'log_activity') {
    const deal = await queryOne(`SELECT "accountName" FROM deals WHERE "dealId" = $1`, [args.dealId as string]) as any
    if (!deal) return { ok: false, title: 'Registrar atividade', description: '', error: `Deal ${args.dealId} não encontrado` }
    return { ok: true, title: `Registrar ${args.type} · ${deal.accountName}`, description: `${args.type} concluída — "${args.notes ?? ''}"` }
  }

  if (name === 'schedule_next_step') {
    const deal = await queryOne(`SELECT "accountName" FROM deals WHERE "dealId" = $1`, [args.dealId as string]) as any
    if (!deal) return { ok: false, title: 'Agendar próximo passo', description: '', error: `Deal ${args.dealId} não encontrado` }
    return { ok: true, title: `Agendar ${args.type} · ${deal.accountName}`, description: `${args.type} para ${fmtDate(args.dueAt as string)}${args.notes ? ` — "${args.notes}"` : ''}` }
  }

  if (name === 'reassign_owner') {
    const deal = await queryOne(`SELECT "accountName","ownerName" FROM deals WHERE "dealId" = $1`, [args.dealId as string]) as any
    if (!deal) return { ok: false, title: 'Reatribuir owner', description: '', error: `Deal ${args.dealId} não encontrado` }
    return { ok: true, title: `Reatribuir owner · ${deal.accountName}`, description: `${deal.ownerName} → ${args.newOwner}${args.reason ? ` (motivo: ${args.reason})` : ''}` }
  }

  if (name === 'close_deal') {
    const deal = await queryOne(`SELECT "accountName",stage,amount FROM deals WHERE "dealId" = $1`, [args.dealId as string]) as any
    if (!deal) return { ok: false, title: 'Fechar deal', description: '', error: `Deal ${args.dealId} não encontrado` }
    const valid = VALID_TRANSITIONS[deal.stage as Stage]
    if (!valid.includes(args.outcome as Stage)) {
      return { ok: false, title: 'Fechar deal', description: '', error: `Não é possível fechar a partir de ${deal.stage}` }
    }
    const warnings: string[] = []
    if (args.outcome === 'CLOSED_LOST' && !args.lostReason) warnings.push('lostReason não informado — será registrado como OTHER')
    const label = args.outcome === 'CLOSED_WON' ? 'GANHO 🏆' : `PERDIDO ❌ (${args.lostReason || 'OTHER'})`
    return { ok: true, title: `Fechar deal · ${deal.accountName}`, description: `${fmtBRL(deal.amount)} — marcar como ${label}`, warnings }
  }

  if (name === 'queue_for_review') {
    const deal = await queryOne(`SELECT "accountName","ownerName" FROM deals WHERE "dealId" = $1`, [args.dealId as string]) as any
    if (!deal) return { ok: false, title: 'Enfileirar revisão', description: '', error: `Deal ${args.dealId} não encontrado` }
    const at = (args.reviewAt as string) || tomorrowMorningISO()
    return { ok: true, title: `Enfileirar p/ revisão · ${deal.accountName}`, description: `Nota para ${deal.ownerName} + lembrete em ${fmtDate(at)} — "${args.summary ?? ''}"` }
  }

  if (name === 'create_reminder') {
    return { ok: true, title: 'Criar lembrete', description: `${fmtDate(args.triggerAt as string)} — "${args.message ?? ''}"` }
  }

  if (name === 'add_meeting_note') {
    return { ok: true, title: `Nota em evento`, description: `${args.eventTitle ? `"${args.eventTitle}" — ` : ''}"${args.content ?? ''}"` }
  }

  return { ok: false, title: name, description: '', error: `Ferramenta de escrita desconhecida: ${name}` }
}

// ─── Write commits (perform db changes + agent-labeled audit) ──────────────────

export type CommitResult = { success: boolean; summary?: string; error?: string }

export async function commitWrite(name: string, args: Record<string, unknown>): Promise<CommitResult> {
  const now = new Date().toISOString()

  if (name === 'update_stage') {
    const deal = await queryOne(`SELECT * FROM deals WHERE "dealId" = $1`, [args.dealId as string]) as any
    if (!deal) return { success: false, error: `Deal ${args.dealId} não encontrado` }
    const valid = VALID_TRANSITIONS[deal.stage as Stage]
    if (!valid.includes(args.newStage as Stage)) return { success: false, error: `Transição inválida: ${deal.stage} → ${args.newStage}` }
    const risk = computeRisk({ ...deal, stage: args.newStage as Stage })
    await run(`UPDATE deals SET stage=$1,"riskScore"=$2,"riskFlags"=$3,"riskLevel"=$4,"daysInCurrentStage"=0,"updatedAt"=$5 WHERE "dealId"=$6`,
      [args.newStage, risk.score, JSON.stringify(risk.flags), risk.level, now, args.dealId])
    await run(`INSERT INTO audit_log ("dealId",action,"oldValue","newValue",reason,"performedBy","originatedBy","createdAt") VALUES ($1,'STAGE_CHANGE',$2,$3,$4,'manager','agent',$5)`,
      [args.dealId, deal.stage, args.newStage, args.reason || null, now])
    return { success: true, summary: `${deal.accountName}: ${deal.stage} → ${args.newStage}` }
  }

  if (name === 'log_activity') {
    const deal = await queryOne(`SELECT * FROM deals WHERE "dealId" = $1`, [args.dealId as string]) as any
    if (!deal) return { success: false, error: `Deal ${args.dealId} não encontrado` }
    const at = (args.activityAt as string) || now
    await run(`INSERT INTO activities ("dealId",type,notes,"activityAt","isNextStep","isCompleted","createdAt","createdBy") VALUES ($1,$2,$3,$4,0,1,$5,'agent')`,
      [args.dealId, args.type, args.notes || '', at, now])
    const risk = computeRisk({ ...deal, lastActivityAt: at })
    await run(`UPDATE deals SET "lastActivityAt"=$1,"lastActivityType"=$2,"riskScore"=$3,"riskFlags"=$4,"riskLevel"=$5,"updatedAt"=$6 WHERE "dealId"=$7`,
      [at, args.type, risk.score, JSON.stringify(risk.flags), risk.level, now, args.dealId])
    await run(`INSERT INTO audit_log ("dealId",action,"newValue",notes,"performedBy","originatedBy","createdAt") VALUES ($1,'ACTIVITY_LOGGED',$2,$3,'manager','agent',$4)`,
      [args.dealId, args.type, args.notes || '', now])
    return { success: true, summary: `${deal.accountName}: ${args.type} registrada` }
  }

  if (name === 'schedule_next_step') {
    const deal = await queryOne(`SELECT "accountName" FROM deals WHERE "dealId" = $1`, [args.dealId as string]) as any
    if (!deal) return { success: false, error: `Deal ${args.dealId} não encontrado` }
    await run(`INSERT INTO activities ("dealId",type,notes,"activityAt","isNextStep","isCompleted","dueAt","createdAt","createdBy") VALUES ($1,$2,$3,$4,1,0,$4,$5,'agent')`,
      [args.dealId, args.type, args.notes || '', args.dueAt, now])
    await run(`INSERT INTO audit_log ("dealId",action,"newValue",notes,"performedBy","originatedBy","createdAt") VALUES ($1,'NEXT_STEP_SCHEDULED',$2,$3,'manager','agent',$4)`,
      [args.dealId, `${args.type} em ${args.dueAt}`, args.notes || '', now])
    return { success: true, summary: `${deal.accountName}: ${args.type} agendada para ${fmtDate(args.dueAt as string)}` }
  }

  if (name === 'reassign_owner') {
    const deal = await queryOne(`SELECT * FROM deals WHERE "dealId" = $1`, [args.dealId as string]) as any
    if (!deal) return { success: false, error: `Deal ${args.dealId} não encontrado` }
    await run(`UPDATE deals SET "ownerName"=$1,"updatedAt"=$2 WHERE "dealId"=$3`, [args.newOwner, now, args.dealId])
    await run(`INSERT INTO audit_log ("dealId",action,"oldValue","newValue",reason,"performedBy","originatedBy","createdAt") VALUES ($1,'OWNER_REASSIGNED',$2,$3,$4,'manager','agent',$5)`,
      [args.dealId, deal.ownerName, args.newOwner, args.reason || null, now])
    return { success: true, summary: `${deal.accountName}: owner ${deal.ownerName} → ${args.newOwner}` }
  }

  if (name === 'close_deal') {
    const deal = await queryOne(`SELECT * FROM deals WHERE "dealId" = $1`, [args.dealId as string]) as any
    if (!deal) return { success: false, error: `Deal ${args.dealId} não encontrado` }
    const valid = VALID_TRANSITIONS[deal.stage as Stage]
    if (!valid.includes(args.outcome as Stage)) return { success: false, error: `Não é possível fechar a partir de ${deal.stage}` }
    await run(`UPDATE deals SET stage=$1,"riskScore"=0,"riskFlags"='[]',"riskLevel"='LOW',"updatedAt"=$2 WHERE "dealId"=$3`,
      [args.outcome, now, args.dealId])
    await run(`INSERT INTO audit_log ("dealId",action,"oldValue","newValue",reason,notes,"performedBy","originatedBy","createdAt") VALUES ($1,'DEAL_CLOSED',$2,$3,$4,$5,'manager','agent',$6)`,
      [args.dealId, deal.stage, args.outcome, args.lostReason || 'WON', args.notes || null, now])
    return { success: true, summary: `${deal.accountName}: fechado como ${args.outcome}` }
  }

  if (name === 'queue_for_review') {
    const deal = await queryOne(`SELECT "accountName","ownerName" FROM deals WHERE "dealId" = $1`, [args.dealId as string]) as any
    if (!deal) return { success: false, error: `Deal ${args.dealId} não encontrado` }
    const at  = (args.reviewAt as string) || tomorrowMorningISO()
    const cid = `CMT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    await run(`INSERT INTO comments (id,"dealId","authorId","authorName",content,"mentionedUsers","createdAt") VALUES ($1,$2,'agent','Paggo CRM (agente)',$3,'[]',$4)`,
      [cid, args.dealId, `🔖 Para revisão de ${deal.ownerName}: ${args.summary ?? ''}`, now])
    const rid = `REM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    await run(`INSERT INTO reminders (id,"dealId","dealName",message,"triggerAt","createdBy","isDismissed","createdAt") VALUES ($1,$2,$3,$4,$5,'agent',0,$6)`,
      [rid, args.dealId, deal.accountName, `Revisar: ${args.summary ?? ''}`, at, now])
    await run(`INSERT INTO audit_log ("dealId",action,"newValue",notes,"performedBy","originatedBy","createdAt") VALUES ($1,'QUEUED_FOR_REVIEW',$2,$3,'manager','agent',$4)`,
      [args.dealId, deal.ownerName, args.summary || '', now])
    return { success: true, summary: `${deal.accountName}: enfileirado para revisão de ${deal.ownerName}` }
  }

  if (name === 'create_reminder') {
    const id = `REM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    await run(`INSERT INTO reminders (id,"dealId","dealName",message,"triggerAt","createdBy","isDismissed","createdAt") VALUES ($1,$2,$3,$4,$5,'agent',0,$6)`,
      [id, args.dealId || null, args.dealName || null, args.message, args.triggerAt, now])
    return { success: true, summary: `Lembrete criado para ${fmtDate(args.triggerAt as string)}` }
  }

  if (name === 'add_meeting_note') {
    const id = `CNOTE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    await run(`INSERT INTO calendar_event_notes (id,event_id,event_title,content,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$5)`,
      [id, args.eventId, args.eventTitle || null, args.content, now])
    return { success: true, summary: `Nota adicionada ao evento` }
  }

  return { success: false, error: `Ferramenta de escrita desconhecida: ${name}` }
}
