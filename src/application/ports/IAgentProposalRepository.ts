/**
 * IAgentProposalRepository - V11 port for storing and retrieving agent proposals.
 */

import { IAgentActionProposal, ProposalStatus } from '../../domain/entities/AgentActionProposal.js';

export interface IAgentProposalRepository {
    /**
     * Save a proposal.
     */
    save(proposal: IAgentActionProposal): Promise<void>;

    /**
     * Find proposal by ID.
     */
    findById(id: string): Promise<IAgentActionProposal | null>;

    /**
     * Find all pending proposals.
     */
    findPending(): Promise<IAgentActionProposal[]>;

    /**
     * Find pending proposals for a specific target.
     */
    findPendingForTarget(targetType: string, targetId: string, targetKey?: string): Promise<IAgentActionProposal[]>;

    /**
     * Find proposals by agent name.
     */
    findByAgent(agentName: string): Promise<IAgentActionProposal[]>;

    /**
     * Find proposals by originating event.
     */
    findByOriginatingEvent(eventId: string): Promise<IAgentActionProposal[]>;

    /**
     * Find proposals by status.
     */
    findByStatus(status: ProposalStatus): Promise<IAgentActionProposal[]>;

    /**
     * Update proposal status.
     */
    updateStatus(id: string, status: ProposalStatus, decisionId?: string): Promise<void>;

    /**
     * Find all proposals.
     */
    findAll(): Promise<IAgentActionProposal[]>;
}
