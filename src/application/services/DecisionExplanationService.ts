/**
 * DecisionExplanationService - V12 service for explaining decisions.
 *
 * Humans must be able to ask "Why did this happen?"
 * This service provides complete explanations backed by:
 * - ArbitrationDecision
 * - AutoAdaptationAttempt
 * - Policies
 * - Analytics snapshots
 */

import { IArbitrationDecisionRepository } from '../ports/IArbitrationDecisionRepository.js';
import { IArbitrationPolicyRepository } from '../ports/IArbitrationPolicyRepository.js';
import { IAgentProposalRepository } from '../ports/IAgentProposalRepository.js';
import { IAutoAdaptationAttemptRepository } from './AutoAdaptationService.js';
import { AdaptationPolicyService } from './AdaptationPolicyService.js';

/**
 * A factor that contributed to a decision.
 */
export interface ContributingFactor {
    /** Name of the factor */
    name: string;
    /** Description of how it contributed */
    description: string;
    /** Value of the factor */
    value: unknown;
    /** Impact on the decision */
    impact: 'positive' | 'negative' | 'neutral';
}

/**
 * Information about a policy that was involved.
 */
export interface PolicyInvolved {
    /** Policy ID */
    policyId: string;
    /** Policy name */
    policyName: string;
    /** How the policy affected the decision */
    effect: string;
}

/**
 * An alternative that was considered but not chosen.
 */
export interface AlternativeConsidered {
    /** Agent that proposed the alternative */
    agentName: string;
    /** What was proposed */
    proposedAction: string;
    /** Why it wasn't chosen */
    whyNotChosen: string;
    /** Score or priority (if applicable) */
    score?: number;
    /** Priority (if applicable) */
    priority?: number;
}

/**
 * Complete explanation of a decision.
 */
export interface Explanation {
    /** Human-readable summary */
    summary: string;
    /** Factors that contributed to the decision */
    contributingFactors: ContributingFactor[];
    /** Policies that were involved */
    policiesInvolved: PolicyInvolved[];
    /** Alternatives that were considered */
    alternativesConsidered: AlternativeConsidered[];
    /** Why other proposals lost (detailed) */
    whyOthersLost: Array<{
        agentName: string;
        proposalId: string;
        reason: string;
        details: string;
    }>;
    /** Type of decision being explained */
    decisionType: 'arbitration' | 'adaptation';
    /** When the decision was made */
    decidedAt: Date;
}

/**
 * Service for explaining decisions to humans.
 */
export class DecisionExplanationService {
    constructor(
        private readonly decisionRepository: IArbitrationDecisionRepository,
        private readonly policyRepository: IArbitrationPolicyRepository,
        private readonly proposalRepository: IAgentProposalRepository,
        private readonly attemptRepository: IAutoAdaptationAttemptRepository,
        private readonly adaptationPolicyService: AdaptationPolicyService
    ) {}

    /**
     * Explain an arbitration decision.
     */
    async explainArbitrationDecision(decisionId: string): Promise<Explanation | null> {
        const decision = await this.decisionRepository.findById(decisionId);
        if (!decision) {
            return null;
        }

        // Get the policy used
        const policy = await this.policyRepository.findById(decision.policyId);

        // Get all proposals involved
        const allProposalIds = [
            decision.winningProposalId,
            ...decision.suppressedProposalIds,
            ...decision.vetoedProposalIds,
        ].filter((id): id is string => id !== null);

        const proposals = await Promise.all(
            allProposalIds.map(id => this.proposalRepository.findById(id))
        );
        const validProposals = proposals.filter((p): p is NonNullable<typeof p> => p !== null);

        // Build contributing factors from decision factors
        const contributingFactors: ContributingFactor[] = decision.decisionFactors.map(f => ({
            name: f.factor,
            description: `${f.agentName}'s ${f.factor} was ${f.value}`,
            value: f.value,
            impact: f.impact,
        }));

        // Build policies involved
        const policiesInvolved: PolicyInvolved[] = [];
        if (policy) {
            policiesInvolved.push({
                policyId: policy.id,
                policyName: policy.name,
                effect: `Resolution strategy: ${policy.resolutionStrategy}`,
            });

            // Add veto rules that were triggered
            for (const vetoedId of decision.vetoedProposalIds) {
                const vetoedProposal = validProposals.find(p => p.id === vetoedId);
                if (vetoedProposal) {
                    policiesInvolved.push({
                        policyId: policy.id,
                        policyName: `Veto Rule`,
                        effect: `Blocked ${vetoedProposal.agentName}'s proposal`,
                    });
                }
            }
        }

        // Build alternatives considered
        const alternativesConsidered: AlternativeConsidered[] = [];
        for (const proposal of validProposals) {
            if (proposal.id !== decision.winningProposalId) {
                const factor = decision.decisionFactors.find(f => f.proposalId === proposal.id);
                alternativesConsidered.push({
                    agentName: proposal.agentName,
                    proposedAction: `${proposal.actionType} on ${proposal.targetRef.type}:${proposal.targetRef.id}`,
                    whyNotChosen: this.getWhyNotChosen(proposal.id, decision, factor),
                    score: factor?.factor === 'weighted_score' ? factor.value as number : undefined,
                    priority: factor?.factor === 'priority' ? factor.value as number : undefined,
                });
            }
        }

        // Build detailed "why others lost"
        const whyOthersLost = decision.suppressedProposalIds.map(id => {
            const proposal = validProposals.find(p => p.id === id);
            const factor = decision.decisionFactors.find(f => f.proposalId === id);
            const winnerFactor = decision.winningProposalId
                ? decision.decisionFactors.find(f => f.proposalId === decision.winningProposalId)
                : null;

            return {
                agentName: proposal?.agentName ?? 'unknown',
                proposalId: id,
                reason: decision.strategyUsed === 'priority' ? 'Lower priority' : 'Lower score',
                details: this.buildDetailedLossExplanation(factor, winnerFactor, decision.strategyUsed),
            };
        });

        // Add vetoed proposals
        for (const id of decision.vetoedProposalIds) {
            const proposal = validProposals.find(p => p.id === id);
            whyOthersLost.push({
                agentName: proposal?.agentName ?? 'unknown',
                proposalId: id,
                reason: 'Vetoed by policy rule',
                details: 'The proposal was blocked by a veto rule in the arbitration policy',
            });
        }

        // Build summary
        let summary: string;
        switch (decision.outcome) {
            case 'winner_selected':
                const winner = validProposals.find(p => p.id === decision.winningProposalId);
                summary = `${winner?.agentName ?? 'Unknown agent'} won arbitration using ${decision.strategyUsed} strategy. ` +
                    `${decision.suppressedProposalIds.length} proposal(s) suppressed, ${decision.vetoedProposalIds.length} vetoed.`;
                break;
            case 'all_vetoed':
                summary = `All ${decision.vetoedProposalIds.length} proposal(s) were vetoed by policy rules. No action taken.`;
                break;
            case 'escalated':
                summary = `Decision escalated for human approval. Awaiting manual resolution.`;
                break;
            case 'no_conflict':
                summary = `Single proposal processed without conflict. Directly approved.`;
                break;
            default:
                summary = decision.reasoningSummary;
        }

        return {
            summary,
            contributingFactors,
            policiesInvolved,
            alternativesConsidered,
            whyOthersLost,
            decisionType: 'arbitration',
            decidedAt: decision.createdAt,
        };
    }

    /**
     * Explain an adaptation attempt.
     */
    async explainAdaptationAttempt(attemptId: string): Promise<Explanation | null> {
        const attempt = await this.attemptRepository.findById(attemptId);
        if (!attempt) {
            return null;
        }

        const contributingFactors: ContributingFactor[] = [
            {
                name: 'confidence',
                description: `Confidence score of ${attempt.confidence}`,
                value: attempt.confidence,
                impact: attempt.confidence >= (attempt.policySnapshot.minConfidence ?? 0.7) ? 'positive' : 'negative',
            },
            {
                name: 'riskLevel',
                description: `Risk level: ${attempt.riskLevel}`,
                value: attempt.riskLevel,
                impact: attempt.policySnapshot.allowedRiskLevels.includes(attempt.riskLevel) ? 'positive' : 'negative',
            },
            {
                name: 'userOptedIn',
                description: attempt.policySnapshot.userOptedIn ? 'User has opted in to auto-adaptation' : 'User has not opted in',
                value: attempt.policySnapshot.userOptedIn,
                impact: attempt.policySnapshot.userOptedIn ? 'positive' : 'negative',
            },
        ];

        const policiesInvolved: PolicyInvolved[] = [
            {
                policyId: attempt.policyId,
                policyName: 'Adaptation Policy',
                effect: `Mode: ${attempt.policySnapshot.mode}, Min confidence: ${attempt.policySnapshot.minConfidence}`,
            },
        ];

        let summary: string;
        switch (attempt.result) {
            case 'applied':
                summary = `Auto-adaptation applied successfully. Changed ${attempt.category}.${attempt.key} ` +
                    `from "${attempt.previousValue}" to "${attempt.suggestedValue}".`;
                break;
            case 'blocked':
                summary = `Auto-adaptation blocked: ${attempt.blockReason}`;
                break;
            case 'skipped':
                summary = `Auto-adaptation skipped: ${attempt.blockReason ?? 'Already at target value'}`;
                break;
            default:
                summary = 'Unknown adaptation result';
        }

        if (attempt.rolledBack) {
            summary += ` (Later rolled back: ${attempt.rollbackReason})`;
        }

        return {
            summary,
            contributingFactors,
            policiesInvolved,
            alternativesConsidered: [], // No alternatives for adaptation
            whyOthersLost: [], // N/A for adaptation
            decisionType: 'adaptation',
            decidedAt: attempt.timestamp,
        };
    }

    /**
     * Explain any decision by ID (tries both arbitration and adaptation).
     */
    async explainDecision(decisionId: string): Promise<Explanation | null> {
        // Try arbitration first
        const arbitrationExplanation = await this.explainArbitrationDecision(decisionId);
        if (arbitrationExplanation) {
            return arbitrationExplanation;
        }

        // Try adaptation
        return this.explainAdaptationAttempt(decisionId);
    }

    /**
     * Get a brief reason why a proposal was not chosen.
     */
    private getWhyNotChosen(
        proposalId: string,
        decision: { strategyUsed: string; vetoedProposalIds: string[] },
        factor?: { factor: string; value: unknown }
    ): string {
        if (decision.vetoedProposalIds.includes(proposalId)) {
            return 'Vetoed by policy rule';
        }

        switch (decision.strategyUsed) {
            case 'priority':
                return factor ? `Lower priority (${factor.value})` : 'Lower priority';
            case 'weighted':
                return factor ? `Lower weighted score (${factor.value})` : 'Lower weighted score';
            case 'consensus':
                return 'Did not achieve consensus';
            default:
                return 'Not selected by resolution strategy';
        }
    }

    /**
     * Build detailed explanation of why a proposal lost.
     */
    private buildDetailedLossExplanation(
        loserFactor: { factor: string; value: unknown } | undefined,
        winnerFactor: { factor: string; value: unknown } | null | undefined,
        strategy: string
    ): string {
        if (!loserFactor || !winnerFactor) {
            return 'Insufficient data to explain';
        }

        switch (strategy) {
            case 'priority':
                return `This proposal had priority ${loserFactor.value}, but the winner had priority ${winnerFactor.value} (lower is better)`;
            case 'weighted':
                return `This proposal scored ${loserFactor.value}, but the winner scored ${winnerFactor.value} (higher is better)`;
            default:
                return `Lost to winner using ${strategy} strategy`;
        }
    }
}
