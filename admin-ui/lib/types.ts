/**
 * Admin UI Types - V13 Admin Control Plane
 */

// Pagination
export interface PaginationMeta {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
}

export interface PaginatedResponse<T> {
    data: T[];
    pagination: PaginationMeta;
}

// Preferences
export interface PreferenceReadModel {
    agentType: string;
    preferenceKey: string;
    currentValue: unknown;
    defaultValue: unknown;
    adaptive: boolean;
    riskLevel: 'low' | 'medium' | 'high';
    lastChangedAt: string | null;
    lastChangeSource: 'auto' | 'manual' | null;
    rollbackAvailable: boolean;
}

// Suggestions
export type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'auto_applied';

export interface SuggestionReadModel {
    suggestionId: string;
    agentType: string;
    preferenceKey: string;
    proposedValue: unknown;
    currentValue: unknown;
    confidenceScore: number;
    status: SuggestionStatus;
    requiresApproval: boolean;
    reason: string;
    createdAt: string;
}

// Arbitration Decisions
export interface ArbitrationDecisionReadModel {
    decisionId: string;
    conflictId: string;
    winningAgent: string | null;
    winningActionSummary: string | null;
    suppressedAgents: string[];
    strategyUsed: string;
    reasoningSummary: string;
    escalated: boolean;
    executed: boolean;
    executedAt: string | null;
    resolvedAt: string;
}

// Audit Trail
export type AuditRecordType = 'arbitration' | 'adaptation' | 'rollback';
export type AuditOutcome = 'success' | 'blocked' | 'escalated' | 'rolled_back';

export interface AuditTrailReadModel {
    recordId: string;
    type: AuditRecordType;
    agentType: string;
    targetRef: {
        type: string;
        id: string;
        key?: string;
    };
    actionSummary: string;
    reason: string;
    outcome: AuditOutcome;
    metadata: Record<string, unknown>;
    createdAt: string;
}

// Explanations
export interface ContributingFactor {
    name: string;
    description: string;
    value: unknown;
    impact: 'positive' | 'negative' | 'neutral';
}

export interface PolicyInvolved {
    policyId: string;
    policyName: string;
    effect: string;
}

export interface AlternativeConsidered {
    agentName: string;
    proposedAction: string;
    whyNotChosen: string;
    score?: number;
    priority?: number;
}

export interface Explanation {
    summary: string;
    contributingFactors: ContributingFactor[];
    policiesInvolved: PolicyInvolved[];
    alternativesConsidered: AlternativeConsidered[];
    whyOthersLost: Array<{
        agentName: string;
        proposalId: string;
        reason: string;
        details: string;
    }>;
    decisionType: 'arbitration' | 'adaptation';
    decidedAt: string;
}

// API Results
export interface ApiResult<T = void> {
    success: boolean;
    error?: string;
    data?: T;
}

export interface ApprovalResult {
    success: boolean;
    suggestionId?: string;
    decisionId?: string;
    error?: string;
}

export interface RollbackResult {
    success: boolean;
    rolledBackCount: number;
    errors: string[];
}
