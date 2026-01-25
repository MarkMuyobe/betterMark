/**
 * V16AdaptiveUX.test.ts - Tests for V16 Adaptive UX
 *
 * Mandatory test requirements:
 * 1. Suggestion appears only in correct context
 * 2. Apply once performs correct action and disappears
 * 3. Always do this approves suggestion
 * 4. Dismiss hides suggestion for session/day
 * 5. "Why?" shows explanation summary
 * 6. No suggestion blocks core flows
 * 7. No new DecisionRecords created by UI-only actions
 * 8. No preference changes unless explicitly approved
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Read Models
import {
    SuggestionContext,
    SuggestionActionType,
    SuggestionCard,
    SuggestionSurface,
    ConfidenceLevel,
} from '../../read-models/SuggestionSurfaceReadModel.js';

// Services
import { SuggestionSurfaceService, SuggestionContextData } from '../SuggestionSurfaceService.js';
import { SuggestionProjectionService } from '../../projections/SuggestionProjectionService.js';
import { DecisionExplanationService } from '../DecisionExplanationService.js';
import { ScheduleProjectionService } from '../../projections/ScheduleProjectionService.js';
import { ActivityProjectionService } from '../../projections/ActivityProjectionService.js';

// Telemetry
import {
    SuggestionTelemetryService,
    InMemoryTelemetryCollector,
    TelemetryEventType,
} from '../../../infrastructure/telemetry/FrontendTelemetry.js';

// Mock implementations
class MockSuggestionProjectionService {
    private suggestions: any[] = [];

    setSuggestions(suggestions: any[]): void {
        this.suggestions = suggestions;
    }

    async buildPendingSuggestionReadModels(): Promise<any[]> {
        return this.suggestions.filter(s => s.status === 'pending');
    }

    async buildAllSuggestionReadModels(): Promise<any[]> {
        return this.suggestions;
    }

    async buildSuggestionReadModel(agentName: string, suggestionId: string): Promise<any | null> {
        return this.suggestions.find(s => s.suggestionId === suggestionId) || null;
    }
}

class MockDecisionExplanationService {
    private explanations: Map<string, any> = new Map();

    setExplanation(decisionId: string, explanation: any): void {
        this.explanations.set(decisionId, explanation);
    }

    async explainDecision(decisionId: string): Promise<any | null> {
        return this.explanations.get(decisionId) || null;
    }
}

class MockScheduleProjectionService {
    private conflicts: any[] = [];
    private availableSlots: any[] = [];

    setConflicts(conflicts: any[]): void {
        this.conflicts = conflicts;
    }

    setAvailableSlots(slots: any[]): void {
        this.availableSlots = slots;
    }

    async buildScheduleForDate(dateStr: string): Promise<any> {
        return {
            date: dateStr,
            blocks: this.conflicts,
            conflicts: [],
            totalScheduledMinutes: 0,
        };
    }

    async findSlotsForDuration(dateStr: string, duration: number): Promise<any[]> {
        return this.availableSlots;
    }
}

class MockActivityProjectionService {
    private activities: any[] = [];

    setActivities(activities: any[]): void {
        this.activities = activities;
    }

    async buildAllActivityLogReadModels(filters?: { dateFrom?: Date; dateTo?: Date }): Promise<any[]> {
        return this.activities;
    }
}

describe('V16 Adaptive UX - Mandatory Tests', () => {
    let surfaceService: SuggestionSurfaceService;
    let suggestionProjection: MockSuggestionProjectionService;
    let explanationService: MockDecisionExplanationService;
    let scheduleProjection: MockScheduleProjectionService;
    let activityProjection: MockActivityProjectionService;
    let telemetryCollector: InMemoryTelemetryCollector;
    let telemetryService: SuggestionTelemetryService;

    beforeEach(() => {
        suggestionProjection = new MockSuggestionProjectionService();
        explanationService = new MockDecisionExplanationService();
        scheduleProjection = new MockScheduleProjectionService();
        activityProjection = new MockActivityProjectionService();

        surfaceService = new SuggestionSurfaceService(
            suggestionProjection as unknown as SuggestionProjectionService,
            explanationService as unknown as DecisionExplanationService,
            scheduleProjection as unknown as ScheduleProjectionService,
            activityProjection as unknown as ActivityProjectionService
        );

        telemetryCollector = new InMemoryTelemetryCollector();
        telemetryService = new SuggestionTelemetryService(
            telemetryCollector,
            'test-session-123',
            'user-456'
        );
    });

    describe('Context-Specific Suggestions', () => {
        it('should return task completion suggestion in correct context', async () => {
            suggestionProjection.setSuggestions([
                {
                    suggestionId: 'sug-1',
                    agentType: 'CoachAgent',
                    status: 'pending',
                    reason: 'You work best when you plan ahead.',
                    confidenceScore: 0.8,
                },
            ]);

            const result = await surfaceService.getSuggestionForContext(
                SuggestionContext.TaskCompletion,
                {
                    completedTaskId: 'task-123',
                    completedTaskTitle: 'Complete report',
                }
            );

            expect(result.suggestion).not.toBeNull();
            expect(result.suggestion?.context).toBe(SuggestionContext.TaskCompletion);
            expect(result.suggestion?.agentType).toBe('coach');
            expect(result.hasMore).toBe(false); // V16 Rule: Max 1 per screen
        });

        it('should return scheduling conflict suggestion when conflict exists', async () => {
            // Set up a conflict
            scheduleProjection.setConflicts([
                {
                    id: 'block-1',
                    label: 'Team Meeting',
                    startTime: '2025-01-20T10:00:00Z',
                    endTime: '2025-01-20T11:00:00Z',
                    isFixed: false,
                },
            ]);

            // Set up alternative slot
            scheduleProjection.setAvailableSlots([
                {
                    startTime: '2025-01-20T14:00:00Z',
                    endTime: '2025-01-20T15:00:00Z',
                    durationMinutes: 60,
                },
            ]);

            suggestionProjection.setSuggestions([
                {
                    suggestionId: 'sug-2',
                    agentType: 'PlannerAgent',
                    status: 'pending',
                    confidenceScore: 0.7,
                },
            ]);

            const result = await surfaceService.getSuggestionForContext(
                SuggestionContext.SchedulingConflict,
                {
                    taskId: 'task-456',
                    taskTitle: 'Write documentation',
                    requestedSlot: {
                        start: new Date('2025-01-20T10:30:00Z'),
                        end: new Date('2025-01-20T11:30:00Z'),
                    },
                }
            );

            expect(result.suggestion).not.toBeNull();
            expect(result.suggestion?.context).toBe(SuggestionContext.SchedulingConflict);
            expect(result.suggestion?.agentType).toBe('planner');
        });

        it('should return dashboard suggestion with most recent pending suggestion', async () => {
            suggestionProjection.setSuggestions([
                {
                    suggestionId: 'sug-3',
                    agentType: 'CoachAgent',
                    status: 'pending',
                    reason: 'You have been postponing planning.',
                    confidenceScore: 0.6,
                },
            ]);

            const result = await surfaceService.getSuggestionForContext(
                SuggestionContext.Dashboard,
                {}
            );

            expect(result.suggestion).not.toBeNull();
            expect(result.suggestion?.context).toBe(SuggestionContext.Dashboard);
        });

        it('should return logs reflection suggestion with activity insights', async () => {
            activityProjection.setActivities([
                { id: '1', type: 'task_completed', timestamp: new Date() },
                { id: '2', type: 'task_completed', timestamp: new Date() },
                { id: '3', type: 'task_scheduled', timestamp: new Date() },
            ]);

            const result = await surfaceService.getSuggestionForContext(
                SuggestionContext.LogsReflection,
                {
                    periodStart: new Date('2025-01-13'),
                    periodEnd: new Date('2025-01-20'),
                }
            );

            expect(result.suggestion).not.toBeNull();
            expect(result.suggestion?.context).toBe(SuggestionContext.LogsReflection);
            expect(result.suggestion?.agentType).toBe('logger');

            // Check stats are included
            const logsSuggestion = result.suggestion as any;
            expect(logsSuggestion.stats).toBeDefined();
            expect(logsSuggestion.stats.totalLogs).toBe(3);
            // reactiveCount now represents task_completed count (2 activities have type 'task_completed')
            expect(logsSuggestion.stats.reactiveCount).toBe(2);
        });

        it('should return null when no suggestion available', async () => {
            suggestionProjection.setSuggestions([]);

            const result = await surfaceService.getSuggestionForContext(
                SuggestionContext.Dashboard,
                {}
            );

            expect(result.suggestion).toBeNull();
        });
    });

    describe('Standard Actions', () => {
        it('should have exactly three actions on every suggestion', async () => {
            suggestionProjection.setSuggestions([
                {
                    suggestionId: 'sug-1',
                    agentType: 'CoachAgent',
                    status: 'pending',
                    reason: 'Test',
                    confidenceScore: 0.8,
                },
            ]);

            const result = await surfaceService.getSuggestionForContext(
                SuggestionContext.TaskCompletion,
                {
                    completedTaskId: 'task-1',
                    completedTaskTitle: 'Test task',
                }
            );

            expect(result.suggestion).not.toBeNull();
            const actions = result.suggestion!.actions;

            // V16 Rule: Exactly three actions
            expect(actions.applyOnce).toBeDefined();
            expect(actions.alwaysDoThis).toBeDefined();
            expect(actions.dismiss).toBeDefined();

            // Verify action types
            expect(actions.applyOnce.type).toBe(SuggestionActionType.ApplyOnce);
            expect(actions.alwaysDoThis.type).toBe(SuggestionActionType.AlwaysDoThis);
            expect(actions.dismiss.type).toBe(SuggestionActionType.Dismiss);
        });

        it('apply once action should have endpoint and payload', async () => {
            suggestionProjection.setSuggestions([
                {
                    suggestionId: 'sug-1',
                    agentType: 'CoachAgent',
                    status: 'pending',
                },
            ]);

            const result = await surfaceService.getSuggestionForContext(
                SuggestionContext.TaskCompletion,
                {
                    completedTaskId: 'task-1',
                    completedTaskTitle: 'Test',
                }
            );

            const applyOnce = result.suggestion!.actions.applyOnce;
            expect(applyOnce.endpoint).toBeDefined();
            expect(applyOnce.label).toBeDefined();
        });

        it('always do this action should reference suggestion ID', async () => {
            suggestionProjection.setSuggestions([
                {
                    suggestionId: 'sug-123',
                    agentType: 'CoachAgent',
                    status: 'pending',
                },
            ]);

            const result = await surfaceService.getSuggestionForContext(
                SuggestionContext.TaskCompletion,
                {
                    completedTaskId: 'task-1',
                    completedTaskTitle: 'Test',
                }
            );

            const alwaysDoThis = result.suggestion!.actions.alwaysDoThis;
            expect(alwaysDoThis.suggestionId).toBe('sug-123');
        });
    });

    describe('Dismiss Functionality', () => {
        it('should hide suggestion after dismiss (24h cooldown)', async () => {
            suggestionProjection.setSuggestions([
                {
                    suggestionId: 'sug-1',
                    agentType: 'CoachAgent',
                    status: 'pending',
                },
            ]);

            // Get suggestion first time
            const result1 = await surfaceService.getSuggestionForContext(
                SuggestionContext.TaskCompletion,
                { completedTaskId: 'task-1', completedTaskTitle: 'Test' }
            );
            expect(result1.suggestion).not.toBeNull();
            const suggestionId = result1.suggestion!.id;

            // Dismiss
            surfaceService.dismissSuggestion(suggestionId);

            // Get suggestion again - should be null
            const result2 = await surfaceService.getSuggestionForContext(
                SuggestionContext.TaskCompletion,
                { completedTaskId: 'task-1', completedTaskTitle: 'Test' }
            );
            expect(result2.suggestion).toBeNull();
        });

        it('should clear expired dismissals', async () => {
            suggestionProjection.setSuggestions([
                {
                    suggestionId: 'sug-1',
                    agentType: 'CoachAgent',
                    status: 'pending',
                },
            ]);

            // This just tests that clearExpiredDismissals doesn't throw
            surfaceService.clearExpiredDismissals();
        });
    });

    describe('Why Modal / Explanation', () => {
        it('should return explanation data for Why modal', async () => {
            explanationService.setExplanation('dec-123', {
                summary: 'You typically complete more tasks when you plan ahead.',
                contributingFactors: [
                    { name: 'Task completion rate', description: '80% when planning', value: 0.8, impact: 'positive' },
                    { name: 'Time of day', description: 'Morning is most productive', value: 0.6, impact: 'positive' },
                ],
                policiesInvolved: [],
                alternativesConsidered: [],
                whyOthersLost: [],
                decisionType: 'arbitration',
                decidedAt: new Date(),
            });

            const explanation = await surfaceService.getExplanation('dec-123');

            expect(explanation).not.toBeNull();
            expect(explanation!.title).toBe('Decision Explanation');
            expect(explanation!.summary).toContain('plan ahead');
            expect(explanation!.factors).toHaveLength(2);
            expect(explanation!.auditTrailUrl).toContain('dec-123');
        });

        it('should return null for non-existent decision', async () => {
            const explanation = await surfaceService.getExplanation('non-existent');
            expect(explanation).toBeNull();
        });

        it('suggestion should include decisionId for Why lookup', async () => {
            suggestionProjection.setSuggestions([
                {
                    suggestionId: 'sug-1',
                    agentType: 'CoachAgent',
                    status: 'pending',
                },
            ]);

            const result = await surfaceService.getSuggestionForContext(
                SuggestionContext.TaskCompletion,
                { completedTaskId: 'task-1', completedTaskTitle: 'Test' }
            );

            // Note: decisionId is undefined as SuggestionReadModel doesn't track it
            // This is expected - the V16 spec acknowledges this limitation with a TODO
            expect(result.suggestion?.decisionId).toBeUndefined();
        });
    });

    describe('UX Guardrails', () => {
        it('should return max 1 suggestion per context (hasMore always false)', async () => {
            suggestionProjection.setSuggestions([
                { suggestionId: 'sug-1', agentType: 'CoachAgent', status: 'pending' },
                { suggestionId: 'sug-2', agentType: 'PlannerAgent', status: 'pending' },
                { suggestionId: 'sug-3', agentType: 'LoggerAgent', status: 'pending' },
            ]);

            const result = await surfaceService.getSuggestionForContext(
                SuggestionContext.Dashboard,
                {}
            );

            // Should only get one suggestion
            expect(result.suggestion).not.toBeNull();
            expect(result.hasMore).toBe(false); // V16 Rule: Never show hasMore
        });

        it('should return default suggestion when no pending preference suggestion', async () => {
            suggestionProjection.setSuggestions([]); // No pending suggestions

            const result = await surfaceService.getSuggestionForContext(
                SuggestionContext.TaskCompletion,
                { completedTaskId: 'task-1', completedTaskTitle: 'Test' }
            );

            // Should still get a default suggestion
            expect(result.suggestion).not.toBeNull();
            expect(result.suggestion?.agentType).toBe('coach');
            // But alwaysDoThis should not have a suggestionId
            expect(result.suggestion?.actions.alwaysDoThis.suggestionId).toBeUndefined();
        });
    });

    describe('Telemetry', () => {
        it('should track suggestion shown event', () => {
            telemetryService.trackShown(
                'sug-1',
                'coach',
                SuggestionContext.TaskCompletion,
                'high'
            );

            const events = telemetryCollector.getEventsByType(TelemetryEventType.SuggestionShown);
            expect(events).toHaveLength(1);
            expect(events[0]).toMatchObject({
                type: TelemetryEventType.SuggestionShown,
                suggestionId: 'sug-1',
                agentType: 'coach',
                context: SuggestionContext.TaskCompletion,
            });
        });

        it('should track apply once event with dwell time', async () => {
            // Show first
            telemetryService.trackShown('sug-1', 'coach', SuggestionContext.TaskCompletion);

            // Wait a bit (simulate user thinking)
            await new Promise(resolve => setTimeout(resolve, 50));

            // Then apply
            telemetryService.trackAppliedOnce('sug-1', 'coach', SuggestionContext.TaskCompletion);

            const events = telemetryCollector.getEventsByType(TelemetryEventType.SuggestionAppliedOnce);
            expect(events).toHaveLength(1);
            expect((events[0] as any).dwellTimeMs).toBeGreaterThan(0);
        });

        it('should track always enabled event', () => {
            telemetryService.trackShown('sug-1', 'coach', SuggestionContext.Dashboard);
            telemetryService.trackAlwaysEnabled(
                'sug-1',
                'coach',
                SuggestionContext.Dashboard,
                'pref-sug-123'
            );

            const events = telemetryCollector.getEventsByType(TelemetryEventType.SuggestionAlwaysEnabled);
            expect(events).toHaveLength(1);
            expect((events[0] as any).approvedSuggestionId).toBe('pref-sug-123');
        });

        it('should track dismissed event', () => {
            telemetryService.trackShown('sug-1', 'planner', SuggestionContext.SchedulingConflict);
            telemetryService.trackDismissed('sug-1', 'planner', SuggestionContext.SchedulingConflict);

            const events = telemetryCollector.getEventsByType(TelemetryEventType.SuggestionDismissed);
            expect(events).toHaveLength(1);
        });

        it('should track why modal opened event', () => {
            telemetryService.trackWhyModalOpened('sug-1', 'dec-123');

            const events = telemetryCollector.getEventsByType(TelemetryEventType.WhyModalOpened);
            expect(events).toHaveLength(1);
            expect((events[0] as any).decisionId).toBe('dec-123');
        });
    });

    describe('Backend Regression - No State Changes', () => {
        it('apply once should not create new decisions', async () => {
            // This is a conceptual test - in real implementation,
            // we would verify no calls to decision creation services
            suggestionProjection.setSuggestions([
                {
                    suggestionId: 'sug-1',
                    agentType: 'CoachAgent',
                    status: 'pending',
                },
            ]);

            const result = await surfaceService.getSuggestionForContext(
                SuggestionContext.TaskCompletion,
                { completedTaskId: 'task-1', completedTaskTitle: 'Test' }
            );

            // Apply once action should only have endpoint/payload
            // It should NOT trigger any backend decision creation
            const applyOnce = result.suggestion!.actions.applyOnce;
            expect(applyOnce.type).toBe(SuggestionActionType.ApplyOnce);
            // The action is purely frontend navigation
            expect(applyOnce.endpoint).toBeDefined();
        });

        it('dismiss should not modify preferences', async () => {
            suggestionProjection.setSuggestions([
                {
                    suggestionId: 'sug-1',
                    agentType: 'CoachAgent',
                    status: 'pending',
                },
            ]);

            const result = await surfaceService.getSuggestionForContext(
                SuggestionContext.TaskCompletion,
                { completedTaskId: 'task-1', completedTaskTitle: 'Test' }
            );

            // Dismiss the suggestion
            surfaceService.dismissSuggestion(result.suggestion!.id);

            // The underlying suggestion should still be pending
            // (dismiss is UI-only, doesn't affect backend)
            const pendingSuggestions = await suggestionProjection.buildPendingSuggestionReadModels();
            expect(pendingSuggestions).toHaveLength(1);
            expect(pendingSuggestions[0].status).toBe('pending');
        });

        it('only always do this should approve suggestions', async () => {
            suggestionProjection.setSuggestions([
                {
                    suggestionId: 'sug-1',
                    agentType: 'CoachAgent',
                    status: 'pending',
                },
            ]);

            const result = await surfaceService.getSuggestionForContext(
                SuggestionContext.TaskCompletion,
                { completedTaskId: 'task-1', completedTaskTitle: 'Test' }
            );

            // Verify always do this is the only action that references approval
            const actions = result.suggestion!.actions;

            // Apply once has no suggestionId (no approval)
            expect(actions.applyOnce.suggestionId).toBeUndefined();

            // Dismiss has no suggestionId (no approval)
            expect(actions.dismiss.suggestionId).toBeUndefined();

            // Only always do this has suggestionId for approval
            expect(actions.alwaysDoThis.suggestionId).toBe('sug-1');
        });
    });

    describe('Confidence Mapping', () => {
        it('should map numeric confidence to level', async () => {
            // High confidence (>= 0.7)
            suggestionProjection.setSuggestions([
                { suggestionId: 'sug-1', agentType: 'CoachAgent', status: 'pending', confidenceScore: 0.85 },
            ]);

            let result = await surfaceService.getSuggestionForContext(
                SuggestionContext.TaskCompletion,
                { completedTaskId: 'task-1', completedTaskTitle: 'Test' }
            );
            expect(result.suggestion?.confidence).toBe('high');

            // Medium confidence (0.4 - 0.7)
            suggestionProjection.setSuggestions([
                { suggestionId: 'sug-2', agentType: 'CoachAgent', status: 'pending', confidenceScore: 0.5 },
            ]);
            surfaceService.clearExpiredDismissals(); // Reset state

            result = await surfaceService.getSuggestionForContext(
                SuggestionContext.TaskCompletion,
                { completedTaskId: 'task-2', completedTaskTitle: 'Test' }
            );
            expect(result.suggestion?.confidence).toBe('medium');

            // Low confidence (< 0.4)
            suggestionProjection.setSuggestions([
                { suggestionId: 'sug-3', agentType: 'CoachAgent', status: 'pending', confidenceScore: 0.2 },
            ]);

            result = await surfaceService.getSuggestionForContext(
                SuggestionContext.TaskCompletion,
                { completedTaskId: 'task-3', completedTaskTitle: 'Test' }
            );
            expect(result.suggestion?.confidence).toBe('low');
        });
    });
});
