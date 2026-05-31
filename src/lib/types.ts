export type Stage =
  | 'LEAD'
  | 'QUALIFIED'
  | 'DISCOVERY'
  | 'DEMO'
  | 'PROPOSAL'
  | 'NEGOTIATION'
  | 'CLOSED_WON'
  | 'CLOSED_LOST'

export type Segment = 'SMB' | 'MID' | 'ENT'
export type ActivityType = 'CALL' | 'EMAIL' | 'MEETING' | 'NOTE'
export type RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW'
export type LostReason = 'NO_BUDGET' | 'LOST_TO_COMPETITOR' | 'NO_DECISION' | 'OTHER'

export type RiskFlag =
  | 'NO_ACTIVITY'
  | 'STALE'
  | 'HIGH_VALUE_COLD'
  | 'OVERDUE'
  | 'CLOSING_SOON_COLD'
  | 'SLA_BREACH'
  | 'SINGLE_THREADED'

export interface Deal {
  dealId: string
  accountName: string
  accountSegment: Segment
  industry: string
  ownerName: string
  stage: Stage
  amount: number
  createdAt: string
  expectedCloseDate: string
  lastActivityAt: string | null
  lastActivityType: ActivityType | null
  daysInCurrentStage: number
  contactsLogged: number
  source: string
  productInterest: string
  previousDealsWithAccount: number
  riskScore: number
  riskFlags: string        // JSON string of RiskFlag[]
  riskLevel: RiskLevel
  updatedAt: string
  commentCount?: number    // injected by /api/deals query
}

export interface Activity {
  id: number
  dealId: string
  type: ActivityType
  notes: string
  activityAt: string
  isNextStep: 0 | 1
  isCompleted: 0 | 1
  dueAt: string | null
  createdAt: string
  createdBy: string       // 'user' | 'agent'
}

export interface AuditEvent {
  id: number
  dealId: string
  action: string
  oldValue: string | null
  newValue: string | null
  reason: string | null
  notes: string | null
  performedBy: string
  originatedBy: string    // 'user' | 'agent'
  createdAt: string
}

export interface DealFilters {
  stage?: Stage
  ownerName?: string
  accountSegment?: Segment
  industry?: string
  riskLevel?: RiskLevel
  search?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  page?: number
  limit?: number
  includesClosed?: boolean
}

export interface PipelineSummary {
  totalOpenValue: number
  weightedValue: number
  totalOpenDeals: number
  highRiskCount: number
  mediumRiskCount: number
  overdueCount: number
  closingThisMonthCount: number
  byStage: { stage: Stage; count: number; value: number }[]
  byOwner: { owner: string; count: number; value: number; highRisk: number }[]
  bySegment: { segment: Segment; count: number; value: number; winRate: number }[]
  riskDistribution: { level: RiskLevel; count: number }[]
}

// Stage probability weights for weighted pipeline
export const STAGE_WEIGHTS: Record<Stage, number> = {
  LEAD: 0.05,
  QUALIFIED: 0.15,
  DISCOVERY: 0.25,
  DEMO: 0.40,
  PROPOSAL: 0.60,
  NEGOTIATION: 0.80,
  CLOSED_WON: 1.0,
  CLOSED_LOST: 0.0,
}

export const VALID_TRANSITIONS: Record<Stage, Stage[]> = {
  LEAD: ['QUALIFIED', 'CLOSED_LOST'],
  QUALIFIED: ['DISCOVERY', 'LEAD', 'CLOSED_LOST'],
  DISCOVERY: ['DEMO', 'QUALIFIED', 'CLOSED_LOST'],
  DEMO: ['PROPOSAL', 'DISCOVERY', 'CLOSED_LOST'],
  PROPOSAL: ['NEGOTIATION', 'DEMO', 'CLOSED_LOST'],
  NEGOTIATION: ['CLOSED_WON', 'PROPOSAL', 'CLOSED_LOST'],
  CLOSED_WON: [],
  CLOSED_LOST: [],
}

export const ACTIVE_STAGES: Stage[] = ['LEAD', 'QUALIFIED', 'DISCOVERY', 'DEMO', 'PROPOSAL', 'NEGOTIATION']

// ─── Team members (fake users for @mention) ──────────────────────────────────

export const TEAM_MEMBERS = [
  { id: 'user-1', name: 'Ana Paula',       role: 'Sales Manager',      initials: 'AP', color: 'bg-purple-500' },
  { id: 'user-2', name: 'Rafael Souza',    role: 'Account Executive',  initials: 'RS', color: 'bg-blue-500'   },
  { id: 'user-3', name: 'Juliana Costa',   role: 'Customer Success',   initials: 'JC', color: 'bg-emerald-500'},
  { id: 'user-4', name: 'Marcos Ferreira', role: 'Sales Director',     initials: 'MF', color: 'bg-amber-500'  },
  { id: 'user-5', name: 'Camila Rocha',    role: 'Biz Dev',            initials: 'CR', color: 'bg-pink-500'   },
] as const

export type TeamMember = typeof TEAM_MEMBERS[number]

// ─── Collaboration types ──────────────────────────────────────────────────────

export interface Comment {
  id: string
  dealId: string
  authorId: string
  authorName: string
  content: string
  mentionedUsers: string   // JSON array of user IDs
  createdAt: string
}

export interface Reminder {
  id: string
  dealId: string | null
  dealName: string | null
  message: string
  triggerAt: string
  createdBy: string
  isDismissed: 0 | 1
  createdAt: string
}

export const STAGE_COLORS: Record<Stage, string> = {
  LEAD: '#6366f1',
  QUALIFIED: '#8b5cf6',
  DISCOVERY: '#3b82f6',
  DEMO: '#06b6d4',
  PROPOSAL: '#f59e0b',
  NEGOTIATION: '#f97316',
  CLOSED_WON: '#22c55e',
  CLOSED_LOST: '#ef4444',
}
