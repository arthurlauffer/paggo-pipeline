import { differenceInDays, parseISO } from 'date-fns'
import type { Deal, RiskFlag, RiskLevel, Stage } from './types'

const NOW = new Date('2026-05-20')

const STAGE_SLAS: Record<string, { days: number; points: number }> = {
  LEAD:        { days: 30, points: 10 },
  QUALIFIED:   { days: 21, points: 12 },
  DISCOVERY:   { days: 14, points: 15 },
  DEMO:        { days:  7, points: 18 },
  PROPOSAL:    { days: 14, points: 22 },
  NEGOTIATION: { days: 21, points: 25 },
}

export interface RiskResult {
  score: number
  flags: RiskFlag[]
  level: RiskLevel
}

export function computeRisk(deal: {
  stage: Stage
  amount: number
  expectedCloseDate: string
  lastActivityAt: string | null
  daysInCurrentStage: number
  contactsLogged: number
  accountSegment: string
}): RiskResult {
  const { stage, amount, expectedCloseDate, lastActivityAt, daysInCurrentStage, contactsLogged, accountSegment } = deal

  if (stage === 'CLOSED_WON' || stage === 'CLOSED_LOST') {
    return { score: 0, flags: [], level: 'LOW' }
  }

  let score = 0
  const flags: RiskFlag[] = []

  // Rule 1: No activity ever — deal created but never touched
  if (!lastActivityAt) {
    score += 30
    flags.push('NO_ACTIVITY')
  } else {
    // Rule 2: Stale — no activity in 14+ days
    const daysSince = differenceInDays(NOW, parseISO(lastActivityAt))
    if (daysSince >= 14) {
      score += 20
      flags.push('STALE')
    }
    // Rule 3a: High-value deal cold for 7+ days (additive)
    if (amount > 50000 && daysSince >= 7) {
      score += 10
      flags.push('HIGH_VALUE_COLD')
    }
  }

  // Rule 4: Overdue expected close date
  if (expectedCloseDate) {
    const closeDate = parseISO(expectedCloseDate)
    if (closeDate < NOW) {
      score += 25
      flags.push('OVERDUE')
    } else {
      // Rule 5: Closing within 30 days but no recent activity
      const daysToClose = differenceInDays(closeDate, NOW)
      const recentActivity = lastActivityAt
        ? differenceInDays(NOW, parseISO(lastActivityAt)) <= 7
        : false
      if (daysToClose <= 30 && !recentActivity) {
        score += 15
        flags.push('CLOSING_SOON_COLD')
      }
    }
  }

  // Rule 6: SLA breach by stage
  const sla = STAGE_SLAS[stage]
  if (sla && daysInCurrentStage > sla.days) {
    score += sla.points
    flags.push('SLA_BREACH')
  }

  // Rule 7: ENT single-threaded — only 1 contact on an enterprise deal
  if (accountSegment === 'ENT' && contactsLogged <= 1) {
    score += 20
    flags.push('SINGLE_THREADED')
  }

  const capped = Math.min(score, 100)
  const level: RiskLevel = capped >= 70 ? 'HIGH' : capped >= 40 ? 'MEDIUM' : 'LOW'

  return { score: capped, flags, level }
}

export function riskLevelLabel(level: RiskLevel) {
  return level === 'HIGH' ? 'Crítico' : level === 'MEDIUM' ? 'Em risco' : 'Saudável'
}

export function flagLabel(flag: RiskFlag): string {
  const labels: Record<RiskFlag, string> = {
    NO_ACTIVITY:       'Sem atividade registrada',
    STALE:             'Parado há 14+ dias',
    HIGH_VALUE_COLD:   'Deal alto valor inativo',
    OVERDUE:           'Data de fechamento vencida',
    CLOSING_SOON_COLD: 'Fechando em breve sem atividade',
    SLA_BREACH:        'SLA de estágio estourado',
    SINGLE_THREADED:   'ENT single-threaded',
  }
  return labels[flag] ?? flag
}
