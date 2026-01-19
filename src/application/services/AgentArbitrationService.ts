/**
 * AgentArbitrationService - V11 core service for resolving conflicts.
 *
 * This is the central arbitration authority. When multiple agents propose
 * conflicting actions, this service resolves the conflict using explicit,
 * user-defined policy, producing a single, explainable outcome.
 *
 * Key principles:
 * - No agent self-authority: Agents propose, never execute
 * - No implicit priority: All resolution rules are explicit
 * - No silent suppression: Every suppression is recorded and explained
 * - Mandatory audit trail: Every decision is logged
 */

import { IAgentProposalRepository } from '../ports/IAgentProposalRepository.js';
import { IdGenerator } from '../../shared/utils/IdGenerator.js';
import { IArbitrationPolicyRepository } from '../ports/IArbitrationPolicyRepository.js';
import { IArbitrationDecisionRepository } from '../ports/IArbitrationDecisionRepository.js';
import { IConflictRepository } from '../ports/IConflictRepository.js';
import { IEventDispatcher } from '../ports/IEventDispatcher.js';
import { IObservabilityContext } from '../ports/IObservabilityContext.js';
import {
    IAgentActionProposal,
    AgentActionProposalUtils,
} from '../../domain/entities/AgentActionProposal.js';
import {
    IArbitrationPolicy,
    ArbitrationPolicyBuilder,
    ArbitrationPolicyUtils,
} from '../../domain/entities/ArbitrationPolicy.js';
import {
    IArbitrationDecision,
    IConflict,
    IDecisionFactor,
    ArbitrationDecisionBuilder,
} from '../../domain/entities/ArbitrationDecision.js';
import { ArbitrationResolved } from '../../domain/events/ArbitrationResolved.js';
import { ActionSuppressed, SuppressionReason } from '../../domain/events/ActionSuppressed.js';
import { ArbitrationEscalated, EscalationReason, EscalatedProposal } from '../../domain/events/ArbitrationEscalated.js';
import { InMemoryConflictRepository } from '../../infrastructure/persistence/in-memory/InMemoryConflictRepository.js';

/**
 * Result of arbitration.
 */
export interface ArbitrationResult {
    decision: IArbitrationDecision;
    winningProposal: IAgentActionProposal | null;
    suppressedProposals: IAgentActionProposal[];
    vetoedProposals: IAgentActionProposal[];
    requiresHumanApproval: boolean;
}

/**
 * The core arbitration service.
 */
export class AgentArbitrationService {
    constructor(
        private readonly proposalRepository: IAgentProposalRepository,
        private readonly policyRepository: IArbitrationPolicyRepository,
        private readonly decisionRepository: IArbitrationDecisionRepository,
        private readonly conflictRepository: IConflictRepository,
        private readonly eventDispatcher: IEventDispatcher,
        private readonly observability: IObservabilityContext
    ) {}

    /**
     * Resolve a conflict.
     */
    async resolveConflict(conflict: IConflict): Promise<ArbitrationResult> {
        const decisionId = IdGenerator.generate();

        this.observability.logger.info('Starting arbitration', {
            conflictId: conflict.id,
            proposalCount: conflict.proposalIds.length,
        });

        // Get proposals
        const proposals = await this.getProposals(conflict.proposalIds);

        if (proposals.length === 0) {
            throw new Error(`No proposals found for conflict ${conflict.id}`);
        }

        // Get applicable policy
        const policy = await this.findApplicablePolicy(proposals);

        // Build decision
        const decisionBuilder = ArbitrationDecisionBuilder.create()
            .withId(decisionId)
            .withConflictId(conflict.id)
            .withPolicy(policy.id)
            .withStrategy(policy.resolutionStrategy);

        const decisionFactors: IDecisionFactor[] = [];
        const vetoedProposals: IAgentActionProposal[] = [];
        let suppressedProposals: IAgentActionProposal[] = [];
        let winningProposal: IAgentActionProposal | null = null;

        // Step 1: Check veto rules
        const nonVetoedProposals: IAgentActionProposal[] = [];
        for (const proposal of proposals) {
            const vetoResult = ArbitrationPolicyUtils.checkVetoRules(
                policy,
                proposal.agentName,
                proposal.costEstimate,
                proposal.riskLevel,
                proposal.targetRef.key
            );

            if (vetoResult.vetoed) {
                vetoedProposals.push(proposal);
                decisionFactors.push({
                    proposalId: proposal.id,
                    agentName: proposal.agentName,
                    factor: 'veto_rule',
                    value: vetoResult.rule?.name ?? 'unknown',
                    impact: 'negative',
                });

                // Check if veto requires escalation
                if (vetoResult.rule?.escalateOnVeto) {
                    return this.createEscalatedDecision(
                        decisionId,
                        conflict,
                        proposals,
                        policy,
                        'veto_escalation',
                        decisionFactors
                    );
                }
            } else {
                nonVetoedProposals.push(proposal);
            }
        }

        // Step 2: Check if all vetoed
        if (nonVetoedProposals.length === 0) {
            const decision = decisionBuilder
                .withAllVetoed()
                .withVetoedProposals(vetoedProposals.map((p) => p.id))
                .withReasoning('All proposals were vetoed by policy rules')
                .build();

            await this.finalizeDecision(decision, null, suppressedProposals, vetoedProposals, proposals);

            return {
                decision,
                winningProposal: null,
                suppressedProposals: [],
                vetoedProposals,
                requiresHumanApproval: false,
            };
        }

        // Step 3: Check escalation rules
        const isMultiAgentConflict = new Set(nonVetoedProposals.map((p) => p.agentName)).size > 1;
        for (const proposal of nonVetoedProposals) {
            const needsEscalation = ArbitrationPolicyUtils.requiresEscalation(
                policy,
                proposal.agentName,
                proposal.confidenceScore,
                proposal.costEstimate,
                proposal.riskLevel,
                isMultiAgentConflict
            );

            if (needsEscalation) {
                return this.createEscalatedDecision(
                    decisionId,
                    conflict,
                    proposals,
                    policy,
                    this.determineEscalationReason(policy, proposal, isMultiAgentConflict),
                    decisionFactors
                );
            }
        }

        // Step 4: Apply resolution strategy
        switch (policy.resolutionStrategy) {
            case 'priority':
                ({ winningProposal, suppressedProposals } = this.resolvePriority(
                    nonVetoedProposals,
                    policy,
                    decisionFactors
                ));
                break;

            case 'weighted':
                ({ winningProposal, suppressedProposals } = this.resolveWeighted(
                    nonVetoedProposals,
                    policy,
                    decisionFactors
                ));
                break;

            case 'veto':
                // Veto strategy: if any vetoed, fail. Otherwise pick highest confidence.
                ({ winningProposal, suppressedProposals } = this.resolveVetoStrategy(
                    nonVetoedProposals,
                    decisionFactors
                ));
                break;

            case 'consensus':
                // Consensus: all must agree. If not, escalate.
                const values = nonVetoedProposals.map((p) => JSON.stringify(p.proposedValue));
                const allSame = values.every((v) => v === values[0]);
                if (allSame) {
                    winningProposal = nonVetoedProposals[0];
                    suppressedProposals = nonVetoedProposals.slice(1);
                } else {
                    return this.createEscalatedDecision(
                        decisionId,
                        conflict,
                        proposals,
                        policy,
                        'no_clear_winner',
                        decisionFactors
                    );
                }
                break;

            default:
                // Default to priority
                ({ winningProposal, suppressedProposals } = this.resolvePriority(
                    nonVetoedProposals,
                    policy,
                    decisionFactors
                ));
        }

        // Build final decision
        for (const factor of decisionFactors) {
            decisionBuilder.withFactor(factor);
        }

        if (winningProposal) {
            decisionBuilder
                .withWinner(winningProposal.id)
                .withSuppressedProposals(suppressedProposals.map((p) => p.id))
                .withVetoedProposals(vetoedProposals.map((p) => p.id))
                .withReasoning(this.generateReasoning(winningProposal, policy, decisionFactors));
        }

        const decision = decisionBuilder.build();

        await this.finalizeDecision(decision, winningProposal, suppressedProposals, vetoedProposals, proposals);

        return {
            decision,
            winningProposal,
            suppressedProposals,
            vetoedProposals,
            requiresHumanApproval: false,
        };
    }

    /**
     * Resolve a single proposal (no conflict).
     */
    async resolveSingleProposal(proposal: IAgentActionProposal): Promise<ArbitrationResult> {
        const decisionId = IdGenerator.generate();
        const conflictId = `single-${proposal.id}`;

        this.observability.logger.debug('Processing single proposal', {
            proposalId: proposal.id,
            agentName: proposal.agentName,
        });

        // Get applicable policy
        const policy = await this.findApplicablePolicy([proposal]);

        // Check veto rules
        const vetoResult = ArbitrationPolicyUtils.checkVetoRules(
            policy,
            proposal.agentName,
            proposal.costEstimate,
            proposal.riskLevel,
            proposal.targetRef.key
        );

        if (vetoResult.vetoed) {
            const decision = ArbitrationDecisionBuilder.create()
                .withId(decisionId)
                .withConflictId(conflictId)
                .withPolicy(policy.id)
                .withStrategy(policy.resolutionStrategy)
                .withAllVetoed()
                .withVetoedProposals([proposal.id])
                .withFactor({
                    proposalId: proposal.id,
                    agentName: proposal.agentName,
                    factor: 'veto_rule',
                    value: vetoResult.rule?.name ?? 'unknown',
                    impact: 'negative',
                })
                .withReasoning(`Proposal vetoed by rule: ${vetoResult.rule?.name}`)
                .build();

            await this.saveDecision(decision);
            await this.updateProposalStatus(proposal.id, 'vetoed', decisionId);

            return {
                decision,
                winningProposal: null,
                suppressedProposals: [],
                vetoedProposals: [proposal],
                requiresHumanApproval: false,
            };
        }

        // Check escalation
        const needsEscalation = ArbitrationPolicyUtils.requiresEscalation(
            policy,
            proposal.agentName,
            proposal.confidenceScore,
            proposal.costEstimate,
            proposal.riskLevel,
            false
        );

        if (needsEscalation) {
            const decision = ArbitrationDecisionBuilder.create()
                .withId(decisionId)
                .withConflictId(conflictId)
                .withPolicy(policy.id)
                .withStrategy(policy.resolutionStrategy)
                .withEscalation()
                .withReasoning('Proposal requires human approval per policy')
                .build();

            await this.saveDecision(decision);
            await this.updateProposalStatus(proposal.id, 'escalated', decisionId);
            await this.emitEscalationEvent(decision, [proposal], policy, 'risk_threshold');

            return {
                decision,
                winningProposal: null,
                suppressedProposals: [],
                vetoedProposals: [],
                requiresHumanApproval: true,
            };
        }

        // Approve single proposal
        const decision = ArbitrationDecisionBuilder.create()
            .withId(decisionId)
            .withConflictId(conflictId)
            .withPolicy(policy.id)
            .withStrategy(policy.resolutionStrategy)
            .withWinner(proposal.id)
            .withOutcome('no_conflict')
            .withReasoning('Single proposal approved without conflict')
            .build();

        await this.saveDecision(decision);
        await this.updateProposalStatus(proposal.id, 'approved', decisionId);

        // Emit resolved event
        await this.eventDispatcher.dispatch(
            new ArbitrationResolved(
                decision.id,
                decision.conflictId,
                decision.winningProposalId,
                decision.suppressedProposalIds,
                decision.vetoedProposalIds,
                decision.strategyUsed,
                decision.policyId,
                decision.outcome,
                decision.reasoningSummary
            )
        );

        this.observability.metrics.incrementCounter('arbitration.resolved', 1, {
            outcome: 'no_conflict',
            strategy: policy.resolutionStrategy,
        });

        return {
            decision,
            winningProposal: proposal,
            suppressedProposals: [],
            vetoedProposals: [],
            requiresHumanApproval: false,
        };
    }

    /**
     * Get proposals by IDs.
     */
    private async getProposals(ids: string[]): Promise<IAgentActionProposal[]> {
        const proposals: IAgentActionProposal[] = [];
        for (const id of ids) {
            const proposal = await this.proposalRepository.findById(id);
            if (proposal) {
                proposals.push(proposal);
            }
        }
        return proposals;
    }

    /**
     * Find applicable policy for proposals.
     */
    private async findApplicablePolicy(proposals: IAgentActionProposal[]): Promise<IArbitrationPolicy> {
        // Check for preference-specific policy
        const prefKey = proposals[0]?.targetRef.key;
        if (prefKey) {
            const prefPolicy = await this.policyRepository.findForPreference(prefKey);
            if (prefPolicy) return prefPolicy;
        }

        // Check for agent-specific policy
        const agentName = proposals[0]?.agentName;
        if (agentName) {
            const agentPolicy = await this.policyRepository.findForAgent(agentName);
            if (agentPolicy) return agentPolicy;
        }

        // Use default policy
        const defaultPolicy = await this.policyRepository.findDefault();
        if (defaultPolicy) return defaultPolicy;

        // Create fallback policy if none exists
        return ArbitrationPolicyBuilder.createDefault('fallback-policy');
    }

    /**
     * Resolve using priority strategy.
     */
    private resolvePriority(
        proposals: IAgentActionProposal[],
        policy: IArbitrationPolicy,
        factors: IDecisionFactor[]
    ): { winningProposal: IAgentActionProposal; suppressedProposals: IAgentActionProposal[] } {
        // Sort by priority (lower index = higher priority)
        const sorted = [...proposals].sort((a, b) => {
            const priorityA = ArbitrationPolicyUtils.getAgentPriority(policy, a.agentName);
            const priorityB = ArbitrationPolicyUtils.getAgentPriority(policy, b.agentName);
            return priorityA - priorityB;
        });

        const winningProposal = sorted[0];
        const suppressedProposals = sorted.slice(1);

        // Record factors
        for (const proposal of proposals) {
            factors.push({
                proposalId: proposal.id,
                agentName: proposal.agentName,
                factor: 'priority',
                value: ArbitrationPolicyUtils.getAgentPriority(policy, proposal.agentName),
                impact: proposal.id === winningProposal.id ? 'positive' : 'negative',
            });
        }

        return { winningProposal, suppressedProposals };
    }

    /**
     * Resolve using weighted strategy.
     */
    private resolveWeighted(
        proposals: IAgentActionProposal[],
        policy: IArbitrationPolicy,
        factors: IDecisionFactor[]
    ): { winningProposal: IAgentActionProposal; suppressedProposals: IAgentActionProposal[] } {
        // Calculate scores
        const scored = proposals.map((p) => ({
            proposal: p,
            score: ArbitrationPolicyUtils.calculateScore(
                policy.weights,
                p.confidenceScore,
                p.costEstimate,
                p.riskLevel
            ),
        }));

        // Sort by score (higher = better)
        scored.sort((a, b) => b.score - a.score);

        const winningProposal = scored[0].proposal;
        const suppressedProposals = scored.slice(1).map((s) => s.proposal);

        // Record factors
        for (const { proposal, score } of scored) {
            factors.push({
                proposalId: proposal.id,
                agentName: proposal.agentName,
                factor: 'weighted_score',
                value: score,
                impact: proposal.id === winningProposal.id ? 'positive' : 'negative',
            });
        }

        return { winningProposal, suppressedProposals };
    }

    /**
     * Resolve using veto strategy (pick highest confidence among non-vetoed).
     */
    private resolveVetoStrategy(
        proposals: IAgentActionProposal[],
        factors: IDecisionFactor[]
    ): { winningProposal: IAgentActionProposal; suppressedProposals: IAgentActionProposal[] } {
        const sorted = [...proposals].sort((a, b) => b.confidenceScore - a.confidenceScore);
        const winningProposal = sorted[0];
        const suppressedProposals = sorted.slice(1);

        for (const proposal of proposals) {
            factors.push({
                proposalId: proposal.id,
                agentName: proposal.agentName,
                factor: 'confidence',
                value: proposal.confidenceScore,
                impact: proposal.id === winningProposal.id ? 'positive' : 'negative',
            });
        }

        return { winningProposal, suppressedProposals };
    }

    /**
     * Create an escalated decision.
     */
    private async createEscalatedDecision(
        decisionId: string,
        conflict: IConflict,
        proposals: IAgentActionProposal[],
        policy: IArbitrationPolicy,
        reason: EscalationReason,
        factors: IDecisionFactor[]
    ): Promise<ArbitrationResult> {
        const decision = ArbitrationDecisionBuilder.create()
            .withId(decisionId)
            .withConflictId(conflict.id)
            .withPolicy(policy.id)
            .withStrategy(policy.resolutionStrategy)
            .withEscalation()
            .withReasoning(`Escalated for human approval: ${reason}`)
            .build();

        // Add factors
        for (const factor of factors) {
            decision.decisionFactors.push(factor);
        }

        await this.saveDecision(decision);

        // Update all proposals to escalated
        for (const proposal of proposals) {
            await this.updateProposalStatus(proposal.id, 'escalated', decisionId);
        }

        // Emit escalation event
        await this.emitEscalationEvent(decision, proposals, policy, reason);

        return {
            decision,
            winningProposal: null,
            suppressedProposals: [],
            vetoedProposals: [],
            requiresHumanApproval: true,
        };
    }

    /**
     * Determine escalation reason.
     */
    private determineEscalationReason(
        policy: IArbitrationPolicy,
        proposal: IAgentActionProposal,
        isMultiAgent: boolean
    ): EscalationReason {
        const rule = policy.escalationRule;
        if (!rule) return 'risk_threshold';

        if (rule.alwaysEscalateAgents?.includes(proposal.agentName)) {
            return 'agent_always_escalate';
        }
        if (rule.onMultiAgentConflict && isMultiAgent) {
            return 'multi_agent_conflict';
        }
        if (rule.riskThreshold) {
            return 'risk_threshold';
        }
        if (rule.costThreshold !== undefined) {
            return 'cost_threshold';
        }
        if (rule.confidenceThreshold !== undefined) {
            return 'confidence_too_low';
        }

        return 'risk_threshold';
    }

    /**
     * Finalize a decision (save, update proposals, emit events).
     */
    private async finalizeDecision(
        decision: IArbitrationDecision,
        winningProposal: IAgentActionProposal | null,
        suppressedProposals: IAgentActionProposal[],
        vetoedProposals: IAgentActionProposal[],
        allProposals: IAgentActionProposal[]
    ): Promise<void> {
        await this.saveDecision(decision);

        // Mark conflict as resolved
        if (this.conflictRepository instanceof InMemoryConflictRepository) {
            (this.conflictRepository as InMemoryConflictRepository).markResolved(decision.conflictId);
        }

        // Update proposal statuses
        if (winningProposal) {
            await this.updateProposalStatus(winningProposal.id, 'approved', decision.id);
        }

        for (const proposal of suppressedProposals) {
            await this.updateProposalStatus(proposal.id, 'suppressed', decision.id);
        }

        for (const proposal of vetoedProposals) {
            await this.updateProposalStatus(proposal.id, 'vetoed', decision.id);
        }

        // Emit resolved event
        await this.eventDispatcher.dispatch(
            new ArbitrationResolved(
                decision.id,
                decision.conflictId,
                decision.winningProposalId,
                decision.suppressedProposalIds,
                decision.vetoedProposalIds,
                decision.strategyUsed,
                decision.policyId,
                decision.outcome,
                decision.reasoningSummary
            )
        );

        // Emit suppression events
        for (const proposal of suppressedProposals) {
            await this.emitSuppressionEvent(proposal, decision, winningProposal, allProposals);
        }

        this.observability.metrics.incrementCounter('arbitration.resolved', 1, {
            outcome: decision.outcome,
            strategy: decision.strategyUsed,
        });

        this.observability.logger.info('Arbitration complete', {
            decisionId: decision.id,
            outcome: decision.outcome,
            winner: winningProposal?.agentName,
            suppressedCount: suppressedProposals.length,
            vetoedCount: vetoedProposals.length,
        });
    }

    /**
     * Save decision to repository.
     */
    private async saveDecision(decision: IArbitrationDecision): Promise<void> {
        await this.decisionRepository.save(decision);
    }

    /**
     * Update proposal status.
     */
    private async updateProposalStatus(
        proposalId: string,
        status: 'approved' | 'suppressed' | 'vetoed' | 'escalated',
        decisionId: string
    ): Promise<void> {
        await this.proposalRepository.updateStatus(proposalId, status, decisionId);
    }

    /**
     * Emit suppression event.
     */
    private async emitSuppressionEvent(
        suppressedProposal: IAgentActionProposal,
        decision: IArbitrationDecision,
        winningProposal: IAgentActionProposal | null,
        allProposals: IAgentActionProposal[]
    ): Promise<void> {
        const reason: SuppressionReason =
            decision.strategyUsed === 'priority'
                ? 'lost_priority'
                : decision.strategyUsed === 'weighted'
                    ? 'lower_score'
                    : 'lost_priority';

        const winnerFactor = decision.decisionFactors.find(
            (f) => f.proposalId === winningProposal?.id
        );
        const loserfactor = decision.decisionFactors.find(
            (f) => f.proposalId === suppressedProposal.id
        );

        await this.eventDispatcher.dispatch(
            new ActionSuppressed(
                suppressedProposal.id,
                suppressedProposal.agentName,
                decision.id,
                winningProposal?.id ?? null,
                reason,
                decision.strategyUsed,
                `${suppressedProposal.agentName}'s proposal was suppressed in favor of ${winningProposal?.agentName ?? 'none'}`,
                decision.strategyUsed === 'weighted' && winnerFactor && loserfactor
                    ? {
                          thisProposalScore: loserfactor.value as number,
                          winningScore: winnerFactor.value as number,
                      }
                    : undefined,
                decision.strategyUsed === 'priority' && winnerFactor && loserfactor
                    ? {
                          thisProposalPriority: loserfactor.value as number,
                          winningPriority: winnerFactor.value as number,
                      }
                    : undefined
            )
        );
    }

    /**
     * Emit escalation event.
     */
    private async emitEscalationEvent(
        decision: IArbitrationDecision,
        proposals: IAgentActionProposal[],
        policy: IArbitrationPolicy,
        reason: EscalationReason
    ): Promise<void> {
        const escalatedProposals: EscalatedProposal[] = proposals.map((p) => ({
            proposalId: p.id,
            agentName: p.agentName,
            actionType: p.actionType,
            proposedValue: p.proposedValue,
            confidenceScore: p.confidenceScore,
            costEstimate: p.costEstimate,
            riskLevel: p.riskLevel,
        }));

        // Find highest confidence proposal as suggestion
        const highestConfidence = [...proposals].sort(
            (a, b) => b.confidenceScore - a.confidenceScore
        )[0];

        await this.eventDispatcher.dispatch(
            new ArbitrationEscalated(
                decision.id,
                decision.conflictId,
                reason,
                escalatedProposals,
                policy.id,
                `Conflict between ${proposals.map((p) => p.agentName).join(', ')} requires human review`,
                highestConfidence
                    ? {
                          proposalId: highestConfidence.id,
                          confidence: highestConfidence.confidenceScore,
                          reasoning: `${highestConfidence.agentName} has highest confidence (${highestConfidence.confidenceScore})`,
                      }
                    : undefined
            )
        );
    }

    /**
     * Generate reasoning summary.
     */
    private generateReasoning(
        winner: IAgentActionProposal,
        policy: IArbitrationPolicy,
        factors: IDecisionFactor[]
    ): string {
        const winnerFactors = factors.filter((f) => f.proposalId === winner.id);
        const factorSummary = winnerFactors
            .map((f) => `${f.factor}=${f.value}`)
            .join(', ');

        return `${winner.agentName} selected using ${policy.resolutionStrategy} strategy. Factors: ${factorSummary}`;
    }
}
