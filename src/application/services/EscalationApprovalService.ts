/**
 * EscalationApprovalService - V12 approval gateway for escalated decisions.
 *
 * Controlled mutation for approving/rejecting escalated arbitration decisions.
 * Rules:
 * - Required for high-risk or vetoed actions
 * - No implicit execution
 * - Emits domain events
 */

import { IArbitrationDecisionRepository } from '../ports/IArbitrationDecisionRepository.js';
import { IAgentProposalRepository } from '../ports/IAgentProposalRepository.js';
import { IEventDispatcher } from '../ports/IEventDispatcher.js';
import { IObservabilityContext } from '../ports/IObservabilityContext.js';
import { IArbitrationDecision } from '../../domain/entities/ArbitrationDecision.js';

/**
 * Domain event for escalation approval.
 */
export class EscalationApproved {
    readonly dateTimeOccurred: Date;

    constructor(
        public readonly decisionId: string,
        public readonly conflictId: string,
        public readonly approvedProposalId: string | null,
        public readonly approvedBy: string
    ) {
        this.dateTimeOccurred = new Date();
    }

    getAggregateId(): string {
        return this.decisionId;
    }
}

/**
 * Domain event for escalation rejection.
 */
export class EscalationRejected {
    readonly dateTimeOccurred: Date;

    constructor(
        public readonly decisionId: string,
        public readonly conflictId: string,
        public readonly reason: string,
        public readonly rejectedBy: string
    ) {
        this.dateTimeOccurred = new Date();
    }

    getAggregateId(): string {
        return this.decisionId;
    }
}

/**
 * Result of escalation approval operation.
 */
export interface EscalationApprovalResult {
    success: boolean;
    decisionId: string;
    error?: string;
}

/**
 * Service for approving/rejecting escalated decisions.
 */
export class EscalationApprovalService {
    constructor(
        private readonly decisionRepository: IArbitrationDecisionRepository,
        private readonly proposalRepository: IAgentProposalRepository,
        private readonly eventDispatcher: IEventDispatcher,
        private readonly observability: IObservabilityContext
    ) {}

    /**
     * Get all escalated decisions pending approval.
     */
    async getPendingApprovals(): Promise<IArbitrationDecision[]> {
        return this.decisionRepository.findPendingApproval();
    }

    /**
     * Approve an escalated decision.
     * Optionally specify which proposal to approve (for multi-proposal conflicts).
     */
    async approveEscalatedDecision(
        decisionId: string,
        approvedBy: string = 'user',
        selectedProposalId?: string
    ): Promise<EscalationApprovalResult> {
        this.observability.logger.info('Approving escalated decision', { decisionId, approvedBy });

        const decision = await this.decisionRepository.findById(decisionId);
        if (!decision) {
            return {
                success: false,
                decisionId,
                error: `Decision not found: ${decisionId}`,
            };
        }

        if (!decision.requiresHumanApproval) {
            return {
                success: false,
                decisionId,
                error: 'Decision does not require human approval',
            };
        }

        if (decision.executed) {
            return {
                success: false,
                decisionId,
                error: 'Decision has already been executed',
            };
        }

        // Determine which proposal to approve
        let approvedProposalId = selectedProposalId ?? decision.winningProposalId;

        // If no winner was selected (escalation before resolution), use the selected one
        if (!approvedProposalId && selectedProposalId) {
            approvedProposalId = selectedProposalId;
        }

        // Update the decision
        const updatedDecision: IArbitrationDecision = {
            ...decision,
            winningProposalId: approvedProposalId,
            requiresHumanApproval: false,
            executed: true,
            executedAt: new Date(),
            outcome: approvedProposalId ? 'winner_selected' : decision.outcome,
            reasoningSummary: `${decision.reasoningSummary} (Manually approved by ${approvedBy})`,
        };

        await this.decisionRepository.save(updatedDecision);
        await this.decisionRepository.markExecuted(decisionId);

        // Update proposal status if there's a winner
        if (approvedProposalId) {
            await this.proposalRepository.updateStatus(approvedProposalId, 'executed', decisionId);
        }

        // Emit event
        await this.eventDispatcher.dispatch(
            new EscalationApproved(decisionId, decision.conflictId, approvedProposalId, approvedBy)
        );

        this.observability.metrics.incrementCounter('escalation.approved', 1);

        return {
            success: true,
            decisionId,
        };
    }

    /**
     * Reject an escalated decision.
     * All involved proposals will be marked as rejected.
     */
    async rejectEscalatedDecision(
        decisionId: string,
        reason: string,
        rejectedBy: string = 'user'
    ): Promise<EscalationApprovalResult> {
        this.observability.logger.info('Rejecting escalated decision', { decisionId, reason, rejectedBy });

        const decision = await this.decisionRepository.findById(decisionId);
        if (!decision) {
            return {
                success: false,
                decisionId,
                error: `Decision not found: ${decisionId}`,
            };
        }

        if (!decision.requiresHumanApproval) {
            return {
                success: false,
                decisionId,
                error: 'Decision does not require human approval',
            };
        }

        if (decision.executed) {
            return {
                success: false,
                decisionId,
                error: 'Decision has already been executed',
            };
        }

        // Update the decision
        const updatedDecision: IArbitrationDecision = {
            ...decision,
            winningProposalId: null,
            requiresHumanApproval: false,
            outcome: 'all_vetoed',
            reasoningSummary: `${decision.reasoningSummary} (Rejected by ${rejectedBy}: ${reason})`,
        };

        await this.decisionRepository.save(updatedDecision);

        // Mark all involved proposals as vetoed
        const allProposalIds = [
            decision.winningProposalId,
            ...decision.suppressedProposalIds,
            ...decision.vetoedProposalIds,
        ].filter((id): id is string => id !== null);

        for (const proposalId of allProposalIds) {
            await this.proposalRepository.updateStatus(proposalId, 'vetoed', decisionId);
        }

        // Emit event
        await this.eventDispatcher.dispatch(
            new EscalationRejected(decisionId, decision.conflictId, reason, rejectedBy)
        );

        this.observability.metrics.incrementCounter('escalation.rejected', 1);

        return {
            success: true,
            decisionId,
        };
    }
}
