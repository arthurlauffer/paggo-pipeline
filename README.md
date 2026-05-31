# Paggo Pipeline Intelligence

Ferramenta de pipeline intelligence para gerentes de vendas B2B. Mostra 8.000 deals com risk scoring automático, operações completas de CRUD e um agente de IA que responde perguntas e executa ações com confirmação explícita.

## Setup

```bash
cd paggo-pipeline
npm install

# Adicione sua chave da Anthropic no .env.local:
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local

npm run dev
# Acesse http://localhost:3000
# Clique em "Inicializar Banco" para importar os 8.000 deals
```

O banco SQLite é criado automaticamente em `data/pipeline.db`. O CSV é lido de `../deals.csv` (relativo ao projeto) ou do caminho definido em `CSV_PATH`.

---

## Regras de Risco

Cada deal recebe um **risk score 0–100** baseado em 7 fatores. Score ≥ 70 = Crítico (vermelho), 40–69 = Em risco (amarelo), < 40 = Saudável (verde).

### Por que essas regras?

| Regra | Pontos | Raciocínio |
|---|---|---|
| **NO_ACTIVITY** — nunca teve atividade | 30 | Deal criado mas nunca tocado = abandono completo. Sinal mais forte de deal morto. |
| **STALE** — sem atividade em 14+ dias | 20 | Best practice B2B: todo deal ativo deve ser tocado ao menos quinzenalmente. Silêncio de 2 semanas = deal esfriando. |
| **HIGH_VALUE_COLD** — deal > R$50k parado 7+ dias | +10 | Deals grandes precisam de mais atenção. Um enterprise parado 7 dias é mais grave que um SMB parado 7 dias. |
| **OVERDUE** — data de fechamento vencida | 25 | Deal aberto além do close date implica que ou o ciclo atrasou (comum) ou o deal está perdido silenciosamente. Win rate cai drasticamente após o close date. |
| **CLOSING_SOON_COLD** — fecha em 30d mas sem atividade recente | 15 | Deal prestes a fechar sem atividade é contraditório. Ou o rep está trabalhando off-CRM (invisível) ou o deal está morrendo. |
| **SLA_BREACH** — tempo no estágio acima do SLA | 10–25 | SLAs por estágio: LEAD 30d, QUALIFIED 21d, DISCOVERY 14d, DEMO 7d, PROPOSAL 14d, NEGOTIATION 21d. DEMO é o mais crítico (7d) pois post-demo silence é sinal de desinteresse. |
| **SINGLE_THREADED** — ENT com apenas 1 contato | 20 | Deals enterprise dependem de multi-stakeholder buy-in. 1 contato = deal morre se esse campeão sair ou mudar de posição. |

---

## Ferramentas do Agente de IA

O agente usa `claude-sonnet-4-6` com Anthropic tool use. Para operações de escrita, o agente **sempre descreve o plano e aguarda confirmação** antes de executar.

| Ferramenta | Tipo | Descrição |
|---|---|---|
| `search_deals` | Leitura | Busca deals com filtros: estágio, owner, segmento, risco, valor mínimo, dias sem atividade, close vencido |
| `get_deal` | Leitura | Detalhes completos de um deal: info, atividades, audit log |
| `get_pipeline_summary` | Leitura | Agregados: valor total, ponderado, por estágio, distribuição de risco |
| `get_risky_deals` | Leitura | Top N deals por risk score (mais críticos primeiro) |
| `update_stage` | **Escrita** | Move deal para novo estágio (valida máquina de estados) |
| `log_activity` | **Escrita** | Registra CALL/EMAIL/MEETING/NOTE com timestamp e notas |
| `schedule_next_step` | **Escrita** | Agenda atividade planejada com data de vencimento |
| `reassign_owner` | **Escrita** | Reatribui deal para outro rep |
| `close_deal` | **Escrita** | Fecha como CLOSED_WON ou CLOSED_LOST (com motivo estruturado) |

O agente rotula todas as suas ações no audit log como `originatedBy: 'agent'`, diferenciando de ações manuais do usuário.

---

## Máquina de Estados

```
LEAD → QUALIFIED | CLOSED_LOST
QUALIFIED → DISCOVERY | LEAD | CLOSED_LOST
DISCOVERY → DEMO | QUALIFIED | CLOSED_LOST
DEMO → PROPOSAL | DISCOVERY | CLOSED_LOST
PROPOSAL → NEGOTIATION | DEMO | CLOSED_LOST
NEGOTIATION → CLOSED_WON | PROPOSAL | CLOSED_LOST
CLOSED_WON → (terminal)
CLOSED_LOST → (terminal)
```

Transições reversas (ex: DISCOVERY → QUALIFIED) são permitidas para corrigir classificações erradas. Pular estágios para frente não é permitido. Qualquer estágio ativo pode ir para CLOSED_LOST.

---

## Decisões de Design

**SQLite em vez de Supabase/Neon**: Sem dependência externa, zero configuração, WAL mode para leituras concorrentes. Para produção, trocar o driver é trivial.

**Risk score composto (0–100) em vez de flags binárias**: Permite ordenar o pipeline por urgência real. Um deal com 3 flags menores (score 45) recebe menos atenção que um com 2 flags graves (score 70).

**Human-in-the-loop por instrução de sistema**: O agente é instruído a descrever e pedir confirmação antes de chamar ferramentas de escrita. Mais robusto que guardar "pending actions" em estado — o próprio modelo sabe que precisa confirmar e mantém isso na conversa.

**Audit log de primeira classe**: Todo evento (mudança de estágio, atividade, fechamento) é registrado com timestamp, quem fez e se foi humano ou agente. Visível na aba "Audit Log" do painel de cada deal.

**`daysInCurrentStage` resetado para 0 em mudança de estágio**: O campo é persistido no CSV como snapshot. Ao mover um deal, zeramos o contador para refletir o tempo no novo estágio.
