/**
 * SuggestionSurfaceReadModel.ts - V16 Adaptive UX Read Models
 *
 * UI component contracts for contextual suggestion surfaces.
 * These are purely frontend-facing types - no backend logic.
 */

/**
 * Agent types that can provide suggestions.
 */
export type SuggestionAgentType = 'coach' | 'planner' | 'logger';

/**
 * Confidence level for suggestions.
 */
export type ConfidenceLevel = 'low' | 'medium' | 'high';

/**
 * UI contexts where suggestions can appear.
 */
export enum SuggestionContext {
    /** After task completion */
    TaskCompletion = 'task_completion',
    /** When scheduling conflict detected */
    SchedulingConflict = 'scheduling_conflict',
    /** On dashboard/app entry */
    Dashboard = 'dashboard',
    /** In logs/journal view */
    LogsReflection = 'logs_reflection',
}

/**
 * Standard suggestion action types.
 * V16 Rule: Every suggestion must offer exactly these three options.
 */
export enum SuggestionActionType {
    /** Apply the suggestion once without creating preferences */
    ApplyOnce = 'apply_once',
    /** Approve the underlying preference suggestion */
    AlwaysDoThis = 'always_do_this',
    /** Dismiss the suggestion (24h cooldown in UI) */
    Dismiss = 'dismiss',
}

/**
 * Action definition for a suggestion.
 */
export interface SuggestionAction {
    type: SuggestionActionType;
    label: string;
    /** For ApplyOnce: the mutation endpoint to call */
    endpoint?: string;
    /** For ApplyOnce: the payload to send */
    payload?: Record<string, unknown>;
    /** For AlwaysDoThis: the suggestion ID to approve */
    suggestionId?: string;
}

/**
 * SuggestionCard - Main suggestion display component contract.
 */
export interface SuggestionCard {
    /** Unique identifier for this suggestion surface instance */
    id: string;
    /** Which agent provided this suggestion */
    agentType: SuggestionAgentType;
    /** Short title for the suggestion */
    title: string;
    /** Main message/content */
    message: string;
    /** Optional confidence indicator */
    confidence?: ConfidenceLevel;
    /** The three standard actions */
    actions: {
        applyOnce: SuggestionAction;
        alwaysDoThis: SuggestionAction;
        dismiss: SuggestionAction;
    };
    /** Decision ID for "Why?" explanation lookup */
    decisionId?: string;
    /** Context where this suggestion should appear */
    context: SuggestionContext;
    /** Timestamp when suggestion was generated */
    generatedAt: Date;
}

/**
 * SuggestionInlineRow - Compact inline suggestion for embedded contexts.
 */
export interface SuggestionInlineRow {
    id: string;
    agentType: SuggestionAgentType;
    message: string;
    confidence?: ConfidenceLevel;
    actions: {
        applyOnce: SuggestionAction;
        alwaysDoThis: SuggestionAction;
        dismiss: SuggestionAction;
    };
    decisionId?: string;
}

/**
 * SuggestionDrawer - Mobile-safe drawer component contract.
 */
export interface SuggestionDrawer {
    isOpen: boolean;
    suggestion: SuggestionCard | null;
    /** Whether to show the "Why?" explanation panel */
    showExplanation: boolean;
}

/**
 * WhyModal - Explanation modal using DecisionExplanationService.
 */
export interface WhyModalData {
    decisionId: string;
    title: string;
    /** Summary explanation from DecisionExplanationService */
    summary: string;
    /** Factors that contributed to the suggestion */
    factors: Array<{
        name: string;
        description: string;
        weight: 'low' | 'medium' | 'high';
    }>;
    /** Link to full audit trail */
    auditTrailUrl?: string;
}

/**
 * Context-specific suggestion data for Task Completion.
 */
export interface TaskCompletionSuggestion extends SuggestionCard {
    context: SuggestionContext.TaskCompletion;
    /** The task that was just completed */
    completedTaskId: string;
    completedTaskTitle: string;
}

/**
 * Context-specific suggestion data for Scheduling Conflict.
 */
export interface SchedulingConflictSuggestion extends SuggestionCard {
    context: SuggestionContext.SchedulingConflict;
    /** The conflicting task */
    taskId: string;
    taskTitle: string;
    /** Conflict details */
    conflictReason: string;
    /** Planner's suggested alternative */
    suggestedSlot: {
        start: Date;
        end: Date;
    };
}

/**
 * Context-specific suggestion data for Dashboard.
 */
export interface DashboardSuggestion extends SuggestionCard {
    context: SuggestionContext.Dashboard;
    /** Most recent decision this is based on */
    basedOnDecisionId: string;
}

/**
 * Context-specific suggestion data for Logs Reflection.
 */
export interface LogsReflectionSuggestion extends SuggestionCard {
    context: SuggestionContext.LogsReflection;
    /** Time period this insight covers */
    periodStart: Date;
    periodEnd: Date;
    /** Optional summary statistics */
    stats?: {
        totalLogs: number;
        reactiveCount: number;
        proactiveCount: number;
    };
}

/**
 * Union type for all suggestion types.
 */
export type SuggestionSurface =
    | TaskCompletionSuggestion
    | SchedulingConflictSuggestion
    | DashboardSuggestion
    | LogsReflectionSuggestion;

/**
 * Response from suggestion surface endpoint.
 */
export interface SuggestionSurfaceResponse {
    /** The suggestion to display, or null if none */
    suggestion: SuggestionSurface | null;
    /** UX rule: max 1 per screen */
    hasMore: boolean;
}
