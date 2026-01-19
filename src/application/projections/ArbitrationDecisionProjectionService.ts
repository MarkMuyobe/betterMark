/**
 * ArbitrationDecisionProjectionService - V12 projection builder for arbitration decisions.
 *
 * Pure projection service with:
 * - No side effects
 * - No writes
 * - No domain mutation
 * - Idempotent operations
 */

import { IArbitrationDecisionRepository } from '../ports/IArbitrationDecisionRepository.js';
import { IAgentProposalRepository } from '../ports/IAgentProposalRepository.js';
import { ArbitrationDecisionReadModel, ArbitrationDecisionReadModelBuilder } from '../read-models/ArbitrationDecisionReadModel.js';

/**
 * Service for building arbitration decision read models.
 */
export class ArbitrationDecisionProjectionService {
    constructor(
        private readonly decisionRepository: IArbitrationDecisionRepository,
        private readonly proposalRepository: IAgentProposalRepository
    ) {}

    /**
     * Build all arbitration decision read models.
     */
    async buildAllArbitrationDecisionReadModels(): Promise<ArbitrationDecisionReadModel[]> {
        const decisions = await this.decisionRepository.findAll();
        const readModels: ArbitrationDecisionReadModel[] = [];

        for (const decision of decisions) {
            const readModel = await this.buildArbitrationDecisionReadModel(decision.id);
            if (readModel) {
                readModels.push(readModel);
            }
        }

        return readModels;
    }

    /**
     * Build a single arbitration decision read model.
     */
    async buildArbitrationDecisionReadModel(decisionId: string): Promise<ArbitrationDecisionReadModel | null> {
        const decision = await this.decisionRepository.findById(decisionId);
        if (!decision) {
            return null;
        }

        // Get winning proposal details
        let winningAgent: string | null = null;
        let winningActionSummary: string | null = null;

        if (decision.winningProposalId) {
            const winningProposal = await this.proposalRepository.findById(decision.winningProposalId);
            if (winningProposal) {
                winningAgent = winningProposal.agentName;
                winningActionSummary = this.buildActionSummary(winningProposal);
            }
        }

        // Get suppressed agent names
        const suppressedAgents: string[] = [];
        for (const proposalId of decision.suppressedProposalIds) {
            const proposal = await this.proposalRepository.findById(proposalId);
            if (proposal) {
                suppressedAgents.push(proposal.agentName);
            }
        }

        return ArbitrationDecisionReadModelBuilder.create()
            .withDecisionId(decision.id)
            .withConflictId(decision.conflictId)
            .withWinningAgent(winningAgent)
            .withWinningActionSummary(winningActionSummary)
            .withSuppressedAgents(suppressedAgents)
            .withStrategyUsed(decision.strategyUsed)
            .withReasoningSummary(decision.reasoningSummary)
            .withEscalated(decision.requiresHumanApproval)
            .withExecuted(decision.executed, decision.executedAt)
            .withResolvedAt(decision.createdAt)
            .build();
    }

    /**
     * Build read models for pending approval (escalated decisions).
     */
    async buildPendingApprovalReadModels(): Promise<ArbitrationDecisionReadModel[]> {
        const pendingDecisions = await this.decisionRepository.findPendingApproval();
        const readModels: ArbitrationDecisionReadModel[] = [];

        for (const decision of pendingDecisions) {
            const readModel = await this.buildArbitrationDecisionReadModel(decision.id);
            if (readModel) {
                readModels.push(readModel);
            }
        }

        return readModels;
    }

    /**
     * Build a summary of the action from a proposal.
     */
    private buildActionSummary(proposal: { actionType: string; targetRef: { type: string; id: string; key?: string }; proposedValue: unknown }): string {
        const target = proposal.targetRef.key
            ? `${proposal.targetRef.type}:${proposal.targetRef.id}:${proposal.targetRef.key}`
            : `${proposal.targetRef.type}:${proposal.targetRef.id}`;

        const valueStr = typeof proposal.proposedValue === 'object'
            ? JSON.stringify(proposal.proposedValue)
            : String(proposal.proposedValue);

        return `${proposal.actionType} on ${target} with value ${valueStr}`;
    }
}
