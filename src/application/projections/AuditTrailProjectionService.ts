/**
 * AuditTrailProjectionService - V12 projection builder for audit trail.
 *
 * Pure projection service with:
 * - No side effects
 * - No writes
 * - No domain mutation
 * - Idempotent operations
 */

import { IArbitrationDecisionRepository } from '../ports/IArbitrationDecisionRepository.js';
import { IAgentProposalRepository } from '../ports/IAgentProposalRepository.js';
import { IAutoAdaptationAttemptRepository } from '../services/AutoAdaptationService.js';
import { AuditTrailReadModel, AuditTrailReadModelBuilder, AuditRecordType } from '../read-models/AuditTrailReadModel.js';
import { IdGenerator } from '../../shared/utils/IdGenerator.js';

/**
 * Query parameters for audit trail.
 */
export interface AuditTrailQuery {
    agentType?: string;
    type?: AuditRecordType;
    since?: Date;
    limit?: number;
}

/**
 * Service for building audit trail read models.
 */
export class AuditTrailProjectionService {
    constructor(
        private readonly decisionRepository: IArbitrationDecisionRepository,
        private readonly proposalRepository: IAgentProposalRepository,
        private readonly attemptRepository: IAutoAdaptationAttemptRepository
    ) {}

    /**
     * Build all audit trail read models.
     */
    async buildAllAuditTrailReadModels(query?: AuditTrailQuery): Promise<AuditTrailReadModel[]> {
        const readModels: AuditTrailReadModel[] = [];

        // Build from adaptation attempts
        const adaptationModels = await this.buildFromAdaptationAttempts(query);
        readModels.push(...adaptationModels);

        // Build from arbitration decisions
        const arbitrationModels = await this.buildFromArbitrationDecisions(query);
        readModels.push(...arbitrationModels);

        // Sort by creation date (most recent first)
        readModels.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        // Apply limit if specified
        if (query?.limit && query.limit > 0) {
            return readModels.slice(0, query.limit);
        }

        return readModels;
    }

    /**
     * Build audit trail from adaptation attempts.
     */
    private async buildFromAdaptationAttempts(query?: AuditTrailQuery): Promise<AuditTrailReadModel[]> {
        const attempts = await this.attemptRepository.query({
            agentName: query?.agentType,
            since: query?.since,
        });

        const readModels: AuditTrailReadModel[] = [];

        for (const attempt of attempts) {
            let type: AuditRecordType;
            let outcome: AuditTrailReadModel['outcome'];

            if (attempt.rolledBack) {
                type = 'rollback';
                outcome = 'rolled_back';
            } else if (attempt.result === 'applied') {
                type = 'adaptation';
                outcome = 'success';
            } else if (attempt.result === 'blocked') {
                type = 'adaptation';
                outcome = 'blocked';
            } else {
                continue; // Skip 'skipped' attempts
            }

            // Filter by type if specified
            if (query?.type && query.type !== type) {
                continue;
            }

            readModels.push(
                AuditTrailReadModelBuilder.create()
                    .withRecordId(attempt.id)
                    .withType(type)
                    .withAgentType(attempt.agentName)
                    .withTargetRef({
                        type: 'preference',
                        id: `${attempt.category}.${attempt.key}`,
                        key: attempt.key,
                    })
                    .withActionSummary(
                        attempt.rolledBack
                            ? `Rolled back preference from ${attempt.suggestedValue} to ${attempt.previousValue}`
                            : attempt.result === 'applied'
                                ? `Auto-applied preference change from ${attempt.previousValue} to ${attempt.suggestedValue}`
                                : `Blocked auto-adaptation: ${attempt.blockReason}`
                    )
                    .withReason(attempt.blockReason ?? 'Auto-adaptation based on learning')
                    .withOutcome(outcome)
                    .withMetadata({
                        confidence: attempt.confidence,
                        riskLevel: attempt.riskLevel,
                        policyId: attempt.policyId,
                    })
                    .withCreatedAt(attempt.timestamp)
                    .build()
            );
        }

        return readModels;
    }

    /**
     * Build audit trail from arbitration decisions.
     */
    private async buildFromArbitrationDecisions(query?: AuditTrailQuery): Promise<AuditTrailReadModel[]> {
        // Filter by type if specified and it's not arbitration
        if (query?.type && query.type !== 'arbitration') {
            return [];
        }

        const decisions = await this.decisionRepository.findAll();
        const readModels: AuditTrailReadModel[] = [];

        for (const decision of decisions) {
            // Filter by date if specified
            if (query?.since && decision.createdAt < query.since) {
                continue;
            }

            // Get winning proposal for agent info
            let agentType = 'unknown';
            if (decision.winningProposalId) {
                const proposal = await this.proposalRepository.findById(decision.winningProposalId);
                if (proposal) {
                    agentType = proposal.agentName;
                }
            } else if (decision.suppressedProposalIds.length > 0) {
                const proposal = await this.proposalRepository.findById(decision.suppressedProposalIds[0]);
                if (proposal) {
                    agentType = proposal.agentName;
                }
            }

            // Filter by agent type if specified
            if (query?.agentType && agentType !== query.agentType) {
                continue;
            }

            let outcome: AuditTrailReadModel['outcome'];
            if (decision.requiresHumanApproval) {
                outcome = 'escalated';
            } else if (decision.outcome === 'all_vetoed') {
                outcome = 'blocked';
            } else {
                outcome = 'success';
            }

            readModels.push(
                AuditTrailReadModelBuilder.create()
                    .withRecordId(decision.id)
                    .withType('arbitration')
                    .withAgentType(agentType)
                    .withTargetRef({
                        type: 'conflict',
                        id: decision.conflictId,
                    })
                    .withActionSummary(decision.reasoningSummary)
                    .withReason(`Arbitration using ${decision.strategyUsed} strategy`)
                    .withOutcome(outcome)
                    .withMetadata({
                        strategy: decision.strategyUsed,
                        policyId: decision.policyId,
                        suppressedCount: decision.suppressedProposalIds.length,
                        vetoedCount: decision.vetoedProposalIds.length,
                    })
                    .withCreatedAt(decision.createdAt)
                    .build()
            );
        }

        return readModels;
    }

    /**
     * Build audit trail for a specific agent.
     */
    async buildAuditTrailForAgent(agentType: string, limit?: number): Promise<AuditTrailReadModel[]> {
        return this.buildAllAuditTrailReadModels({ agentType, limit });
    }

    /**
     * Build audit trail by type.
     */
    async buildAuditTrailByType(type: AuditRecordType, limit?: number): Promise<AuditTrailReadModel[]> {
        return this.buildAllAuditTrailReadModels({ type, limit });
    }
}
