/**
 * DebugController.ts - Manual Agent Trigger Endpoints
 *
 * TODO: REMOVE BEFORE PRODUCTION
 * This controller provides debug endpoints to manually trigger agent actions
 * for testing purposes. These endpoints bypass normal event flows.
 *
 * TODO: Replace with proper integration tests
 * TODO: Add feature flag to disable in production
 * TODO: Consider moving to a separate debug server
 */

import { IncomingMessage, ServerResponse } from 'http';
import { IEventDispatcher } from '../../application/ports/IEventDispatcher.js';
import { GoalCompleted } from '../../domain/events/GoalCompleted.js';
import { ScheduleConflictDetected } from '../../domain/events/ScheduleConflictDetected.js';
import { GoalCreated } from '../../domain/events/GoalCreated.js';
import { IGoalRepository } from '../../application/ports/IGoalRepository.js';
import { ITaskRepository } from '../../application/ports/ITaskRepository.js';
import { SuggestionProjectionService } from '../../application/projections/SuggestionProjectionService.js';
import { SuggestionReadModel } from '../../application/read-models/SuggestionReadModel.js';
import { Facet } from '../../domain/enums/Facet.js';
import { DifficultyProfile } from '../../domain/enums/DifficultyProfile.js';
import { IGoal } from '../../domain/entities/Goal.js';
import { TimeRange } from '../../domain/value-objects/TimeRange.js';

/**
 * TODO: This is a temporary debug controller - remove before production deployment
 */
export class DebugController {
    constructor(
        private readonly eventDispatcher: IEventDispatcher,
        private readonly goalRepository: IGoalRepository,
        private readonly taskRepository: ITaskRepository,
        private readonly suggestionProjection: SuggestionProjectionService
    ) {}

    /**
     * POST /debug/trigger/coach
     * Manually triggers the CoachAgent by emitting a GoalCompleted event.
     *
     * TODO: Remove this endpoint - for testing only
     */
    async triggerCoach(req: IncomingMessage, res: ServerResponse): Promise<void> {
        try {
            const body = await this.parseBody(req);
            const goalId = body.goalId as string | undefined;

            let goal: IGoal;
            if (goalId) {
                const foundGoal = await this.goalRepository.findById(goalId);
                if (!foundGoal) {
                    this.sendError(res, 404, 'Goal not found');
                    return;
                }
                goal = foundGoal;
            } else {
                // TODO: Don't create fake goals in production
                // Create a mock goal for testing
                goal = {
                    id: `debug-goal-${Date.now()}`,
                    title: (body.title as string) || 'Debug Test Goal',
                    description: 'Created by debug trigger',
                    facet: (body.facet as Facet) || Facet.Career,
                    difficulty: (body.difficulty as DifficultyProfile) || DifficultyProfile.Medium,
                    coachAgentId: 'CoachAgent',
                    isCompleted: true,
                    subGoalIds: [],
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };
            }

            // Dispatch GoalCompleted event to trigger CoachAgent
            const event = new GoalCompleted(goal.id);
            await this.eventDispatcher.dispatch(event);

            // Wait a moment for async handlers
            await new Promise(resolve => setTimeout(resolve, 100));

            // Check for new suggestions
            const suggestions = await this.suggestionProjection.buildAllSuggestionReadModels();
            const coachSuggestions = suggestions.filter((s: SuggestionReadModel) =>
                s.agentType === 'CoachAgent'
            );

            this.sendJson(res, 200, {
                success: true,
                message: 'CoachAgent triggered via GoalCompleted event',
                eventDispatched: 'GoalCompleted',
                goalId: goal.id,
                // TODO: Remove detailed debug info in production
                debug: {
                    totalSuggestions: suggestions.length,
                    coachSuggestions: coachSuggestions.length,
                    latestCoachSuggestion: coachSuggestions[0] || null,
                },
            });
        } catch (error) {
            this.sendError(res, 500, `Failed to trigger coach: ${error}`);
        }
    }

    /**
     * POST /debug/trigger/planner
     * Manually triggers the PlannerAgent by emitting a ScheduleConflictDetected event.
     *
     * TODO: Remove this endpoint - for testing only
     */
    async triggerPlanner(req: IncomingMessage, res: ServerResponse): Promise<void> {
        try {
            const body = await this.parseBody(req);

            // TODO: Don't create fake conflicts in production
            const taskId = (body.taskId as string) || `debug-task-${Date.now()}`;
            const slotStart = body.slotStart ? new Date(body.slotStart as string) : new Date();
            const slotEnd = body.slotEnd
                ? new Date(body.slotEnd as string)
                : new Date(slotStart.getTime() + 3600000); // 1 hour later
            const conflictingBlockId = (body.conflictingBlockId as string) || 'block-1';

            // Dispatch ScheduleConflictDetected event to trigger PlannerAgent
            const timeRange = new TimeRange(slotStart, slotEnd);
            const event = new ScheduleConflictDetected(taskId, timeRange, conflictingBlockId);
            await this.eventDispatcher.dispatch(event);

            // Wait a moment for async handlers
            await new Promise(resolve => setTimeout(resolve, 100));

            // Check for new suggestions
            const suggestions = await this.suggestionProjection.buildAllSuggestionReadModels();
            const plannerSuggestions = suggestions.filter((s: SuggestionReadModel) =>
                s.agentType === 'PlannerAgent'
            );

            this.sendJson(res, 200, {
                success: true,
                message: 'PlannerAgent triggered via ScheduleConflictDetected event',
                eventDispatched: 'ScheduleConflictDetected',
                taskId,
                conflictingBlockId,
                // TODO: Remove detailed debug info in production
                debug: {
                    totalSuggestions: suggestions.length,
                    plannerSuggestions: plannerSuggestions.length,
                    latestPlannerSuggestion: plannerSuggestions[0] || null,
                },
            });
        } catch (error) {
            this.sendError(res, 500, `Failed to trigger planner: ${error}`);
        }
    }

    /**
     * POST /debug/trigger/logger
     * Manually triggers the LoggerAgent by emitting a GoalCreated event.
     *
     * TODO: Remove this endpoint - for testing only
     */
    async triggerLogger(req: IncomingMessage, res: ServerResponse): Promise<void> {
        try {
            const body = await this.parseBody(req);

            // TODO: Don't create fake goals in production
            const goal: IGoal = {
                id: `debug-goal-${Date.now()}`,
                title: (body.title as string) || 'Debug Logger Test Goal',
                description: 'Created by debug trigger for logger',
                facet: (body.facet as Facet) || Facet.Education,
                difficulty: (body.difficulty as DifficultyProfile) || DifficultyProfile.Easy,
                coachAgentId: 'CoachAgent',
                isCompleted: false,
                subGoalIds: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            // Dispatch GoalCreated event to trigger LoggerAgent
            const event = new GoalCreated(goal);
            await this.eventDispatcher.dispatch(event);

            this.sendJson(res, 200, {
                success: true,
                message: 'LoggerAgent triggered via GoalCreated event',
                eventDispatched: 'GoalCreated',
                goalId: goal.id,
                // TODO: Remove detailed debug info in production
                debug: {
                    note: 'LoggerAgent logs events but does not create suggestions',
                },
            });
        } catch (error) {
            this.sendError(res, 500, `Failed to trigger logger: ${error}`);
        }
    }

    /**
     * GET /debug/suggestions
     * Lists all suggestions from all agents.
     *
     * TODO: Remove this endpoint - use /admin/suggestions instead
     */
    async listSuggestions(req: IncomingMessage, res: ServerResponse): Promise<void> {
        try {
            const suggestions = await this.suggestionProjection.buildAllSuggestionReadModels();

            const byAgent = {
                CoachAgent: suggestions.filter((s: SuggestionReadModel) => s.agentType === 'CoachAgent'),
                PlannerAgent: suggestions.filter((s: SuggestionReadModel) => s.agentType === 'PlannerAgent'),
                LoggerAgent: suggestions.filter((s: SuggestionReadModel) => s.agentType === 'LoggerAgent'),
                Other: suggestions.filter((s: SuggestionReadModel) =>
                    !['CoachAgent', 'PlannerAgent', 'LoggerAgent'].includes(s.agentType)
                ),
            };

            this.sendJson(res, 200, {
                total: suggestions.length,
                byAgent: {
                    CoachAgent: byAgent.CoachAgent.length,
                    PlannerAgent: byAgent.PlannerAgent.length,
                    LoggerAgent: byAgent.LoggerAgent.length,
                    Other: byAgent.Other.length,
                },
                suggestions,
            });
        } catch (error) {
            this.sendError(res, 500, `Failed to list suggestions: ${error}`);
        }
    }

    /**
     * GET /debug/status
     * Returns debug status and agent health check.
     *
     * TODO: Remove this endpoint - for testing only
     */
    async getStatus(req: IncomingMessage, res: ServerResponse): Promise<void> {
        this.sendJson(res, 200, {
            status: 'debug_mode_active',
            warning: 'TODO: Debug endpoints should be disabled in production',
            endpoints: [
                'POST /debug/trigger/coach - Trigger CoachAgent',
                'POST /debug/trigger/planner - Trigger PlannerAgent',
                'POST /debug/trigger/logger - Trigger LoggerAgent',
                'GET /debug/suggestions - List all suggestions',
                'GET /debug/status - This endpoint',
            ],
            timestamp: new Date().toISOString(),
        });
    }

    private parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    resolve(body ? JSON.parse(body) : {});
                } catch {
                    resolve({});
                }
            });
            req.on('error', reject);
        });
    }

    private sendJson(res: ServerResponse, status: number, data: unknown): void {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data, null, 2));
    }

    private sendError(res: ServerResponse, status: number, message: string): void {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: message }));
    }
}
