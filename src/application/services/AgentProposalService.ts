/**
 * AgentProposalService - V11 service for managing agent action proposals.
 *
 * Agents use this service to submit proposals. No side effects are allowed
 * at this stage - all proposals must go through arbitration before execution.
 */

import { IAgentProposalRepository } from '../ports/IAgentProposalRepository.js';
import { IdGenerator } from '../../shared/utils/IdGenerator.js';
import { IEventDispatcher } from '../ports/IEventDispatcher.js';
import { IObservabilityContext } from '../ports/IObservabilityContext.js';
import {
    IAgentActionProposal,
    ITargetRef,
    ProposalActionType,
    AgentActionProposalBuilder,
} from '../../domain/entities/AgentActionProposal.js';
import { RiskLevel } from '../../domain/value-objects/PreferenceTypes.js';
import { AgentActionProposed, ProposedAction } from '../../domain/events/AgentActionProposed.js';

/**
 * Input for creating a proposal.
 */
export interface CreateProposalInput {
    agentName: string;
    actionType: ProposalActionType;
    targetRef: ITargetRef;
    proposedValue: unknown;
    confidenceScore: number;
    costEstimate?: number;
    riskLevel?: RiskLevel;
    originatingEventId: string;
    suggestionId?: string;
}

/**
 * Result of creating a proposal.
 */
export interface CreateProposalResult {
    proposal: IAgentActionProposal;
    proposalId: string;
}

/**
 * Service for managing agent action proposals.
 */
export class AgentProposalService {
    constructor(
        private readonly proposalRepository: IAgentProposalRepository,
        private readonly eventDispatcher: IEventDispatcher,
        private readonly observability: IObservabilityContext
    ) {}

    /**
     * Submit a new proposal.
     * Agents call this instead of executing actions directly.
     */
    async submitProposal(input: CreateProposalInput): Promise<CreateProposalResult> {
        const proposalId = IdGenerator.generate();

        this.observability.logger.debug('Creating proposal', {
            proposalId,
            agentName: input.agentName,
            actionType: input.actionType,
            target: `${input.targetRef.type}:${input.targetRef.id}`,
        });

        // Build the proposal
        const proposal = AgentActionProposalBuilder.create()
            .withId(proposalId)
            .withAgent(input.agentName)
            .withActionType(input.actionType)
            .withTarget(input.targetRef)
            .withProposedValue(input.proposedValue)
            .withConfidence(input.confidenceScore)
            .withCost(input.costEstimate ?? 0)
            .withRiskLevel(input.riskLevel ?? 'low')
            .withOriginatingEvent(input.originatingEventId);

        if (input.suggestionId) {
            proposal.withSuggestionId(input.suggestionId);
        }

        const builtProposal = proposal.build();

        // Save to repository
        await this.proposalRepository.save(builtProposal);

        // Emit event for tracking
        const proposedAction: ProposedAction = {
            type: this.mapActionType(input.actionType),
            targetAggregateId: input.targetRef.id,
            targetAggregateType: input.targetRef.type,
            payload: {
                value: input.proposedValue,
                key: input.targetRef.key,
            },
            priority: Math.round(input.confidenceScore * 100),
        };

        await this.eventDispatcher.dispatch(
            new AgentActionProposed(
                input.agentName,
                proposedAction,
                input.originatingEventId,
                proposalId
            )
        );

        this.observability.metrics.incrementCounter('proposal.created', 1, {
            agent: input.agentName,
            actionType: input.actionType,
        });

        this.observability.logger.info('Proposal submitted', {
            proposalId,
            agentName: input.agentName,
            actionType: input.actionType,
        });

        return {
            proposal: builtProposal,
            proposalId,
        };
    }

    /**
     * Get a proposal by ID.
     */
    async getProposal(id: string): Promise<IAgentActionProposal | null> {
        return this.proposalRepository.findById(id);
    }

    /**
     * Get all pending proposals.
     */
    async getPendingProposals(): Promise<IAgentActionProposal[]> {
        return this.proposalRepository.findPending();
    }

    /**
     * Get pending proposals for a specific target.
     */
    async getPendingProposalsForTarget(
        targetType: string,
        targetId: string,
        targetKey?: string
    ): Promise<IAgentActionProposal[]> {
        return this.proposalRepository.findPendingForTarget(targetType, targetId, targetKey);
    }

    /**
     * Get proposals by agent.
     */
    async getProposalsByAgent(agentName: string): Promise<IAgentActionProposal[]> {
        return this.proposalRepository.findByAgent(agentName);
    }

    /**
     * Get proposals by originating event.
     */
    async getProposalsByEvent(eventId: string): Promise<IAgentActionProposal[]> {
        return this.proposalRepository.findByOriginatingEvent(eventId);
    }

    /**
     * Map ProposalActionType to ProposedActionType.
     */
    private mapActionType(actionType: ProposalActionType): import('../../domain/events/AgentActionProposed.js').ProposedActionType {
        switch (actionType) {
            case 'ApplyPreference':
                return 'update_goal'; // Closest match
            case 'RescheduleTask':
                return 'reschedule';
            case 'CreateSuggestion':
                return 'suggestion';
            case 'SendNotification':
                return 'notification';
            case 'UpdateSchedule':
                return 'reschedule';
            case 'ModifyGoal':
                return 'update_goal';
            default:
                return 'log_activity';
        }
    }
}
