# Paggo Pipeline Intelligence

Eu construí uma ferramenta de *pipeline intelligence* para gerentes de vendas B2B. Ela importa cerca de 8.000 deals, calcula um risk score automático de 0 a 100, oferece CRUD completo que persiste no banco (com máquina de estados e audit log) e traz um agente de IA que responde perguntas sobre o pipeline e executa ações em nome do gerente, sempre com preview e confirmação explícita.

🔗 **App publicado:** https://paggo-pipeline.vercel.app
🔗 **Repositório:** https://github.com/arthurlauffer/paggo-pipeline

## Stack

Escolhi a stack pensando em rodar tudo de graça e com o mínimo de atrito:

- **Next.js 14** (App Router) com TypeScript e Tailwind, publicado na **Vercel**
- **Neon** (PostgreSQL serverless) como banco
- **Google Gemini** (`gemini-2.5-flash-lite`) no agente, com um loop de function calling que escrevi do zero (read tools executam ao vivo, write tools geram preview e só commitam depois da confirmação)
- **Recharts** para as visualizações
- **Google Calendar API** (opcional) para a visão de agenda

## Setup

```bash
npm install

# .env.local
DATABASE_URL=postgres://...           # connection string do Neon (neon.tech, tier grátis)
GOOGLE_AI_API_KEY=...                 # chave do Google AI Studio (aistudio.google.com, grátis)
# Opcional, sobrescreve o modelo padrão:
# GEMINI_MODEL=gemini-2.5-flash-lite
# Opcional, integração com Google Calendar:
# GOOGLE_CLIENT_ID=...
# GOOGLE_CLIENT_SECRET=...
# NEXT_PUBLIC_BASE_URL=http://localhost:3000

npm run dev
# http://localhost:3000, depois clique em "Inicializar Banco" para importar os deals
```

Deixei o dataset (`public/data/deals.csv`, cerca de 8.000 linhas) já dentro do repositório. O endpoint `POST /api/seed` cria as tabelas e importa o CSV (ele procura primeiro em `CSV_PATH` e depois em `public/data/deals.csv`).

## Regras de Risco

Como o dataset vem sem nenhum rótulo de risco, eu precisei decidir o que "em risco" significa. Em vez de flags binárias, optei por um **risk score de 0 a 100** composto por 7 fatores, porque eu queria conseguir ordenar o pipeline por urgência real. Pra mim isso importa: um deal com 3 sinais leves (score 45) não deveria roubar a atenção de um deal com 2 sinais graves (score 70). A faixa que defini é: score acima de 70 é Crítico (vermelho), de 40 a 69 é Em risco (amarelo), abaixo de 40 é Saudável (verde).

Esses são os fatores que escolhi e o motivo de cada um:

| Regra | Pontos | Por que eu incluí |
|---|---|---|
| **NO_ACTIVITY**, nunca teve atividade | 30 | Pra mim é o sinal mais forte de deal morto. Um deal criado e nunca tocado é abandono completo, então dei o peso mais alto. |
| **STALE**, sem atividade há 14 dias ou mais | 20 | Parti da prática comum em B2B de que todo deal ativo deveria ser tocado pelo menos a cada duas semanas. Silêncio de 14 dias pra mim já é deal esfriando. |
| **HIGH_VALUE_COLD**, deal acima de R$50k parado há 7 dias ou mais | +10 | Achei justo que um deal grande pese mais. Um enterprise parado uma semana me preocupa muito mais do que um SMB parado o mesmo tempo, então somei pontos extras. |
| **OVERDUE**, data de fechamento já vencida | 25 | Quando o deal passa do close date, ou o ciclo atrasou ou ele morreu em silêncio. Como o win rate despenca depois dessa data, tratei como sinal grave. |
| **CLOSING_SOON_COLD**, fecha em 30 dias mas sem atividade recente | 15 | Isso me parece contraditório: um deal prestes a fechar deveria estar quente. Se está frio, ou o rep trabalha fora do CRM (e eu não enxergo) ou o deal está morrendo. |
| **SLA_BREACH**, tempo no estágio acima do SLA | 10 a 25 | Defini um SLA por estágio (LEAD 30d, QUALIFIED 21d, DISCOVERY 14d, DEMO 7d, PROPOSAL 14d, NEGOTIATION 21d). Fiz o DEMO ser o mais apertado, com 7 dias, porque silêncio logo depois de uma demo costuma indicar desinteresse. |
| **SINGLE_THREADED**, conta ENT com só 1 contato | 20 | Deals enterprise dependem de várias pessoas dizendo sim. Se só existe 1 contato, o deal morre caso esse campeão saia, então sinalizo isso de propósito. |

## Máquina de Estados (CRUD)

Pensei a máquina de estados pra refletir como um funil real funciona, e pra rejeitar coisas que não fazem sentido:

```
LEAD       → QUALIFIED | CLOSED_LOST
QUALIFIED  → DISCOVERY | LEAD | CLOSED_LOST
DISCOVERY  → DEMO | QUALIFIED | CLOSED_LOST
DEMO       → PROPOSAL | DISCOVERY | CLOSED_LOST
PROPOSAL   → NEGOTIATION | DEMO | CLOSED_LOST
NEGOTIATION→ CLOSED_WON | PROPOSAL | CLOSED_LOST
CLOSED_WON / CLOSED_LOST → (terminais)
```

Eu rejeito transições inválidas, como pular estágios pra frente. Deixei as transições reversas de um passo liberadas porque na prática o rep às vezes classifica errado e precisa corrigir. Qualquer estágio ativo pode ir direto pra CLOSED_LOST, e nesse caso exijo um motivo estruturado (`NO_BUDGET`, `LOST_TO_COMPETITOR`, `NO_DECISION` ou `OTHER`).

Todas as operações persistem no banco e aparecem na UI na hora: mover estágio, registrar atividade (CALL, EMAIL, MEETING, NOTE), agendar próximo passo, reatribuir owner e fechar deal com motivo.

Tratei o **audit log como parte central do produto**, não como um detalhe. Cada evento guarda timestamp, ação, valores antigo e novo, motivo, quem executou (`performedBy`) e se a origem foi humana ou do agente (`originatedBy`). Tudo isso fica visível no painel de cada deal.

## Agente de IA

Aqui foi onde eu mais quis mostrar o meu teto. Usei o `gemini-2.5-flash-lite` e escrevi meu próprio loop de function calling. Eu queria que o agente fizesse três coisas bem feitas: responder perguntas sobre o pipeline, executar operações de CRM, e redigir outreach com dados reais.

### Como pensei o human in the loop

Eu não quis depender só do prompt pra garantir a confirmação, porque seria fácil o modelo "escapar" e executar algo sozinho. Então resolvi impor isso pela própria arquitetura:

1. No `/api/agent` (a fase de conversa), as read tools rodam ao vivo, mas as write tools nunca escrevem no banco. Elas passam por uma validação (`previewWrite`) e voltam como ações pendentes. Na prática, o modelo não tem como commitar nada durante o chat.
2. O `/api/agent/execute` é o único caminho que grava no banco (`commitWrite`), e ele só é chamado quando o usuário clica em Aprovar nos cartões de preview.

Com isso, qualquer ação que afete mais de um deal, qualquer fechamento, reatribuição ou outreach redigido vira um cartão de preview e exige confirmação explícita. Pensando na confiança do gerente, fiz questão de deixar aprovar os emails um por um (com o progresso aparecendo na tela) ou todos de uma vez.

Sobre **segurança**, fui rígido: o agente nunca inventa IDs, contas, valores ou nomes de contato. Como o dataset não traz contatos individuais, decidi que o outreach usa uma saudação neutra (algo como "Olá, equipe da [Conta]") em vez de chutar um nome, ou então pergunta. E toda ação do agente entra no audit log marcada como `originatedBy: 'agent'`, pra ficar claro o que foi ele e o que fui eu.

### Ferramentas que expus

| Ferramenta | Tipo | O que ela faz |
|---|---|---|
| `search_deals` | Leitura | Busca deals com filtros: estágio, owner, segmento, risco, valor mínimo, dias sem atividade, close vencido |
| `get_deal` | Leitura | Detalhes completos de um deal: campos, atividades, audit log e as notas do time |
| `get_pipeline_summary` | Leitura | Agregados: valor total, ponderado, por estágio, distribuição de risco |
| `get_risky_deals` | Leitura | Top N deals por risk score (mais críticos primeiro) |
| `draft_email` | Leitura | Reúne o contexto completo do deal pra eu redigir um follow-up |
| `get_calendar_events` | Leitura | Próximos compromissos do Google Calendar, vinculados a deals quando dá |
| `draft_followup_email` | Escrita | Email de follow-up: o agente compõe assunto e corpo, gera 1 cartão revisável por email e, ao aprovar, agenda a atividade EMAIL e enfileira pro owner |
| `update_stage` | Escrita | Move o deal para um novo estágio, validando a máquina de estados |
| `log_activity` | Escrita | Registra CALL, EMAIL, MEETING ou NOTE com timestamp e notas |
| `schedule_next_step` | Escrita | Agenda uma atividade planejada com data de vencimento |
| `reassign_owner` | Escrita | Reatribui o deal para outro rep |
| `close_deal` | Escrita | Fecha como CLOSED_WON ou CLOSED_LOST com motivo estruturado |
| `queue_for_review` | Escrita | Enfileira um deal pra revisão do owner (nota mais lembrete) |
| `create_reminder` | Escrita | Cria um lembrete no sino de notificações |
| `add_meeting_note` | Escrita | Adiciona uma nota a um evento do calendário |

### O exemplo ponta a ponta do case

> *"Pra todo deal acima de R$50.000 em estágio PROPOSAL sem atividade nos últimos 7+ dias, redija um email de follow-up pro contato principal adaptado ao ponto do ciclo onde ele está, registre a atividade planejada como EMAIL agendada pra amanhã de manhã, e enfileire pra revisão do owner. Me mostre o que vai fazer antes de executar."*

Foi exatamente esse fluxo que eu desenhei o agente pra resolver. Ele começa chamando `search_deals` (PROPOSAL, `minAmount` 50000, `minDaysSinceActivity` 7) pra descobrir os deals reais. Depois compõe um email por deal adaptado ao estágio, e chama `draft_followup_email` uma vez por deal, de modo que cada email vira um cartão revisável com assunto e corpo. Aí o gerente lê email por email e aprova, no ritmo dele, individualmente ou em lote. No momento em que aprova, cada email é agendado como atividade EMAIL pra amanhã de manhã e enfileirado pro owner, e tudo entra no audit log como ação do agente.

## Visualizações & Dashboard

Montei um dashboard com os KPIs que eu acho que um gerente olha primeiro numa segunda de manhã: pipeline aberto, pipeline ponderado, contagens de risco e o que fecha no mês. Em cima disso, usei o Recharts pra trazer funil por estágio, valor por estágio, carga por owner, win rate por segmento e distribuição de risco, com filtros e saved views.

## Extras que decidi implementar

Fui além do mínimo em alguns pontos que eu achei que deixavam o produto mais real:

- **Risk scoring composto de 0 a 100**, no lugar de flags binárias
- **Autenticação por usuário** com login Google, pra cada pessoa ter a própria sessão e aparecer no audit trail. O primeiro a conectar assume a persona de Owner
- **Colaboração** com comentários e notas por deal, incluindo @menção de membros do time e notificações
- **Integração com Google Calendar**, com visão de agenda, vínculo entre evento e deal e notas de reunião que o agente consegue ler
- **Filtros multi-seleção** e um **Kanban** com colunas que dá pra ocultar, além da visão dos deals ganhos e perdidos

## Decisões de Design

Algumas escolhas que eu quis deixar registradas:

- **Neon (Postgres) no lugar de SQLite.** Como rodo na Vercel, não tenho filesystem persistente, então um Postgres serverless me dá o mesmo SQL em dev e em produção sem dor de cabeça, e ainda no tier gratuito.
- **Human in the loop imposto pelo servidor.** Preferi separar o "propor" do "executar" em endpoints diferentes a confiar que o modelo vai lembrar de pedir confirmação. Achei mais seguro.
- **Gemini flash-lite com retry e backoff.** Fiquei no free tier (cerca de 15 req/min e 1000 por dia) e adicionei retry automático no erro 429, pra suavizar os picos sem o usuário ver falha.
- **Audit log como produto de primeira classe.** Fiz ele diferenciar ação humana de ação do agente justamente pra contar a história de cada deal de forma clara.
