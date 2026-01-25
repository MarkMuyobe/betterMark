/**
 * ProductSuggestionsController.ts - V16 Suggestion Surface Endpoints
 *
 * Exposes suggestion surfaces for frontend consumption.
 * No new backend logic - purely orchestration.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { SuggestionSurfaceService, SuggestionContextData } from '../../../application/services/SuggestionSurfaceService.js';
import { SuggestionContext, SuggestionActionType } from '../../../application/read-models/SuggestionSurfaceReadModel.js';
import { SuggestionApprovalService } from '../../../application/services/SuggestionApprovalService.js';
import { parseQueryString } from '../../../shared/types/Pagination.js';

/**
 * Route params for controller methods.
 */
interface RouteParams {
    params: Record<string, string>;
    query: Record<string, string>;
}

/**
 * Controller for V16 suggestion surface endpoints.
 */
export class ProductSuggestionsController {
    constructor(
        private readonly surfaceService: SuggestionSurfaceService,
        private readonly approvalService: SuggestionApprovalService
    ) {}

    /**
     * GET /app/suggestions/surface/:context
     * Get suggestion for a specific UI context.
     */
    async getSuggestionForContext(
        req: IncomingMessage,
        res: ServerResponse,
        { params, query }: RouteParams
    ): Promise<void> {
        try {
            const contextStr = params.context;
            const context = this.parseContext(contextStr);

            if (!context) {
                this.sendError(res, 400, 'Invalid context');
                return;
            }

            // Build context data from query params
            const contextData: SuggestionContextData = {
                completedTaskId: query.completedTaskId,
                completedTaskTitle: query.completedTaskTitle,
                taskId: query.taskId,
                taskTitle: query.taskTitle,
                requestedSlot: query.slotStart && query.slotEnd ? {
                    start: new Date(query.slotStart),
                    end: new Date(query.slotEnd),
                } : undefined,
                periodStart: query.periodStart ? new Date(query.periodStart) : undefined,
                periodEnd: query.periodEnd ? new Date(query.periodEnd) : undefined,
            };

            const result = await this.surfaceService.getSuggestionForContext(context, contextData);

            this.sendJson(res, 200, result);
        } catch (error) {
            this.sendError(res, 500, 'Failed to get suggestion');
        }
    }

    /**
     * GET /app/suggestions/explanation/:decisionId
     * Get explanation for "Why?" modal.
     */
    async getExplanation(
        req: IncomingMessage,
        res: ServerResponse,
        { params }: RouteParams
    ): Promise<void> {
        try {
            const { decisionId } = params;

            if (!decisionId) {
                this.sendError(res, 400, 'Decision ID required');
                return;
            }

            const explanation = await this.surfaceService.getExplanation(decisionId);

            if (!explanation) {
                this.sendError(res, 404, 'Explanation not found');
                return;
            }

            this.sendJson(res, 200, explanation);
        } catch (error) {
            this.sendError(res, 500, 'Failed to get explanation');
        }
    }

    /**
     * POST /app/suggestions/:suggestionId/action
     * Execute a suggestion action.
     */
    async executeAction(
        req: IncomingMessage,
        res: ServerResponse,
        { params }: RouteParams
    ): Promise<void> {
        try {
            const { suggestionId } = params;
            const body = await this.parseBody(req);
            const actionType = body.actionType as SuggestionActionType;

            if (!suggestionId || !actionType) {
                this.sendError(res, 400, 'Suggestion ID and action type required');
                return;
            }

            switch (actionType) {
                case SuggestionActionType.ApplyOnce:
                    // Apply once: No backend state change
                    // Just acknowledge the action - frontend handles the mutation
                    this.sendJson(res, 200, {
                        success: true,
                        actionType,
                        message: 'Action acknowledged. Frontend should execute the endpoint.',
                        endpoint: body.endpoint,
                        payload: body.payload,
                    });
                    break;

                case SuggestionActionType.AlwaysDoThis:
                    // Always do this: Approve the underlying suggestion
                    if (body.underlyingSuggestionId) {
                        await this.approvalService.approve(body.underlyingSuggestionId);
                        this.sendJson(res, 200, {
                            success: true,
                            actionType,
                            message: 'Preference suggestion approved.',
                            approvedSuggestionId: body.underlyingSuggestionId,
                        });
                    } else {
                        // No underlying suggestion - return confirmation prompt
                        this.sendJson(res, 200, {
                            success: true,
                            actionType,
                            requiresConfirmation: true,
                            message: 'This will update your preferences. You can undo this later.',
                        });
                    }
                    break;

                case SuggestionActionType.Dismiss:
                    // Dismiss: Mark as dismissed (24h cooldown)
                    this.surfaceService.dismissSuggestion(suggestionId);
                    this.sendJson(res, 200, {
                        success: true,
                        actionType,
                        message: 'Suggestion dismissed.',
                    });
                    break;

                default:
                    this.sendError(res, 400, 'Invalid action type');
            }
        } catch (error) {
            this.sendError(res, 500, 'Failed to execute action');
        }
    }

    /**
     * POST /app/suggestions/dismiss
     * Dismiss a suggestion (24h cooldown).
     */
    async dismiss(
        req: IncomingMessage,
        res: ServerResponse
    ): Promise<void> {
        try {
            const body = await this.parseBody(req);
            const { suggestionId } = body;

            if (!suggestionId) {
                this.sendError(res, 400, 'Suggestion ID required');
                return;
            }

            this.surfaceService.dismissSuggestion(suggestionId);

            this.sendJson(res, 200, {
                success: true,
                message: 'Suggestion dismissed for 24 hours.',
            });
        } catch (error) {
            this.sendError(res, 500, 'Failed to dismiss suggestion');
        }
    }

    /**
     * Parse context string to enum.
     */
    private parseContext(contextStr: string): SuggestionContext | null {
        const mapping: Record<string, SuggestionContext> = {
            'task_completion': SuggestionContext.TaskCompletion,
            'task-completion': SuggestionContext.TaskCompletion,
            'scheduling_conflict': SuggestionContext.SchedulingConflict,
            'scheduling-conflict': SuggestionContext.SchedulingConflict,
            'dashboard': SuggestionContext.Dashboard,
            'logs_reflection': SuggestionContext.LogsReflection,
            'logs-reflection': SuggestionContext.LogsReflection,
        };
        return mapping[contextStr.toLowerCase()] || null;
    }

    /**
     * Parse request body as JSON.
     */
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

    /**
     * Send JSON response.
     */
    private sendJson(res: ServerResponse, status: number, data: unknown): void {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
    }

    /**
     * Send error response.
     */
    private sendError(res: ServerResponse, status: number, message: string): void {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: message }));
    }
}
