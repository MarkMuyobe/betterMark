/**
 * SuggestionSurfaceService.ts - V16 Adaptive UX Orchestration
 *
 * Orchestrates existing V12-V15 services to provide contextual suggestions.
 * NO NEW BACKEND LOGIC - purely aggregation and transformation.
 */

// Note: uuid import removed - using built-in methods instead
import {
    SuggestionContext,
    SuggestionActionType,
    SuggestionCard,
    SuggestionSurface,
    SuggestionSurfaceResponse,
    TaskCompletionSuggestion,
    SchedulingConflictSuggestion,
    DashboardSuggestion,
    LogsReflectionSuggestion,
    WhyModalData,
    ConfidenceLevel,
    SuggestionAgentType,
} from '../read-models/SuggestionSurfaceReadModel.js';
import { SuggestionProjectionService } from '../projections/SuggestionProjectionService.js';
import { DecisionExplanationService } from './DecisionExplanationService.js';
import { ScheduleProjectionService } from '../projections/ScheduleProjectionService.js';
import { ActivityProjectionService } from '../projections/ActivityProjectionService.js';

/**
 * Context data for generating suggestions.
 */
export interface SuggestionContextData {
    /** For TaskCompletion: the completed task */
    completedTaskId?: string;
    completedTaskTitle?: string;
    /** For SchedulingConflict: the task being scheduled */
    taskId?: string;
    taskTitle?: string;
    requestedSlot?: { start: Date; end: Date };
    /** For LogsReflection: the time period */
    periodStart?: Date;
    periodEnd?: Date;
}

/**
 * Dismissed suggestion tracking (24h cooldown).
 */
export interface DismissedSuggestion {
    suggestionId: string;
    dismissedAt: Date;
}

/**
 * SuggestionSurfaceService - V16 Core Orchestrator
 *
 * This service ONLY:
 * - Reads from existing projection services
 * - Transforms data for UI consumption
 * - Does NOT create new decisions or preferences
 * - Does NOT modify any backend state
 */
export class SuggestionSurfaceService {
    /** In-memory dismissal tracking (would be in localStorage in real frontend) */
    private dismissedSuggestions: Map<string, DismissedSuggestion> = new Map();
    private readonly DISMISSAL_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

    constructor(
        private readonly suggestionProjection: SuggestionProjectionService,
        private readonly explanationService: DecisionExplanationService,
        private readonly scheduleProjection: ScheduleProjectionService,
        private readonly activityProjection: ActivityProjectionService
    ) {}

    /**
     * Get suggestion for a specific UI context.
     * V16 Rule: Max 1 suggestion per screen.
     */
    async getSuggestionForContext(
        context: SuggestionContext,
        contextData: SuggestionContextData
    ): Promise<SuggestionSurfaceResponse> {
        let suggestion: SuggestionSurface | null = null;

        switch (context) {
            case SuggestionContext.TaskCompletion:
                suggestion = await this.getTaskCompletionSuggestion(contextData);
                break;
            case SuggestionContext.SchedulingConflict:
                suggestion = await this.getSchedulingConflictSuggestion(contextData);
                break;
            case SuggestionContext.Dashboard:
                suggestion = await this.getDashboardSuggestion();
                break;
            case SuggestionContext.LogsReflection:
                suggestion = await this.getLogsReflectionSuggestion(contextData);
                break;
        }

        // Filter out dismissed suggestions
        if (suggestion && this.isDismissed(suggestion.id)) {
            suggestion = null;
        }

        return {
            suggestion,
            hasMore: false, // V16 Rule: Max 1 per screen
        };
    }

    /**
     * Get explanation data for "Why?" modal.
     */
    async getExplanation(decisionId: string): Promise<WhyModalData | null> {
        try {
            const explanation = await this.explanationService.explainDecision(decisionId);
            if (!explanation) return null;

            return {
                decisionId,
                title: 'Decision Explanation',
                summary: explanation.summary || 'No detailed reasoning available.',
                factors: explanation.contributingFactors.map(f => ({
                    name: f.name,
                    description: f.description,
                    weight: this.mapConfidence(f.impact === 'positive' ? 0.8 : f.impact === 'negative' ? 0.2 : 0.5),
                })),
                auditTrailUrl: `/admin/audit?decisionId=${decisionId}`,
            };
        } catch {
            return null;
        }
    }

    /**
     * Mark a suggestion as dismissed (24h cooldown).
     */
    dismissSuggestion(suggestionId: string): void {
        this.dismissedSuggestions.set(suggestionId, {
            suggestionId,
            dismissedAt: new Date(),
        });
    }

    /**
     * Clear expired dismissals.
     */
    clearExpiredDismissals(): void {
        const now = Date.now();
        for (const [id, dismissal] of this.dismissedSuggestions) {
            if (now - dismissal.dismissedAt.getTime() > this.DISMISSAL_COOLDOWN_MS) {
                this.dismissedSuggestions.delete(id);
            }
        }
    }

    /**
     * Check if a suggestion is currently dismissed.
     */
    private isDismissed(suggestionId: string): boolean {
        const dismissal = this.dismissedSuggestions.get(suggestionId);
        if (!dismissal) return false;

        const now = Date.now();
        if (now - dismissal.dismissedAt.getTime() > this.DISMISSAL_COOLDOWN_MS) {
            this.dismissedSuggestions.delete(suggestionId);
            return false;
        }
        return true;
    }

    /**
     * Get suggestion for task completion context.
     */
    private async getTaskCompletionSuggestion(
        contextData: SuggestionContextData
    ): Promise<TaskCompletionSuggestion | null> {
        if (!contextData.completedTaskId || !contextData.completedTaskTitle) {
            return null;
        }

        // Get pending coach suggestions
        const suggestions = await this.suggestionProjection.buildPendingSuggestionReadModels();
        const coachSuggestion = suggestions.find(s => s.agentType === 'CoachAgent');

        if (!coachSuggestion) {
            // Return a default encouragement without preference suggestion
            return this.createDefaultTaskCompletionSuggestion(contextData);
        }

        const suggestionId = `task-completion-${contextData.completedTaskId}`;

        return {
            id: suggestionId,
            agentType: 'coach',
            title: 'Nice work!',
            message: coachSuggestion.reason || 'You usually stay focused when you plan the next task immediately.',
            confidence: this.mapConfidence(coachSuggestion.confidenceScore),
            actions: {
                applyOnce: {
                    type: SuggestionActionType.ApplyOnce,
                    label: 'Add next task',
                    endpoint: '/app/tasks',
                    payload: { action: 'openCreateModal' },
                },
                alwaysDoThis: {
                    type: SuggestionActionType.AlwaysDoThis,
                    label: 'Always remind me',
                    suggestionId: coachSuggestion.suggestionId,
                },
                dismiss: {
                    type: SuggestionActionType.Dismiss,
                    label: 'Dismiss',
                },
            },
            // TODO: SuggestionReadModel doesn't have decisionId - will need to track separately if needed
            decisionId: undefined,
            context: SuggestionContext.TaskCompletion,
            generatedAt: new Date(),
            completedTaskId: contextData.completedTaskId,
            completedTaskTitle: contextData.completedTaskTitle,
        };
    }

    /**
     * Create default task completion suggestion when no pending suggestion exists.
     */
    private createDefaultTaskCompletionSuggestion(
        contextData: SuggestionContextData
    ): TaskCompletionSuggestion {
        const suggestionId = `task-completion-default-${contextData.completedTaskId}`;

        return {
            id: suggestionId,
            agentType: 'coach',
            title: 'Task completed!',
            message: 'Great progress. Would you like to add another task?',
            actions: {
                applyOnce: {
                    type: SuggestionActionType.ApplyOnce,
                    label: 'Add next task',
                    endpoint: '/app/tasks',
                    payload: { action: 'openCreateModal' },
                },
                alwaysDoThis: {
                    type: SuggestionActionType.AlwaysDoThis,
                    label: 'Always remind me',
                    // No suggestionId - will show confirmation dialog
                },
                dismiss: {
                    type: SuggestionActionType.Dismiss,
                    label: 'Dismiss',
                },
            },
            context: SuggestionContext.TaskCompletion,
            generatedAt: new Date(),
            completedTaskId: contextData.completedTaskId!,
            completedTaskTitle: contextData.completedTaskTitle!,
        };
    }

    /**
     * Get suggestion for scheduling conflict context.
     */
    private async getSchedulingConflictSuggestion(
        contextData: SuggestionContextData
    ): Promise<SchedulingConflictSuggestion | null> {
        if (!contextData.taskId || !contextData.requestedSlot) {
            return null;
        }

        // Check for conflicts using existing schedule projection
        const dateStr = contextData.requestedSlot.start.toISOString().split('T')[0];
        const schedule = await this.scheduleProjection.buildScheduleForDate(dateStr);

        // Find conflicts with requested slot
        const conflicts = schedule.blocks.filter(block => {
            const blockStart = new Date(block.startTime).getTime();
            const blockEnd = new Date(block.endTime).getTime();
            const requestStart = contextData.requestedSlot!.start.getTime();
            const requestEnd = contextData.requestedSlot!.end.getTime();
            return blockStart < requestEnd && blockEnd > requestStart;
        });

        if (conflicts.length === 0) {
            return null;
        }

        // Get pending planner suggestions
        const suggestions = await this.suggestionProjection.buildPendingSuggestionReadModels();
        const plannerSuggestion = suggestions.find(s => s.agentType === 'PlannerAgent');

        // Find alternative slot
        const duration = (contextData.requestedSlot.end.getTime() - contextData.requestedSlot.start.getTime()) / 60000;
        const alternativeSlots = await this.scheduleProjection.findSlotsForDuration(dateStr, duration);
        const suggestedSlot = alternativeSlots[0];

        if (!suggestedSlot) {
            return null;
        }

        const suggestionId = `scheduling-conflict-${contextData.taskId}`;
        const conflictReasons = conflicts.map(c => c.label).join(', ');

        return {
            id: suggestionId,
            agentType: 'planner',
            title: 'Scheduling conflict',
            message: `This slot conflicts with: ${conflictReasons}`,
            confidence: plannerSuggestion ? this.mapConfidence(plannerSuggestion.confidenceScore) : 'medium',
            actions: {
                applyOnce: {
                    type: SuggestionActionType.ApplyOnce,
                    label: 'Use suggested slot',
                    endpoint: `/app/tasks/${contextData.taskId}/schedule`,
                    payload: {
                        start: suggestedSlot.startTime,
                        end: suggestedSlot.endTime,
                    },
                },
                alwaysDoThis: {
                    type: SuggestionActionType.AlwaysDoThis,
                    label: 'Auto-resolve conflicts',
                    suggestionId: plannerSuggestion?.suggestionId,
                },
                dismiss: {
                    type: SuggestionActionType.Dismiss,
                    label: 'Keep unassigned',
                },
            },
            // TODO: SuggestionReadModel doesn't have decisionId - will need to track separately if needed
            decisionId: undefined,
            context: SuggestionContext.SchedulingConflict,
            generatedAt: new Date(),
            taskId: contextData.taskId,
            taskTitle: contextData.taskTitle || 'Task',
            conflictReason: conflictReasons,
            suggestedSlot: {
                start: new Date(suggestedSlot.startTime),
                end: new Date(suggestedSlot.endTime),
            },
        };
    }

    /**
     * Get suggestion for dashboard context.
     */
    private async getDashboardSuggestion(): Promise<DashboardSuggestion | null> {
        // Get the most recent pending suggestion from any agent
        const suggestions = await this.suggestionProjection.buildPendingSuggestionReadModels();

        if (suggestions.length === 0) {
            return null;
        }

        // Pick the most recent suggestion
        const suggestion = suggestions[0];
        const suggestionId = `dashboard-${suggestion.suggestionId}`;

        const agentType = this.mapAgentType(suggestion.agentType);

        return {
            id: suggestionId,
            agentType,
            title: this.getDashboardTitle(agentType),
            message: suggestion.reason || 'Based on your recent activity, here\'s a suggestion.',
            confidence: this.mapConfidence(suggestion.confidenceScore),
            actions: {
                applyOnce: {
                    type: SuggestionActionType.ApplyOnce,
                    label: this.getApplyOnceLabel(agentType),
                    endpoint: this.getApplyOnceEndpoint(agentType),
                    payload: { suggestionContext: suggestion },
                },
                alwaysDoThis: {
                    type: SuggestionActionType.AlwaysDoThis,
                    label: 'Enable this behavior',
                    suggestionId: suggestion.suggestionId,
                },
                dismiss: {
                    type: SuggestionActionType.Dismiss,
                    label: 'Dismiss',
                },
            },
            // TODO: SuggestionReadModel doesn't have decisionId - will need to track separately if needed
            decisionId: undefined,
            context: SuggestionContext.Dashboard,
            generatedAt: new Date(),
            basedOnDecisionId: '',
        };
    }

    /**
     * Get suggestion for logs reflection context.
     */
    private async getLogsReflectionSuggestion(
        contextData: SuggestionContextData
    ): Promise<LogsReflectionSuggestion | null> {
        const periodStart = contextData.periodStart || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const periodEnd = contextData.periodEnd || new Date();

        // Get activity logs for the period
        const logs = await this.activityProjection.buildAllActivityLogReadModels({
            dateFrom: periodStart,
            dateTo: periodEnd,
        });

        if (logs.length === 0) {
            return null;
        }

        // Analyze logs for insights (simple categorization based on type)
        // ActivityLogReadModel types: task_completed, goal_completed, task_scheduled, manual_log
        const taskCompletedCount = logs.filter(l => l.type === 'task_completed').length;
        const scheduledCount = logs.filter(l => l.type === 'task_scheduled').length;
        const totalLogs = logs.length;

        // Generate insight message based on activity patterns
        let message: string;
        if (scheduledCount > taskCompletedCount) {
            message = 'You scheduled more tasks than you completed this week. Would you like to review your workload?';
        } else if (taskCompletedCount > scheduledCount && taskCompletedCount > 0) {
            message = 'Great job completing tasks this week! Keep up the momentum.';
        } else {
            message = `You logged ${totalLogs} activities this period. Review your patterns?`;
        }

        // Get pending logger suggestions
        const suggestions = await this.suggestionProjection.buildPendingSuggestionReadModels();
        const loggerSuggestion = suggestions.find(s => s.agentType === 'LoggerAgent');

        const suggestionId = `logs-reflection-${periodStart.toISOString()}`;

        return {
            id: suggestionId,
            agentType: 'logger',
            title: 'Weekly Reflection',
            message,
            confidence: 'medium',
            actions: {
                applyOnce: {
                    type: SuggestionActionType.ApplyOnce,
                    label: 'Open planning view',
                    endpoint: '/app/schedule',
                    payload: { view: 'week' },
                },
                alwaysDoThis: {
                    type: SuggestionActionType.AlwaysDoThis,
                    label: 'Show weekly insights',
                    suggestionId: loggerSuggestion?.suggestionId,
                },
                dismiss: {
                    type: SuggestionActionType.Dismiss,
                    label: 'Dismiss',
                },
            },
            // TODO: SuggestionReadModel doesn't have decisionId - will need to track separately if needed
            decisionId: undefined,
            context: SuggestionContext.LogsReflection,
            generatedAt: new Date(),
            periodStart,
            periodEnd,
            stats: {
                totalLogs,
                reactiveCount: taskCompletedCount,  // Using task_completed as a proxy
                proactiveCount: scheduledCount,      // Using task_scheduled as a proxy
            },
        };
    }

    /**
     * Map confidence value to level.
     */
    private mapConfidence(confidence?: number | string): ConfidenceLevel {
        if (typeof confidence === 'string') {
            if (confidence === 'high' || confidence === 'medium' || confidence === 'low') {
                return confidence;
            }
            return 'medium';
        }
        if (typeof confidence === 'number') {
            if (confidence >= 0.7) return 'high';
            if (confidence >= 0.4) return 'medium';
            return 'low';
        }
        return 'medium';
    }

    /**
     * Map agent ID to agent type.
     */
    private mapAgentType(agentId: string): SuggestionAgentType {
        if (agentId.toLowerCase().includes('coach')) return 'coach';
        if (agentId.toLowerCase().includes('planner')) return 'planner';
        if (agentId.toLowerCase().includes('logger')) return 'logger';
        return 'coach';
    }

    /**
     * Get dashboard title based on agent type.
     */
    private getDashboardTitle(agentType: SuggestionAgentType): string {
        switch (agentType) {
            case 'coach': return 'Coach Insight';
            case 'planner': return 'Planning Suggestion';
            case 'logger': return 'Activity Insight';
        }
    }

    /**
     * Get apply once label based on agent type.
     */
    private getApplyOnceLabel(agentType: SuggestionAgentType): string {
        switch (agentType) {
            case 'coach': return 'Try this';
            case 'planner': return 'Open planner';
            case 'logger': return 'View logs';
        }
    }

    /**
     * Get apply once endpoint based on agent type.
     */
    private getApplyOnceEndpoint(agentType: SuggestionAgentType): string {
        switch (agentType) {
            case 'coach': return '/app/goals';
            case 'planner': return '/app/schedule';
            case 'logger': return '/app/logs';
        }
    }
}
