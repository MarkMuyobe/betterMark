/**
 * Product UI API Client - V15 User-Facing Product UI
 */

import type { PaginatedResponse } from './types';
import type {
    GoalListReadModel,
    GoalDetailReadModel,
    SubGoalReadModel,
    TaskListReadModel,
    ScheduleDayReadModel,
    ScheduleBlockReadModel,
    AvailableSlot,
    ActivityLogReadModel,
    JournalEntryReadModel,
    ActivitySummary,
    CreateGoalInput,
    UpdateGoalInput,
    CreateSubGoalInput,
    CreateTaskInput,
    ScheduleAssignInput,
    LogActivityInput,
    WriteJournalInput,
    Facet,
    TaskStatus,
} from './product-types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * Storage key for session.
 */
const SESSION_KEY = 'bm_session_established';

/**
 * Generate a unique idempotency key.
 */
function generateIdempotencyKey(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * API error with details.
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
export class ProductApiError extends Error {
    public readonly code: string;
    public readonly correlationId?: string;
    public readonly details?: unknown;
    public readonly status: number;

    constructor(status: number, errorDetails: ApiErrorDetails) {
        super(errorDetails.message);
        this.name = 'ProductApiError';
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

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(fetchOptions.headers as Record<string, string>),
    };

    // Add idempotency key for mutation operations
    if (requiresIdempotency) {
        headers['X-Idempotency-Key'] = generateIdempotencyKey();
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...fetchOptions,
        headers,
        credentials: 'include', // Include cookies for session auth
    });

    const responseData = await response.json().catch(() => ({}));

    if (!response.ok) {
        if (responseData.error) {
            throw new ProductApiError(response.status, responseData.error);
        }
        throw new ProductApiError(response.status, {
            code: 'UNKNOWN_ERROR',
            message: responseData.message || `HTTP ${response.status}`,
        });
    }

    return responseData;
}

// ============================================================================
// Goals API
// ============================================================================

export async function getGoals(params?: {
    page?: number;
    pageSize?: number;
    facet?: Facet;
    status?: 'active' | 'completed' | 'all';
}): Promise<PaginatedResponse<GoalListReadModel>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
    if (params?.facet) searchParams.set('facet', params.facet);
    if (params?.status) searchParams.set('status', params.status);

    const query = searchParams.toString();
    return fetchApi(`/app/goals${query ? `?${query}` : ''}`);
}

export async function getGoal(id: string): Promise<GoalDetailReadModel> {
    return fetchApi(`/app/goals/${id}`);
}

export async function createGoal(data: CreateGoalInput): Promise<GoalDetailReadModel> {
    return fetchApi('/app/goals', {
        method: 'POST',
        body: JSON.stringify(data),
        requiresIdempotency: true,
    });
}

export async function updateGoal(id: string, data: UpdateGoalInput): Promise<GoalDetailReadModel> {
    return fetchApi(`/app/goals/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
        requiresIdempotency: true,
    });
}

// ============================================================================
// SubGoals API
// ============================================================================

export async function createSubGoal(data: CreateSubGoalInput): Promise<SubGoalReadModel> {
    return fetchApi('/app/subgoals', {
        method: 'POST',
        body: JSON.stringify(data),
        requiresIdempotency: true,
    });
}

// ============================================================================
// Tasks API
// ============================================================================

export async function getTasks(params?: {
    page?: number;
    pageSize?: number;
    status?: TaskStatus;
    goalId?: string;
    dateFrom?: string;
    dateTo?: string;
}): Promise<PaginatedResponse<TaskListReadModel>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
    if (params?.status) searchParams.set('status', params.status);
    if (params?.goalId) searchParams.set('goalId', params.goalId);
    if (params?.dateFrom) searchParams.set('dateFrom', params.dateFrom);
    if (params?.dateTo) searchParams.set('dateTo', params.dateTo);

    const query = searchParams.toString();
    return fetchApi(`/app/tasks${query ? `?${query}` : ''}`);
}

export async function getTask(id: string): Promise<TaskListReadModel> {
    return fetchApi(`/app/tasks/${id}`);
}

export async function createTask(data: CreateTaskInput): Promise<TaskListReadModel> {
    return fetchApi('/app/tasks', {
        method: 'POST',
        body: JSON.stringify(data),
        requiresIdempotency: true,
    });
}

export async function completeTask(id: string): Promise<TaskListReadModel> {
    return fetchApi(`/app/tasks/${id}/complete`, {
        method: 'POST',
        requiresIdempotency: true,
    });
}

// ============================================================================
// Schedule API
// ============================================================================

export async function getSchedule(date?: string): Promise<ScheduleDayReadModel> {
    const searchParams = new URLSearchParams();
    if (date) searchParams.set('date', date);

    const query = searchParams.toString();
    return fetchApi(`/app/schedule${query ? `?${query}` : ''}`);
}

export async function getAvailableSlots(date: string, duration?: number): Promise<AvailableSlot[]> {
    const searchParams = new URLSearchParams();
    searchParams.set('date', date);
    if (duration) searchParams.set('duration', String(duration));

    return fetchApi(`/app/schedule/available?${searchParams.toString()}`);
}

export async function assignToSchedule(data: ScheduleAssignInput): Promise<ScheduleBlockReadModel> {
    return fetchApi('/app/schedule/assign', {
        method: 'POST',
        body: JSON.stringify(data),
        requiresIdempotency: true,
    });
}

export async function deleteScheduleBlock(id: string): Promise<{ success: boolean }> {
    return fetchApi(`/app/schedule/${id}`, {
        method: 'DELETE',
    });
}

// ============================================================================
// Activity Logs API
// ============================================================================

export async function getActivity(params?: {
    page?: number;
    pageSize?: number;
    dateFrom?: string;
    dateTo?: string;
}): Promise<PaginatedResponse<ActivityLogReadModel>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
    if (params?.dateFrom) searchParams.set('dateFrom', params.dateFrom);
    if (params?.dateTo) searchParams.set('dateTo', params.dateTo);

    const query = searchParams.toString();
    return fetchApi(`/app/activity${query ? `?${query}` : ''}`);
}

export async function getActivitySummary(params?: {
    dateFrom?: string;
    dateTo?: string;
}): Promise<ActivitySummary> {
    const searchParams = new URLSearchParams();
    if (params?.dateFrom) searchParams.set('dateFrom', params.dateFrom);
    if (params?.dateTo) searchParams.set('dateTo', params.dateTo);

    const query = searchParams.toString();
    return fetchApi(`/app/activity/summary${query ? `?${query}` : ''}`);
}

export async function logActivity(data: LogActivityInput): Promise<ActivityLogReadModel> {
    return fetchApi('/app/logs/activity', {
        method: 'POST',
        body: JSON.stringify(data),
        requiresIdempotency: true,
    });
}

// ============================================================================
// Journal API
// ============================================================================

export async function getJournal(params?: {
    page?: number;
    pageSize?: number;
    dateFrom?: string;
    dateTo?: string;
}): Promise<PaginatedResponse<JournalEntryReadModel>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
    if (params?.dateFrom) searchParams.set('dateFrom', params.dateFrom);
    if (params?.dateTo) searchParams.set('dateTo', params.dateTo);

    const query = searchParams.toString();
    return fetchApi(`/app/journal${query ? `?${query}` : ''}`);
}

export async function writeJournal(data: WriteJournalInput): Promise<JournalEntryReadModel> {
    return fetchApi('/app/logs/journal', {
        method: 'POST',
        body: JSON.stringify(data),
        requiresIdempotency: true,
    });
}
