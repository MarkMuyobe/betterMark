/**
 * InMemoryAgentProposalRepository - V11 in-memory implementation.
 */

import { IAgentProposalRepository } from '../../../application/ports/IAgentProposalRepository.js';
import { IAgentActionProposal, ProposalStatus } from '../../../domain/entities/AgentActionProposal.js';

export class InMemoryAgentProposalRepository implements IAgentProposalRepository {
    private proposals: Map<string, IAgentActionProposal> = new Map();

    async save(proposal: IAgentActionProposal): Promise<void> {
        this.proposals.set(proposal.id, { ...proposal });
    }

    async findById(id: string): Promise<IAgentActionProposal | null> {
        const proposal = this.proposals.get(id);
        return proposal ? { ...proposal } : null;
    }

    async findPending(): Promise<IAgentActionProposal[]> {
        return Array.from(this.proposals.values())
            .filter((p) => p.status === 'pending')
            .map((p) => ({ ...p }));
    }

    async findPendingForTarget(
        targetType: string,
        targetId: string,
        targetKey?: string
    ): Promise<IAgentActionProposal[]> {
        return Array.from(this.proposals.values())
            .filter((p) => {
                if (p.status !== 'pending') return false;
                if (p.targetRef.type !== targetType) return false;
                if (p.targetRef.id !== targetId) return false;
                if (targetKey !== undefined && p.targetRef.key !== targetKey) return false;
                return true;
            })
            .map((p) => ({ ...p }));
    }

    async findByAgent(agentName: string): Promise<IAgentActionProposal[]> {
        return Array.from(this.proposals.values())
            .filter((p) => p.agentName === agentName)
            .map((p) => ({ ...p }));
    }

    async findByOriginatingEvent(eventId: string): Promise<IAgentActionProposal[]> {
        return Array.from(this.proposals.values())
            .filter((p) => p.originatingEventId === eventId)
            .map((p) => ({ ...p }));
    }

    async findByStatus(status: ProposalStatus): Promise<IAgentActionProposal[]> {
        return Array.from(this.proposals.values())
            .filter((p) => p.status === status)
            .map((p) => ({ ...p }));
    }

    async updateStatus(id: string, status: ProposalStatus, decisionId?: string): Promise<void> {
        const proposal = this.proposals.get(id);
        if (proposal) {
            proposal.status = status;
            proposal.processedAt = new Date();
            if (decisionId) {
                proposal.arbitrationDecisionId = decisionId;
            }
        }
    }

    async findAll(): Promise<IAgentActionProposal[]> {
        return Array.from(this.proposals.values()).map((p) => ({ ...p }));
    }

    // Test helper
    clear(): void {
        this.proposals.clear();
    }
}
