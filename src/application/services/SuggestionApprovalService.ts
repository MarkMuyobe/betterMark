/**
 * SuggestionApprovalService - V12 approval gateway for suggestions.
 *
 * Controlled mutation for approving/rejecting pending suggestions.
 * Rules:
 * - Only applies to pending suggestions
 * - Emits domain events
 * - Triggers V10/V11 flows
 */

import { IAgentLearningRepository } from '../ports/IAgentLearningRepository.js';
import { IEventDispatcher } from '../ports/IEventDispatcher.js';
import { IObservabilityContext } from '../ports/IObservabilityContext.js';
import { AgentProposalService } from './AgentProposalService.js';
import { ISuggestedPreference } from '../../domain/entities/AgentLearningProfile.js';
import { IdGenerator } from '../../shared/utils/IdGenerator.js';

/**
 * Domain event for suggestion approval.
 */
export class SuggestionApproved {
    readonly dateTimeOccurred: Date;

    constructor(
        public readonly agentName: string,
        public readonly suggestionId: string,
        public readonly preferenceKey: string,
        public readonly newValue: unknown,
        public readonly previousValue: unknown
    ) {
        this.dateTimeOccurred = new Date();
    }

    getAggregateId(): string {
        return this.suggestionId;
    }
}

/**
 * Domain event for suggestion rejection.
 */
export class SuggestionRejected {
    readonly dateTimeOccurred: Date;

    constructor(
        public readonly agentName: string,
        public readonly suggestionId: string,
        public readonly preferenceKey: string,
        public readonly reason: string
    ) {
        this.dateTimeOccurred = new Date();
    }

    getAggregateId(): string {
        return this.suggestionId;
    }
}

/**
 * Result of approval operation.
 */
export interface ApprovalResult {
    success: boolean;
    suggestionId: string;
    error?: string;
}

/**
 * Service for approving/rejecting suggestions.
 */
export class SuggestionApprovalService {
    constructor(
        private readonly learningRepository: IAgentLearningRepository,
        private readonly eventDispatcher: IEventDispatcher,
        private readonly proposalService: AgentProposalService | null,
        private readonly observability: IObservabilityContext
    ) {}

    /**
     * Approve a pending suggestion.
     */
    async approveSuggestion(agentName: string, suggestionId: string): Promise<ApprovalResult> {
        this.observability.logger.info('Approving suggestion', { agentName, suggestionId });

        // Get the profile and find the suggestion
        const profile = await this.learningRepository.findByAgentName(agentName);
        if (!profile) {
            return {
                success: false,
                suggestionId,
                error: `Agent profile not found: ${agentName}`,
            };
        }

        const suggestion = profile.suggestedPreferences?.find(s => s.suggestionId === suggestionId);
        if (!suggestion) {
            return {
                success: false,
                suggestionId,
                error: `Suggestion not found: ${suggestionId}`,
            };
        }

        if (suggestion.status !== 'pending') {
            return {
                success: false,
                suggestionId,
                error: `Suggestion is not pending (status: ${suggestion.status})`,
            };
        }

        // Get current value
        const currentPref = profile.preferences.find(
            p => p.category === suggestion.category && p.key === suggestion.key
        );
        const previousValue = currentPref?.value;

        // If V11 is enabled, create a proposal instead of direct approval
        if (this.proposalService) {
            try {
                const proposalResult = await this.proposalService.submitProposal({
                    agentName,
                    actionType: 'ApplyPreference',
                    targetRef: {
                        type: 'preference',
                        id: `${suggestion.category}.${suggestion.key}`,
                        key: suggestion.key,
                    },
                    proposedValue: {
                        category: suggestion.category,
                        key: suggestion.key,
                        currentValue: previousValue,
                        newValue: suggestion.suggestedValue,
                        suggestionId: suggestion.suggestionId,
                    },
                    confidenceScore: 1.0, // Manual approval = full confidence
                    costEstimate: 0,
                    riskLevel: 'low',
                    originatingEventId: IdGenerator.generate(),
                    suggestionId: suggestion.suggestionId,
                });

                this.observability.logger.info('Suggestion approval created V11 proposal', {
                    suggestionId,
                    proposalId: proposalResult.proposalId,
                });

                // The proposal will go through arbitration
                // For now, also approve the suggestion directly
            } catch (error) {
                this.observability.logger.warn('Failed to create V11 proposal, falling back to direct approval', {
                    suggestionId,
                    error: String(error),
                });
            }
        }

        // Apply the suggestion (V10 direct path or V11 fallback)
        await this.learningRepository.approveSuggestion(agentName, suggestionId, 'user');

        // Emit event
        await this.eventDispatcher.dispatch(
            new SuggestionApproved(
                agentName,
                suggestionId,
                `${suggestion.category}.${suggestion.key}`,
                suggestion.suggestedValue,
                previousValue
            )
        );

        this.observability.metrics.incrementCounter('suggestion.approved', 1, { agent: agentName });

        return {
            success: true,
            suggestionId,
        };
    }

    /**
     * Reject a pending suggestion.
     */
    async rejectSuggestion(agentName: string, suggestionId: string, reason: string): Promise<ApprovalResult> {
        this.observability.logger.info('Rejecting suggestion', { agentName, suggestionId, reason });

        // Get the profile and find the suggestion
        const profile = await this.learningRepository.findByAgentName(agentName);
        if (!profile) {
            return {
                success: false,
                suggestionId,
                error: `Agent profile not found: ${agentName}`,
            };
        }

        const suggestion = profile.suggestedPreferences?.find(s => s.suggestionId === suggestionId);
        if (!suggestion) {
            return {
                success: false,
                suggestionId,
                error: `Suggestion not found: ${suggestionId}`,
            };
        }

        if (suggestion.status !== 'pending') {
            return {
                success: false,
                suggestionId,
                error: `Suggestion is not pending (status: ${suggestion.status})`,
            };
        }

        // Reject the suggestion
        await this.learningRepository.rejectSuggestion(agentName, suggestionId, reason);

        // Emit event
        await this.eventDispatcher.dispatch(
            new SuggestionRejected(
                agentName,
                suggestionId,
                `${suggestion.category}.${suggestion.key}`,
                reason
            )
        );

        this.observability.metrics.incrementCounter('suggestion.rejected', 1, { agent: agentName });

        return {
            success: true,
            suggestionId,
        };
    }

    /**
     * Get pending suggestions for an agent.
     */
    async getPendingSuggestions(agentName: string): Promise<ISuggestedPreference[]> {
        return this.learningRepository.getPendingSuggestions(agentName);
    }
}
