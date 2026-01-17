/**
 * AgentCoordinationService - Coordinates agent actions to prevent conflicts.
 *
 * Responsibilities:
 * - Accept proposed actions from agents
 * - Detect conflicts between concurrent actions
 * - Resolve conflicts based on priority and policies
 * - Track pending actions per aggregate
 *
 * This service implements window-based coordination where actions within
 * a short time window are batched and checked for conflicts.
 */

import { ProposedAction, ProposedActionType } from '../../domain/events/AgentActionProposed.js';
import { ConflictDetails, ConflictType } from '../../domain/events/AgentConflictDetected.js';
import { IdGenerator } from '../../shared/utils/IdGenerator.js';
import { IObservabilityContext, MetricNames } from '../ports/IObservabilityContext.js';

/**
 * Status of a pending action.
 */
export type ActionStatus = 'pending' | 'approved' | 'rejected' | 'conflict';

/**
 * A pending action awaiting coordination.
 */
export interface PendingAction {
    id: string;
    agentName: string;
    proposedAction: ProposedAction;
    timestamp: Date;
    sourceEventId: string;
    status: ActionStatus;
    conflictId?: string;
}

/**
 * Result of proposing an action.
 */
export interface ProposeResult {
    proposalId: string;
    status: ActionStatus;
    conflictDetails?: ConflictDetails;
}

/**
 * Callback for when an action is approved.
 */
export type ActionApprovedCallback = (action: PendingAction) => Promise<void>;

/**
 * AgentCoordinationService - Coordinates agent actions.
 */
export class AgentCoordinationService {
    private pendingActions: Map<string, PendingAction> = new Map();
    private aggregateActions: Map<string, Set<string>> = new Map(); // aggregateId -> proposalIds
    private coordinationWindowMs: number;
    private onActionApproved?: ActionApprovedCallback;
    private observability?: IObservabilityContext;

    constructor(
        coordinationWindowMs: number = 100,
        observability?: IObservabilityContext
    ) {
        this.coordinationWindowMs = coordinationWindowMs;
        this.observability = observability;
    }

    /**
     * Set callback for when actions are approved.
     */
    setOnActionApproved(callback: ActionApprovedCallback): void {
        this.onActionApproved = callback;
    }

    /**
     * Set the coordination window (time to wait for conflicting actions).
     */
    setCoordinationWindow(windowMs: number): void {
        this.coordinationWindowMs = windowMs;
    }

    /**
     * Propose an action for coordination.
     *
     * The action will be queued and checked for conflicts with other
     * pending actions on the same aggregate.
     */
    async proposeAction(
        agentName: string,
        action: ProposedAction,
        sourceEventId: string
    ): Promise<ProposeResult> {
        const proposalId = IdGenerator.generate();
        const timestamp = new Date();

        const pendingAction: PendingAction = {
            id: proposalId,
            agentName,
            proposedAction: action,
            timestamp,
            sourceEventId,
            status: 'pending',
        };

        // Store the pending action
        this.pendingActions.set(proposalId, pendingAction);

        // Track by aggregate
        const aggregateId = action.targetAggregateId;
        if (!this.aggregateActions.has(aggregateId)) {
            this.aggregateActions.set(aggregateId, new Set());
        }
        this.aggregateActions.get(aggregateId)!.add(proposalId);

        this.observability?.metrics.incrementCounter(MetricNames.PROPOSED_ACTIONS_TOTAL, 1, { agent: agentName });

        // Check for conflicts
        const conflict = this.detectConflict(proposalId);
        if (conflict) {
            pendingAction.status = 'conflict';
            pendingAction.conflictId = conflict.conflictId;
            this.observability?.metrics.incrementCounter(MetricNames.CONFLICTS_DETECTED_TOTAL, 1);
            this.observability?.logger.warn('Agent action conflict detected', {
                agentName,
                aggregateId,
                conflictType: conflict.conflict.conflictType,
            });
            return { proposalId, status: 'conflict', conflictDetails: conflict.conflict };
        }

        // No immediate conflict - schedule approval after coordination window
        setTimeout(() => this.processAction(proposalId), this.coordinationWindowMs);

        return { proposalId, status: 'pending' };
    }

    /**
     * Get pending actions for an aggregate.
     */
    getPendingActionsForAggregate(aggregateId: string): PendingAction[] {
        const actionIds = this.aggregateActions.get(aggregateId);
        if (!actionIds) return [];

        return Array.from(actionIds)
            .map(id => this.pendingActions.get(id))
            .filter((a): a is PendingAction => a !== undefined && a.status === 'pending');
    }

    /**
     * Get all pending actions.
     */
    getAllPendingActions(): PendingAction[] {
        return Array.from(this.pendingActions.values())
            .filter(a => a.status === 'pending');
    }

    /**
     * Get action by ID.
     */
    getAction(proposalId: string): PendingAction | undefined {
        return this.pendingActions.get(proposalId);
    }

    /**
     * Manually approve an action (for conflict resolution).
     */
    async approveAction(proposalId: string): Promise<void> {
        const action = this.pendingActions.get(proposalId);
        if (!action) return;

        action.status = 'approved';

        if (this.onActionApproved) {
            await this.onActionApproved(action);
        }

        // Clean up other pending actions for same aggregate
        this.rejectOtherActions(action.proposedAction.targetAggregateId, proposalId);
    }

    /**
     * Manually reject an action.
     */
    rejectAction(proposalId: string, reason?: string): void {
        const action = this.pendingActions.get(proposalId);
        if (!action) return;

        action.status = 'rejected';
        this.observability?.logger.info('Action rejected', {
            proposalId,
            agentName: action.agentName,
            reason,
        });
    }

    /**
     * Clear all pending actions (for testing).
     */
    clear(): void {
        this.pendingActions.clear();
        this.aggregateActions.clear();
    }

    /**
     * Detect conflicts for a proposed action.
     */
    private detectConflict(proposalId: string): { conflictId: string; conflict: ConflictDetails } | null {
        const action = this.pendingActions.get(proposalId);
        if (!action) return null;

        const aggregateId = action.proposedAction.targetAggregateId;
        const otherActionIds = this.aggregateActions.get(aggregateId);
        if (!otherActionIds || otherActionIds.size <= 1) return null;

        // Get other pending actions for same aggregate
        const otherActions = Array.from(otherActionIds)
            .filter(id => id !== proposalId)
            .map(id => this.pendingActions.get(id))
            .filter((a): a is PendingAction => a !== undefined && a.status === 'pending');

        if (otherActions.length === 0) return null;

        // Determine conflict type
        const conflictType = this.determineConflictType(action, otherActions);
        if (!conflictType) return null;

        const conflictId = IdGenerator.generate();
        const allActions = [action, ...otherActions];

        return {
            conflictId,
            conflict: {
                conflictingAgents: [...new Set(allActions.map(a => a.agentName))],
                targetAggregateId: aggregateId,
                targetAggregateType: action.proposedAction.targetAggregateType,
                conflictType,
                proposedActions: allActions.map(a => ({
                    proposalId: a.id,
                    agentName: a.agentName,
                    action: a.proposedAction,
                    timestamp: a.timestamp,
                })),
            },
        };
    }

    /**
     * Determine the type of conflict between actions.
     */
    private determineConflictType(
        action: PendingAction,
        otherActions: PendingAction[]
    ): ConflictType | null {
        const actionType = action.proposedAction.type;

        // Check for concurrent modifications
        const modificationTypes: ProposedActionType[] = ['update_goal', 'reschedule', 'create_task'];
        if (modificationTypes.includes(actionType)) {
            for (const other of otherActions) {
                if (modificationTypes.includes(other.proposedAction.type)) {
                    return 'concurrent_modification';
                }
            }
        }

        // Check for contradicting advice
        if (actionType === 'suggestion') {
            for (const other of otherActions) {
                if (other.proposedAction.type === 'suggestion' && other.agentName !== action.agentName) {
                    return 'contradicting_advice';
                }
            }
        }

        // Check for resource contention (same action type from different agents)
        for (const other of otherActions) {
            if (other.proposedAction.type === actionType && other.agentName !== action.agentName) {
                return 'resource_contention';
            }
        }

        return null;
    }

    /**
     * Process an action after the coordination window.
     */
    private async processAction(proposalId: string): Promise<void> {
        const action = this.pendingActions.get(proposalId);
        if (!action || action.status !== 'pending') return;

        // Re-check for conflicts
        const conflict = this.detectConflict(proposalId);
        if (conflict) {
            action.status = 'conflict';
            action.conflictId = conflict.conflictId;
            return;
        }

        // Approve the action
        action.status = 'approved';
        this.observability?.logger.info('Action approved', {
            proposalId,
            agentName: action.agentName,
            actionType: action.proposedAction.type,
        });

        if (this.onActionApproved) {
            try {
                await this.onActionApproved(action);
            } catch (error) {
                this.observability?.logger.error('Error executing approved action', error as Error, {
                    proposalId,
                });
            }
        }
    }

    /**
     * Reject other pending actions for the same aggregate.
     */
    private rejectOtherActions(aggregateId: string, exceptProposalId: string): void {
        const actionIds = this.aggregateActions.get(aggregateId);
        if (!actionIds) return;

        for (const id of actionIds) {
            if (id !== exceptProposalId) {
                const action = this.pendingActions.get(id);
                if (action && action.status === 'pending') {
                    action.status = 'rejected';
                }
            }
        }
    }
}
