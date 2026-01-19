/**
 * RollbackService - V12 rollback control surface.
 *
 * Controlled mutation for rolling back decisions and preferences.
 * Rules:
 * - Must reference audit trail
 * - Must emit rollback event
 * - Must restore exact previous state
 */

import { IAgentLearningRepository } from '../ports/IAgentLearningRepository.js';
import { IArbitrationDecisionRepository } from '../ports/IArbitrationDecisionRepository.js';
import { IAgentProposalRepository } from '../ports/IAgentProposalRepository.js';
import { IAutoAdaptationAttemptRepository, AutoAdaptationService } from './AutoAdaptationService.js';
import { IEventDispatcher } from '../ports/IEventDispatcher.js';
import { IObservabilityContext } from '../ports/IObservabilityContext.js';
import { IUserPreference } from '../../domain/entities/AgentLearningProfile.js';
import { IdGenerator } from '../../shared/utils/IdGenerator.js';

/**
 * Domain event for rollback.
 */
export class PreferenceRolledBack {
    readonly dateTimeOccurred: Date;

    constructor(
        public readonly agentName: string,
        public readonly category: string,
        public readonly key: string,
        public readonly previousValue: unknown,
        public readonly restoredValue: unknown,
        public readonly sourceDecisionId: string | null,
        public readonly reason: string
    ) {
        this.dateTimeOccurred = new Date();
    }

    getAggregateId(): string {
        return `${this.agentName}.${this.category}.${this.key}`;
    }
}

/**
 * Result of rollback operation.
 */
export interface RollbackResult {
    success: boolean;
    rolledBackCount: number;
    errors: string[];
}

/**
 * Service for rolling back decisions and preferences.
 */
export class RollbackService {
    constructor(
        private readonly learningRepository: IAgentLearningRepository,
        private readonly decisionRepository: IArbitrationDecisionRepository,
        private readonly proposalRepository: IAgentProposalRepository,
        private readonly attemptRepository: IAutoAdaptationAttemptRepository,
        private readonly autoAdaptationService: AutoAdaptationService,
        private readonly eventDispatcher: IEventDispatcher,
        private readonly observability: IObservabilityContext
    ) {}

    /**
     * Rollback by arbitration decision ID.
     * Reverts the winning proposal's effect.
     */
    async rollbackByDecision(decisionId: string, reason: string): Promise<RollbackResult> {
        this.observability.logger.info('Rolling back by decision', { decisionId, reason });

        const decision = await this.decisionRepository.findById(decisionId);
        if (!decision) {
            return {
                success: false,
                rolledBackCount: 0,
                errors: [`Decision not found: ${decisionId}`],
            };
        }

        if (!decision.executed) {
            return {
                success: false,
                rolledBackCount: 0,
                errors: ['Decision was never executed, nothing to rollback'],
            };
        }

        if (!decision.winningProposalId) {
            return {
                success: false,
                rolledBackCount: 0,
                errors: ['Decision has no winning proposal to rollback'],
            };
        }

        // Get the winning proposal
        const proposal = await this.proposalRepository.findById(decision.winningProposalId);
        if (!proposal) {
            return {
                success: false,
                rolledBackCount: 0,
                errors: [`Winning proposal not found: ${decision.winningProposalId}`],
            };
        }

        // Only ApplyPreference actions can be rolled back
        if (proposal.actionType !== 'ApplyPreference') {
            return {
                success: false,
                rolledBackCount: 0,
                errors: [`Cannot rollback action type: ${proposal.actionType}`],
            };
        }

        // Extract preference details from proposed value
        const proposedValue = proposal.proposedValue as {
            category: string;
            key: string;
            currentValue: unknown;
            newValue: unknown;
        };

        if (!proposedValue.category || !proposedValue.key) {
            return {
                success: false,
                rolledBackCount: 0,
                errors: ['Invalid proposal value format'],
            };
        }

        // Restore the previous value
        const result = await this.rollbackPreference(
            proposal.agentName,
            proposedValue.category,
            proposedValue.key,
            proposedValue.currentValue,
            decisionId,
            reason
        );

        return result;
    }

    /**
     * Rollback a specific preference to its previous value.
     */
    async rollbackByPreference(
        agentType: string,
        preferenceKey: string,
        reason: string
    ): Promise<RollbackResult> {
        this.observability.logger.info('Rolling back preference', { agentType, preferenceKey, reason });

        // Parse the preference key
        const [category, key] = preferenceKey.includes('.')
            ? preferenceKey.split('.')
            : [preferenceKey, preferenceKey];

        // Find the most recent auto-adaptation attempt for this preference
        const attempts = await this.attemptRepository.query({
            agentName: agentType,
            result: 'applied',
            rolledBack: false,
        });

        const relevantAttempt = attempts.find(
            a => a.category === category && a.key === key
        );

        if (relevantAttempt) {
            // Use the auto-adaptation service's rollback
            const success = await this.autoAdaptationService.rollback(relevantAttempt.id, reason);

            if (success) {
                // Emit event
                await this.eventDispatcher.dispatch(
                    new PreferenceRolledBack(
                        agentType,
                        category,
                        key,
                        relevantAttempt.suggestedValue,
                        relevantAttempt.previousValue,
                        null,
                        reason
                    )
                );

                this.observability.metrics.incrementCounter('rollback.preference', 1, { agent: agentType });

                return {
                    success: true,
                    rolledBackCount: 1,
                    errors: [],
                };
            }

            return {
                success: false,
                rolledBackCount: 0,
                errors: ['Failed to rollback auto-adaptation attempt'],
            };
        }

        // No auto-adaptation to rollback, check preference history
        const profile = await this.learningRepository.findByAgentName(agentType);
        if (!profile) {
            return {
                success: false,
                rolledBackCount: 0,
                errors: [`Agent profile not found: ${agentType}`],
            };
        }

        const history = profile.preferenceChangeHistory?.filter(
            h => h.category === category && h.key === key
        ) ?? [];

        if (history.length < 1) {
            return {
                success: false,
                rolledBackCount: 0,
                errors: ['No previous value to rollback to'],
            };
        }

        // History is stored most recent first
        // Get the previous value from the most recent change record
        const mostRecentChange = history[0];
        if (mostRecentChange.previousValue === null || mostRecentChange.previousValue === undefined) {
            return {
                success: false,
                rolledBackCount: 0,
                errors: ['Cannot rollback: no previous value exists (this was the first value)'],
            };
        }

        // Restore the previous value
        return this.rollbackPreference(
            agentType,
            category,
            key,
            mostRecentChange.previousValue,
            null,
            reason
        );
    }

    /**
     * Rollback all auto-applied preferences for an agent.
     */
    async rollbackAllForAgent(agentType: string, reason: string): Promise<RollbackResult> {
        this.observability.logger.info('Rolling back all preferences for agent', { agentType, reason });

        const rolledBackCount = await this.autoAdaptationService.rollbackAll(agentType, reason);

        this.observability.metrics.incrementCounter('rollback.all', 1, { agent: agentType });

        return {
            success: true,
            rolledBackCount,
            errors: [],
        };
    }

    /**
     * Internal method to rollback a preference.
     */
    private async rollbackPreference(
        agentName: string,
        category: string,
        key: string,
        restoredValue: unknown,
        sourceDecisionId: string | null,
        reason: string
    ): Promise<RollbackResult> {
        // Get current value for the event
        const profile = await this.learningRepository.findByAgentName(agentName);
        const currentPref = profile?.preferences.find(
            p => p.category === category && p.key === key
        );
        const currentValue = currentPref?.value;

        // Set the restored value
        const newPreference: IUserPreference = {
            preferenceId: IdGenerator.generate(),
            category,
            key,
            value: restoredValue,
            confidence: 1.0,
            learnedFrom: [],
            lastUpdated: new Date(),
        };

        await this.learningRepository.setPreference(agentName, newPreference);

        // Emit event
        await this.eventDispatcher.dispatch(
            new PreferenceRolledBack(
                agentName,
                category,
                key,
                currentValue,
                restoredValue,
                sourceDecisionId,
                reason
            )
        );

        this.observability.metrics.incrementCounter('rollback.preference', 1, { agent: agentName });

        return {
            success: true,
            rolledBackCount: 1,
            errors: [],
        };
    }

    /**
     * Get rollback history for an agent.
     */
    async getRollbackHistory(agentType: string): Promise<Array<{
        attemptId: string;
        category: string;
        key: string;
        previousValue: unknown;
        newValue: unknown;
        rolledBackAt: Date;
        reason: string;
    }>> {
        const attempts = await this.attemptRepository.query({
            agentName: agentType,
            rolledBack: true,
        });

        return attempts.map(a => ({
            attemptId: a.id,
            category: a.category,
            key: a.key,
            previousValue: a.previousValue,
            newValue: a.suggestedValue,
            rolledBackAt: a.rolledBackAt!,
            reason: a.rollbackReason ?? '',
        }));
    }
}
