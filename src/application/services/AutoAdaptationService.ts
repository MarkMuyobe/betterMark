/**
 * AutoAdaptationService - V10 service for automatic preference adaptation.
 * V11 Update: Integrates with arbitration when ArbitrationOrchestrator is available.
 *
 * Orchestrates the auto-adaptation process:
 * 1. Processes pending suggestions
 * 2. Evaluates against policies
 * 3. V11: Submits proposals to arbitration OR V10: Auto-applies if allowed
 * 4. Records full audit trail
 * 5. Emits domain events
 * 6. Supports rollback
 */

import { IAgentLearningRepository } from '../ports/IAgentLearningRepository.js';
import { ISuggestedPreference, IUserPreference } from '../../domain/entities/AgentLearningProfile.js';
import { IAutoAdaptationAttempt, AutoAdaptationAttemptBuilder } from '../../domain/entities/AutoAdaptationAttempt.js';
import { IAdaptationPolicy } from '../../domain/entities/AdaptationPolicy.js';
import { AdaptationPolicyService, IAdaptationPolicyRepository } from './AdaptationPolicyService.js';
import { PreferenceRegistry } from '../../domain/services/PreferenceRegistry.js';
import { IEventDispatcher } from '../ports/IEventDispatcher.js';
import { PreferenceAutoApplied } from '../../domain/events/PreferenceAutoApplied.js';
import { PreferenceAutoBlocked } from '../../domain/events/PreferenceAutoBlocked.js';
import { PreferenceAutoSkipped } from '../../domain/events/PreferenceAutoSkipped.js';
import { IObservabilityContext } from '../ports/IObservabilityContext.js';
import { IdGenerator } from '../../shared/utils/IdGenerator.js';
import { AgentProposalService, CreateProposalInput } from './AgentProposalService.js';
import { RiskLevel } from '../../domain/value-objects/PreferenceTypes.js';

/**
 * Result of processing a single suggestion.
 */
export interface IAutoAdaptResult {
    suggestionId: string;
    attemptId: string;
    result: 'applied' | 'blocked' | 'skipped';
    reason?: string;
}

/**
 * Result of processing all pending suggestions for an agent.
 */
export interface IAutoAdaptBatchResult {
    agentName: string;
    processed: number;
    applied: number;
    blocked: number;
    skipped: number;
    results: IAutoAdaptResult[];
}

/**
 * In-memory repository for auto-adaptation attempts.
 */
export interface IAutoAdaptationAttemptRepository {
    save(attempt: IAutoAdaptationAttempt): Promise<void>;
    findById(id: string): Promise<IAutoAdaptationAttempt | null>;
    findBySuggestionId(suggestionId: string): Promise<IAutoAdaptationAttempt[]>;
    findByAgent(agentName: string, limit?: number): Promise<IAutoAdaptationAttempt[]>;
    findAppliedByAgent(agentName: string, limit?: number): Promise<IAutoAdaptationAttempt[]>;
    query(params: {
        agentName?: string;
        result?: 'applied' | 'blocked' | 'skipped';
        rolledBack?: boolean;
        since?: Date;
        limit?: number;
    }): Promise<IAutoAdaptationAttempt[]>;
}

/**
 * Simple in-memory implementation of attempt repository.
 */
export class InMemoryAutoAdaptationAttemptRepository implements IAutoAdaptationAttemptRepository {
    private attempts: Map<string, IAutoAdaptationAttempt> = new Map();

    async save(attempt: IAutoAdaptationAttempt): Promise<void> {
        this.attempts.set(attempt.id, attempt);
    }

    async findById(id: string): Promise<IAutoAdaptationAttempt | null> {
        return this.attempts.get(id) ?? null;
    }

    async findBySuggestionId(suggestionId: string): Promise<IAutoAdaptationAttempt[]> {
        return Array.from(this.attempts.values()).filter(
            a => a.suggestionId === suggestionId
        );
    }

    async findByAgent(agentName: string, limit?: number): Promise<IAutoAdaptationAttempt[]> {
        let results = Array.from(this.attempts.values())
            .filter(a => a.agentName === agentName)
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

        if (limit) {
            results = results.slice(0, limit);
        }
        return results;
    }

    async findAppliedByAgent(agentName: string, limit?: number): Promise<IAutoAdaptationAttempt[]> {
        let results = Array.from(this.attempts.values())
            .filter(a => a.agentName === agentName && a.result === 'applied' && !a.rolledBack)
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

        if (limit) {
            results = results.slice(0, limit);
        }
        return results;
    }

    async query(params: {
        agentName?: string;
        result?: 'applied' | 'blocked' | 'skipped';
        rolledBack?: boolean;
        since?: Date;
        limit?: number;
    }): Promise<IAutoAdaptationAttempt[]> {
        let results = Array.from(this.attempts.values());

        if (params.agentName) {
            results = results.filter(a => a.agentName === params.agentName);
        }
        if (params.result) {
            results = results.filter(a => a.result === params.result);
        }
        if (params.rolledBack !== undefined) {
            results = results.filter(a => a.rolledBack === params.rolledBack);
        }
        if (params.since) {
            results = results.filter(a => a.timestamp >= params.since!);
        }

        results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

        if (params.limit) {
            results = results.slice(0, params.limit);
        }

        return results;
    }

    clear(): void {
        this.attempts.clear();
    }
}

export class AutoAdaptationService {
    private proposalService?: AgentProposalService;

    constructor(
        private readonly learningRepository: IAgentLearningRepository,
        private readonly policyService: AdaptationPolicyService,
        private readonly attemptRepository: IAutoAdaptationAttemptRepository,
        private readonly preferenceRegistry: PreferenceRegistry,
        private readonly eventDispatcher?: IEventDispatcher,
        private readonly observability?: IObservabilityContext
    ) {}

    /**
     * V11: Set the proposal service for arbitration integration.
     * When set, auto-adaptation goes through arbitration instead of direct application.
     */
    setProposalService(proposalService: AgentProposalService): void {
        this.proposalService = proposalService;
        this.observability?.logger?.info('V11 arbitration integration enabled for AutoAdaptationService');
    }

    /**
     * V11: Create a proposal for a suggestion without applying it.
     * The proposal will go through arbitration before execution.
     */
    async createProposalForSuggestion(
        agentName: string,
        suggestion: ISuggestedPreference,
        originatingEventId: string
    ): Promise<{ proposalId: string; blocked?: boolean; blockReason?: string }> {
        if (!this.proposalService) {
            throw new Error('ProposalService not configured. Call setProposalService() first.');
        }

        const policy = await this.policyService.getOrCreatePolicy(agentName);

        // Get current preference value
        const profile = await this.learningRepository.findByAgentName(agentName);
        const currentPref = profile?.preferences.find(
            p => p.category === suggestion.category && p.key === suggestion.key
        );
        const currentValue = currentPref?.value ?? this.preferenceRegistry.getDefaultValue(
            suggestion.category,
            suggestion.key
        );

        // Check if already at suggested value
        if (currentValue === suggestion.suggestedValue) {
            return {
                proposalId: '',
                blocked: true,
                blockReason: 'preference_already_at_suggested_value',
            };
        }

        // Get risk level from registry
        const riskLevel = this.preferenceRegistry.getRiskLevel(
            suggestion.category,
            suggestion.key
        ) as RiskLevel;

        // Evaluate if auto-adaptation is allowed by V10 policy
        const evaluation = await this.policyService.evaluateAutoAdaptation(
            agentName,
            suggestion.category,
            suggestion.key,
            suggestion.confidence,
            riskLevel
        );

        if (!evaluation.allowed) {
            return {
                proposalId: '',
                blocked: true,
                blockReason: evaluation.blockReason,
            };
        }

        // V11: Create proposal instead of direct application
        const proposalInput: CreateProposalInput = {
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
                currentValue,
                newValue: suggestion.suggestedValue,
                suggestionId: suggestion.suggestionId,
            },
            confidenceScore: suggestion.confidence,
            costEstimate: 0,
            riskLevel,
            originatingEventId,
            suggestionId: suggestion.suggestionId,
        };

        const result = await this.proposalService.submitProposal(proposalInput);

        this.observability?.logger?.info('V11: Proposal created for suggestion', {
            proposalId: result.proposalId,
            agentName,
            preference: `${suggestion.category}.${suggestion.key}`,
        });

        return { proposalId: result.proposalId };
    }

    /**
     * V11: Apply a preference after arbitration approval.
     * Called when a proposal wins arbitration.
     */
    async executeApprovedProposal(
        agentName: string,
        suggestionId: string,
        category: string,
        key: string,
        newValue: unknown,
        previousValue: unknown
    ): Promise<IAutoAdaptResult> {
        const policy = await this.policyService.getOrCreatePolicy(agentName);
        const policySnapshot = this.createPolicySnapshot(policy);
        const riskLevel = this.preferenceRegistry.getRiskLevel(category, key) as RiskLevel;

        // Apply the preference
        await this.learningRepository.approveSuggestion(agentName, suggestionId, 'learning');

        // Record rate limiting
        await this.policyService.recordAutoAdaptation(agentName);

        // Get confidence from suggestion
        const profile = await this.learningRepository.findByAgentName(agentName);
        const suggestion = profile?.suggestedPreferences?.find(s => s.suggestionId === suggestionId);
        const confidence = suggestion?.confidence ?? 0.8;

        // Create applied attempt
        const attempt = AutoAdaptationAttemptBuilder.applied(
            IdGenerator.generate(),
            agentName,
            suggestionId,
            category,
            key,
            previousValue,
            newValue,
            confidence,
            riskLevel,
            policy.id,
            policySnapshot
        );
        await this.attemptRepository.save(attempt);

        // Emit event
        if (this.eventDispatcher) {
            await this.eventDispatcher.dispatch(new PreferenceAutoApplied(attempt));
        }

        this.observability?.logger?.info('V11: Proposal executed after arbitration', {
            agentName,
            suggestionId,
            preference: `${category}.${key}`,
            previousValue,
            newValue,
        });

        return {
            suggestionId,
            attemptId: attempt.id,
            result: 'applied',
        };
    }

    /**
     * Process all pending suggestions for an agent.
     * Auto-applies if policy allows, otherwise blocks/skips.
     */
    async processAgentSuggestions(agentName: string): Promise<IAutoAdaptBatchResult> {
        const span = this.observability?.tracer?.startSpan('autoAdaptation.processAgent');

        const results: IAutoAdaptResult[] = [];
        let applied = 0;
        let blocked = 0;
        let skipped = 0;

        try {
            const pendingSuggestions = await this.learningRepository.getPendingSuggestions(agentName);

            for (const suggestion of pendingSuggestions) {
                const result = await this.processSuggestion(agentName, suggestion);
                results.push(result);

                switch (result.result) {
                    case 'applied':
                        applied++;
                        break;
                    case 'blocked':
                        blocked++;
                        break;
                    case 'skipped':
                        skipped++;
                        break;
                }
            }

            this.observability?.metrics?.incrementCounter('autoAdaptation.batch.processed', 1, {
                agent: agentName,
                applied: String(applied),
                blocked: String(blocked),
                skipped: String(skipped),
            });

            span?.end();

            return {
                agentName,
                processed: results.length,
                applied,
                blocked,
                skipped,
                results,
            };
        } catch (error) {
            span?.setStatus('error');
            span?.end();
            throw error;
        }
    }

    /**
     * Process a single suggestion.
     */
    async processSuggestion(
        agentName: string,
        suggestion: ISuggestedPreference
    ): Promise<IAutoAdaptResult> {
        const span = this.observability?.tracer?.startSpan('autoAdaptation.processSuggestion');

        try {
            const policy = await this.policyService.getOrCreatePolicy(agentName);
            const policySnapshot = this.createPolicySnapshot(policy);

            // Get current preference value
            const profile = await this.learningRepository.findByAgentName(agentName);
            const currentPref = profile?.preferences.find(
                p => p.category === suggestion.category && p.key === suggestion.key
            );
            const currentValue = currentPref?.value ?? this.preferenceRegistry.getDefaultValue(
                suggestion.category,
                suggestion.key
            );

            // Check if already at suggested value
            if (currentValue === suggestion.suggestedValue) {
                const attempt = AutoAdaptationAttemptBuilder.skipped(
                    IdGenerator.generate(),
                    agentName,
                    suggestion.suggestionId,
                    suggestion.category,
                    suggestion.key,
                    'preference_already_at_suggested_value',
                    policy.id,
                    policySnapshot
                );
                await this.attemptRepository.save(attempt);

                // Emit event
                if (this.eventDispatcher) {
                    await this.eventDispatcher.dispatch(new PreferenceAutoSkipped(attempt));
                }

                span?.end();

                return {
                    suggestionId: suggestion.suggestionId,
                    attemptId: attempt.id,
                    result: 'skipped',
                    reason: 'Preference already at suggested value',
                };
            }

            // Get risk level from registry
            const riskLevel = this.preferenceRegistry.getRiskLevel(
                suggestion.category,
                suggestion.key
            );

            // Evaluate if auto-adaptation is allowed
            const evaluation = await this.policyService.evaluateAutoAdaptation(
                agentName,
                suggestion.category,
                suggestion.key,
                suggestion.confidence,
                riskLevel
            );

            if (!evaluation.allowed) {
                // Blocked
                const attempt = AutoAdaptationAttemptBuilder.blocked(
                    IdGenerator.generate(),
                    agentName,
                    suggestion.suggestionId,
                    suggestion.category,
                    suggestion.key,
                    currentValue,
                    suggestion.suggestedValue,
                    suggestion.confidence,
                    riskLevel,
                    evaluation.blockReason!,
                    policy.id,
                    policySnapshot
                );
                await this.attemptRepository.save(attempt);

                // Emit event
                if (this.eventDispatcher) {
                    await this.eventDispatcher.dispatch(new PreferenceAutoBlocked(attempt));
                }

                this.observability?.logger?.info('Auto-adaptation blocked', {
                    agentName,
                    suggestionId: suggestion.suggestionId,
                    preference: `${suggestion.category}.${suggestion.key}`,
                    reason: evaluation.blockReason,
                });

                span?.end();

                return {
                    suggestionId: suggestion.suggestionId,
                    attemptId: attempt.id,
                    result: 'blocked',
                    reason: evaluation.blockReason,
                };
            }

            // Apply the preference
            await this.learningRepository.approveSuggestion(
                agentName,
                suggestion.suggestionId,
                'learning'
            );

            // Record rate limiting
            await this.policyService.recordAutoAdaptation(agentName);

            // Create applied attempt
            const attempt = AutoAdaptationAttemptBuilder.applied(
                IdGenerator.generate(),
                agentName,
                suggestion.suggestionId,
                suggestion.category,
                suggestion.key,
                currentValue,
                suggestion.suggestedValue,
                suggestion.confidence,
                riskLevel,
                policy.id,
                policySnapshot
            );
            await this.attemptRepository.save(attempt);

            // Emit event
            if (this.eventDispatcher) {
                await this.eventDispatcher.dispatch(new PreferenceAutoApplied(attempt));
            }

            this.observability?.logger?.info('Auto-adaptation applied', {
                agentName,
                suggestionId: suggestion.suggestionId,
                preference: `${suggestion.category}.${suggestion.key}`,
                previousValue: currentValue,
                newValue: suggestion.suggestedValue,
                confidence: suggestion.confidence,
            });

            this.observability?.metrics?.incrementCounter('autoAdaptation.applied', 1, {
                agent: agentName,
                category: suggestion.category,
                key: suggestion.key,
            });

            span?.end();

            return {
                suggestionId: suggestion.suggestionId,
                attemptId: attempt.id,
                result: 'applied',
            };
        } catch (error) {
            span?.setStatus('error');
            span?.end();
            throw error;
        }
    }

    /**
     * Rollback an auto-applied preference change.
     */
    async rollback(attemptId: string, reason: string): Promise<boolean> {
        const span = this.observability?.tracer?.startSpan('autoAdaptation.rollback');

        try {
            const attempt = await this.attemptRepository.findById(attemptId);

            if (!attempt) {
                this.observability?.logger?.warn('Rollback failed: attempt not found', { attemptId });
                span?.end();
                return false;
            }

            if (attempt.result !== 'applied') {
                this.observability?.logger?.warn('Rollback failed: attempt was not applied', {
                    attemptId,
                    result: attempt.result,
                });
                span?.end();
                return false;
            }

            if (attempt.rolledBack) {
                this.observability?.logger?.warn('Rollback failed: already rolled back', { attemptId });
                span?.end();
                return false;
            }

            // Restore the previous value
            if (attempt.previousValue !== undefined) {
                const preference: IUserPreference = {
                    preferenceId: IdGenerator.generate(),
                    category: attempt.category,
                    key: attempt.key,
                    value: attempt.previousValue,
                    confidence: 1.0,
                    learnedFrom: [],
                    lastUpdated: new Date(),
                };

                await this.learningRepository.setPreference(
                    attempt.agentName,
                    preference
                );
            } else {
                // Reset to default if there was no previous value
                await this.learningRepository.resetPreference(
                    attempt.agentName,
                    attempt.category,
                    attempt.key,
                    'system'
                );
            }

            // Mark attempt as rolled back
            const rolledBackAttempt: IAutoAdaptationAttempt = {
                ...attempt,
                rolledBack: true,
                rolledBackAt: new Date(),
                rollbackReason: reason,
            };
            await this.attemptRepository.save(rolledBackAttempt);

            this.observability?.logger?.info('Auto-adaptation rolled back', {
                attemptId,
                agentName: attempt.agentName,
                preference: `${attempt.category}.${attempt.key}`,
                reason,
            });

            this.observability?.metrics?.incrementCounter('autoAdaptation.rolledBack', 1, {
                agent: attempt.agentName,
            });

            span?.end();
            return true;
        } catch (error) {
            span?.setStatus('error');
            span?.end();
            throw error;
        }
    }

    /**
     * Rollback all auto-applied changes for an agent.
     */
    async rollbackAll(agentName: string, reason: string): Promise<number> {
        const appliedAttempts = await this.attemptRepository.findAppliedByAgent(agentName);
        let rolledBackCount = 0;

        for (const attempt of appliedAttempts) {
            const success = await this.rollback(attempt.id, reason);
            if (success) {
                rolledBackCount++;
            }
        }

        return rolledBackCount;
    }

    /**
     * Get auto-adaptation history for an agent.
     */
    async getHistory(
        agentName: string,
        options?: {
            result?: 'applied' | 'blocked' | 'skipped';
            since?: Date;
            limit?: number;
        }
    ): Promise<IAutoAdaptationAttempt[]> {
        return this.attemptRepository.query({
            agentName,
            ...options,
        });
    }

    /**
     * Get summary statistics for an agent.
     */
    async getStats(agentName: string): Promise<{
        totalAttempts: number;
        applied: number;
        blocked: number;
        skipped: number;
        rolledBack: number;
        pendingSuggestions: number;
    }> {
        const allAttempts = await this.attemptRepository.findByAgent(agentName);
        const pending = await this.learningRepository.getPendingSuggestions(agentName);

        return {
            totalAttempts: allAttempts.length,
            applied: allAttempts.filter(a => a.result === 'applied').length,
            blocked: allAttempts.filter(a => a.result === 'blocked').length,
            skipped: allAttempts.filter(a => a.result === 'skipped').length,
            rolledBack: allAttempts.filter(a => a.rolledBack).length,
            pendingSuggestions: pending.length,
        };
    }

    /**
     * Create a policy snapshot for audit.
     */
    private createPolicySnapshot(policy: IAdaptationPolicy): IAutoAdaptationAttempt['policySnapshot'] {
        return {
            mode: policy.mode,
            userOptedIn: policy.userOptedIn,
            minConfidence: policy.minConfidence,
            allowedRiskLevels: [...policy.allowedRiskLevels],
        };
    }
}
