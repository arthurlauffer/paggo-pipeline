# Paggo Pipeline Intelligence

Ferramenta de *pipeline intelligence* para gerentes de vendas B2B. Importa ~8.000 deals, calcula **risk score automático (0–100)**, oferece **CRUD completo que persiste** (com máquina de estados e audit log) e um **agente de IA** que responde perguntas sobre o pipeline e executa ações em nome do gerente — sempre com preview e confirmação explícita.

🔗 **App publicado:** https://paggo-pipeline.vercel.app
🔗 **Repositório:** https://github.com/arthurlauffer/paggo-pipeline

## Stack

- **Next.js 14** (App Router) + TypeScript + Tailwind — deploy na **Vercel**
- **Neon** (PostgreSQL serverless) como banco
- **Google Gemini** (`gemini-2.5-flash-lite`) para o agente, com **loop de function calling próprio** (read tools executam ao vivo; write tools geram preview e só commitam após confirmação)
- **Recharts** para as visualizações
- **Google Calendar API** (opcional) para a visão de agenda

## Setup

```bash
npm install

# .env.local
DATABASE_URL=postgres://...           # connection string do Neon (neon.tech, tier grátis)
GOOGLE_AI_API_KEY=...                 # chave do Google AI Studio (aistudio.google.com, grátis)
# Opcional — sobrescreve o modelo padrão:
# GEMINI_MODEL=gemini-2.5-flash-lite
# Opcional — integração com Google Calendar:
# GOOGLE_CLIENT_ID=...
# GOOGLE_CLIENT_SECRET=...
# NEXT_PUBLIC_BASE_URL=http://localhost:3000

npm run dev
# http://localhost:3000  →  clique em "Inicializar Banco" para importar os deals
```

O dataset (`public/data/deals.csv`, ~8.000 linhas) já está no repositório. O endpoint `POST /api/seed` cria as tabelas e importa o CSV (procura em `CSV_PATH`, depois `public/data/deals.csv`).

---

## Regras de Risco

Cada deal recebe um **risk score 0–100** composto por 7 fatores. Score **≥ 70 = Crítico** (vermelho), **40–69 = Em risco** (amarelo), **< 40 = Saudável** (verde). Optei por score composto em vez de flags binárias para permitir **ordenar o pipeline por urgência real**: um deal com 3 flags leves recebe menos atenção que um com 2 flags graves.

| Regra | Pontos | Raciocínio |
|---|---|---|
| **NO_ACTIVITY** — nunca teve atividade | 30 | Deal criado mas nunca tocado = abandono completo. O sinal mais forte de deal morto. |
| **STALE** — sem atividade em 14+ dias | 20 | Best practice B2B: todo deal ativo deve ser tocado ao menos quinzenalmente. Silêncio de 2 semanas = deal esfriando. |
| **HIGH_VALUE_COLD** — deal > R$50k parado 7+ dias | +10 | Deals grandes precisam de mais atenção. Um enterprise parado 7 dias é mais grave que um SMB parado 7 dias. |
| **OVERDUE** — data de fechamento vencida | 25 | Deal aberto além do close date implica ciclo atrasado ou deal perdido em silêncio. Win rate cai muito depois do close date. |
| **CLOSING_SOON_COLD** — fecha em 30d sem atividade recente | 15 | Deal prestes a fechar sem atividade é contraditório: ou o rep trabalha off-CRM (invisível) ou o deal está morrendo. |
| **SLA_BREACH** — tempo no estágio acima do SLA | 10–25 | SLAs por estágio: LEAD 30d, QUALIFIED 21d, DISCOVERY 14d, DEMO 7d, PROPOSAL 14d, NEGOTIATION 21d. DEMO é o mais crítico (7d): silêncio pós-demo sinaliza desinteresse. |
| **SINGLE_THREADED** — ENT com apenas 1 contato | 20 | Deals enterprise dependem de multi-stakeholder buy-in. 1 contato = deal morre se o campeão sair. |

---

## Máquina de Estados (CRUD)

```
LEAD       → QUALIFIED | CLOSED_LOST
QUALIFIED  → DISCOVERY | LEAD | CLOSED_LOST
DISCOVERY  → DEMO | QUALIFIED | CLOSED_LOST
DEMO       → PROPOSAL | DISCOVERY | CLOSED_LOST
PROPOSAL   → NEGOTIATION | DEMO | CLOSED_LOST
NEGOTIATION→ CLOSED_WON | PROPOSAL | CLOSED_LOST
CLOSED_WON / CLOSED_LOST → (terminais)
```

Transições inválidas (pular estágios pra frente) são **rejeitadas**. Transições reversas de um passo são permitidas para corrigir classificações erradas. Qualquer estágio ativo pode ir para CLOSED_LOST (que exige motivo estruturado: `NO_BUDGET`, `LOST_TO_COMPETITOR`, `NO_DECISION`, `OTHER`).

Operações suportadas, todas persistindo no banco e refletindo na UI imediatamente: **mover estágio**, **registrar atividade** (CALL/EMAIL/MEETING/NOTE), **agendar próximo passo**, **reatribuir owner**, **fechar deal com motivo**.

**Audit log de primeira classe:** todo evento é registrado com timestamp, ação, valores antigo/novo, motivo, **quem fez** (`performedBy`) e **se foi humano ou agente** (`originatedBy`). Visível no painel de cada deal.

---

## Agente de IA

Modelo `gemini-2.5-flash-lite` com **loop de function calling próprio**. O agente faz três coisas: **responde** perguntas sobre o pipeline, **executa** operações de CRM e **redige outreach** com dados reais.

### Arquitetura human-in-the-loop (server-gated)

A confirmação não é só uma instrução de prompt — é **imposta pela arquitetura**:

1. **`/api/agent`** (fase de chat): read tools executam ao vivo; **write tools NUNCA escrevem no banco aqui** — são validadas (`previewWrite`) e devolvidas como *pending actions*. O modelo, literalmente, não tem como commitar durante a conversa.
2. **`/api/agent/execute`**: único caminho que grava no banco (`commitWrite`), e só é chamado quando o usuário clica em **Aprovar** nos cartões de preview.

Assim, **qualquer ação que afete >1 deal, qualquer fechamento, reatribuição ou outreach redigido** aparece como cartão de preview e exige confirmação explícita. Emails podem ser **aprovados um a um** (com progresso visível) ou todos de uma vez.

**Segurança:** o agente nunca inventa IDs, contas, valores ou nomes de contato. Como o dataset não tem contatos individuais, o outreach usa saudação neutra (ex.: "Olá, equipe da [Conta]") em vez de inventar um nome — ou pergunta. Toda ação do agente é gravada no audit log como `originatedBy: 'agent'`.

### Ferramentas expostas

| Ferramenta | Tipo | Descrição |
|---|---|---|
| `search_deals` | Leitura | Busca deals com filtros: estágio, owner, segmento, risco, valor mínimo, dias sem atividade, close vencido |
| `get_deal` | Leitura | Detalhes completos de um deal: campos, atividades, audit log **e notas/comentários do time** |
| `get_pipeline_summary` | Leitura | Agregados: valor total, ponderado, por estágio, distribuição de risco |
| `get_risky_deals` | Leitura | Top N deals por risk score (mais críticos primeiro) |
| `draft_email` | Leitura | Reúne contexto completo do deal para redigir um follow-up |
| `get_calendar_events` | Leitura | Próximos compromissos do Google Calendar (vinculados a deals quando possível) |
| `draft_followup_email` | **Escrita** | Email de follow-up: o agente compõe assunto+corpo → 1 cartão revisável por email → ao aprovar, agenda atividade EMAIL e enfileira pro owner |
| `update_stage` | **Escrita** | Move deal para novo estágio (valida a máquina de estados) |
| `log_activity` | **Escrita** | Registra CALL/EMAIL/MEETING/NOTE com timestamp e notas |
| `schedule_next_step` | **Escrita** | Agenda atividade planejada com data de vencimento |
| `reassign_owner` | **Escrita** | Reatribui deal para outro rep |
| `close_deal` | **Escrita** | Fecha como CLOSED_WON ou CLOSED_LOST (com motivo estruturado) |
| `queue_for_review` | **Escrita** | Enfileira um deal para revisão do owner (nota + lembrete) |
| `create_reminder` | **Escrita** | Cria lembrete/alerta no sino de notificações |
| `add_meeting_note` | **Escrita** | Adiciona nota a um evento do calendário |

### Exemplo ponta a ponta (o caso do PDF)

> *"Pra todo deal acima de R$50.000 em estágio PROPOSAL sem atividade nos últimos 7+ dias, redija um email de follow-up pro contato principal adaptado ao ponto do ciclo, registre a atividade planejada como EMAIL agendada pra amanhã de manhã, e enfileire pra revisão do owner. Me mostre o que vai fazer antes de executar."*

O agente: (1) chama `search_deals` (PROPOSAL, `minAmount` 50000, `minDaysSinceActivity` 7) para descobrir os deals reais; (2) compõe um email por deal adaptado ao estágio; (3) chama `draft_followup_email` uma vez por deal → cada email vira um cartão revisável com assunto+corpo; (4) o gerente lê email por email e aprova (individual ou em lote); (5) ao aprovar, cada email é agendado como atividade EMAIL para amanhã de manhã e enfileirado pro owner, com registro no audit log como ação do agente.

---

## Visualizações & Dashboard

Dashboard com KPIs (pipeline aberto, pipeline ponderado, contagens de risco, fechando no mês) e charts em Recharts: funil por estágio, valor por estágio, carga por owner, win rate por segmento, distribuição de risco — com filtros e saved views.

---

## Extras implementados (bônus do case)

- **Risk scoring composto 0–100** (em vez de flags binárias).
- **Autenticação por usuário** (login Google): cada usuário tem sua própria sessão e aparece no audit trail; o primeiro a conectar assume a persona de Owner.
- **Colaboração:** comentários/notas por deal com **@menção** de membros do time e notificações.
- **Integração com Google Calendar:** visão de agenda, vínculo evento↔deal e notas de reunião acessíveis pelo agente.
- **Filtros multi-seleção** e **Kanban** com colunas ocultáveis + visão de deals ganhos/perdidos.

---

## Decisões de Design

- **Neon (Postgres) em vez de SQLite:** roda serverless na Vercel sem filesystem persistente; tier gratuito; mesmo SQL em dev e prod.
- **Human-in-the-loop imposto pelo servidor:** o chat só *propõe*; o commit vive num endpoint separado disparado pelo botão de confirmação. Mais seguro que confiar que o modelo "vai pedir confirmação".
- **Gemini `flash-lite` + retry com backoff:** free tier com limites generosos (~15 RPM / 1000 RPD) e retry automático em 429 para suavizar picos.
- **Audit log como produto de primeira classe:** diferencia ações humanas de ações do agente, contando a história de cada deal.
