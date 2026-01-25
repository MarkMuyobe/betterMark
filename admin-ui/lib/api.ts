/**
 * Admin UI API Client - V14 Admin Control Plane with JWT support.
 */

import type {
    PaginatedResponse,
    PreferenceReadModel,
    SuggestionReadModel,
    ArbitrationDecisionReadModel,
    AuditTrailReadModel,
    Explanation,
    ApprovalResult,
    RollbackResult,
    ApiResult,
} from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * Storage key for access token.
 */
const ACCESS_TOKEN_KEY = 'admin_access_token';

/**
 * Generate a unique idempotency key.
 */
function generateIdempotencyKey(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Get the current access token from storage.
 */
function getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ACCESS_TOKEN_KEY);
}

/**
 * API error with correlation ID.
 */
export interface ApiErrorDetails {
    code: string;
    message: string;
    correlationId?: string;
    details?: unknown;
}

/**
 * Custom API error class.
 */
export class ApiError extends Error {
    public readonly code: string;
    public readonly correlationId?: string;
    public readonly details?: unknown;
    public readonly status: number;

    constructor(status: number, errorDetails: ApiErrorDetails) {
        super(errorDetails.message);
        this.name = 'ApiError';
        this.code = errorDetails.code;
        this.correlationId = errorDetails.correlationId;
        this.details = errorDetails.details;
        this.status = status;
    }
}

/**
 * Fetch options with idempotency support.
 */
interface FetchApiOptions extends RequestInit {
    requiresIdempotency?: boolean;
}

async function fetchApi<T>(endpoint: string, options: FetchApiOptions = {}): Promise<T> {
    const { requiresIdempotency, ...fetchOptions } = options;
    const token = getAccessToken();

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(fetchOptions.headers as Record<string, string>),
    };

    // Add authorization header if we have a token
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    // Add idempotency key for mutation operations
    if (requiresIdempotency) {
        headers['X-Idempotency-Key'] = generateIdempotencyKey();
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...fetchOptions,
        headers,
    });

    const responseData = await response.json().catch(() => ({}));

    if (!response.ok) {
        if (responseData.error) {
            throw new ApiError(response.status, responseData.error);
        }
        throw new ApiError(response.status, {
            code: 'UNKNOWN_ERROR',
            message: responseData.message || `HTTP ${response.status}`,
        });
    }

    // V14: Some responses are wrapped in { data, correlationId }
    // But PaginatedResponse also has { data, pagination } - don't unwrap those
    // Only unwrap if we have correlationId AND data (V14 wrapper format)
    if (responseData.correlationId && responseData.data !== undefined && !responseData.pagination) {
        return responseData.data;
    }

    return responseData;
}

// Preferences API
export async function getPreferences(params?: {
    page?: number;
    pageSize?: number;
    agent?: string;
}): Promise<PaginatedResponse<PreferenceReadModel>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
    if (params?.agent) searchParams.set('agent', params.agent);

    const query = searchParams.toString();
    return fetchApi(`/admin/preferences${query ? `?${query}` : ''}`);
}

export async function rollbackPreference(
    agentType: string,
    preferenceKey: string,
    reason: string
): Promise<RollbackResult> {
    return fetchApi('/admin/preferences/rollback', {
        method: 'POST',
        body: JSON.stringify({ agentType, preferenceKey, reason }),
        requiresIdempotency: true,
    });
}

// Suggestions API
export async function getSuggestions(params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    agent?: string;
}): Promise<PaginatedResponse<SuggestionReadModel>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
    if (params?.status) searchParams.set('status', params.status);
    if (params?.agent) searchParams.set('agent', params.agent);

    const query = searchParams.toString();
    return fetchApi(`/admin/suggestions${query ? `?${query}` : ''}`);
}

export async function approveSuggestion(
    agentType: string,
    suggestionId: string
): Promise<ApprovalResult> {
    return fetchApi(`/admin/suggestions/${suggestionId}/approve`, {
        method: 'POST',
        body: JSON.stringify({ agentType }),
        requiresIdempotency: true,
    });
}

export async function rejectSuggestion(
    agentType: string,
    suggestionId: string,
    reason: string
): Promise<ApprovalResult> {
    return fetchApi(`/admin/suggestions/${suggestionId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ agentType, reason }),
        requiresIdempotency: true,
    });
}

// Arbitrations API
export async function getArbitrations(params?: {
    page?: number;
    pageSize?: number;
    escalated?: boolean;
}): Promise<PaginatedResponse<ArbitrationDecisionReadModel>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
    if (params?.escalated !== undefined) searchParams.set('escalated', String(params.escalated));

    const query = searchParams.toString();
    return fetchApi(`/admin/arbitrations${query ? `?${query}` : ''}`);
}

export async function getPendingEscalations(params?: {
    page?: number;
    pageSize?: number;
}): Promise<PaginatedResponse<ArbitrationDecisionReadModel>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));

    const query = searchParams.toString();
    return fetchApi(`/admin/escalations/pending${query ? `?${query}` : ''}`);
}

export async function approveEscalation(
    decisionId: string,
    approvedBy?: string,
    selectedProposalId?: string
): Promise<ApprovalResult> {
    return fetchApi(`/admin/escalations/${decisionId}/approve`, {
        method: 'POST',
        body: JSON.stringify({ approvedBy, selectedProposalId }),
        requiresIdempotency: true,
    });
}

export async function rejectEscalation(
    decisionId: string,
    reason: string,
    rejectedBy?: string
): Promise<ApprovalResult> {
    return fetchApi(`/admin/escalations/${decisionId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason, rejectedBy }),
        requiresIdempotency: true,
    });
}

export async function rollbackDecision(
    decisionId: string,
    reason: string
): Promise<RollbackResult> {
    return fetchApi(`/admin/arbitrations/${decisionId}/rollback`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
        requiresIdempotency: true,
    });
}

// Audit API
export async function getAuditTrail(params?: {
    page?: number;
    pageSize?: number;
    type?: string;
    agent?: string;
    since?: string;
}): Promise<PaginatedResponse<AuditTrailReadModel>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
    if (params?.type) searchParams.set('type', params.type);
    if (params?.agent) searchParams.set('agent', params.agent);
    if (params?.since) searchParams.set('since', params.since);

    const query = searchParams.toString();
    return fetchApi(`/admin/audit${query ? `?${query}` : ''}`);
}

// Explanations API
export async function getExplanation(decisionId: string): Promise<ApiResult<Explanation>> {
    return fetchApi(`/admin/explanations/${decisionId}`);
}

export async function getArbitrationExplanation(decisionId: string): Promise<ApiResult<Explanation>> {
    return fetchApi(`/admin/explanations/arbitration/${decisionId}`);
}

export async function getAdaptationExplanation(attemptId: string): Promise<ApiResult<Explanation>> {
    return fetchApi(`/admin/explanations/adaptation/${attemptId}`);
}
