/**
 * ConflictDetectionService - V11 service for detecting conflicts between proposals.
 *
 * Analyzes pending proposals to identify conflicts that require arbitration.
 * Conflicts are detected based on:
 * - Same target (multiple proposals targeting the same resource)
 * - Mutually exclusive values (different proposed values for same key)
 * - Resource competition (multiple agents competing for limited resources)
 * - Invariant violations (combinations that break business rules)
 */

import { IAgentProposalRepository } from '../ports/IAgentProposalRepository.js';
import { IdGenerator } from '../../shared/utils/IdGenerator.js';
import { IConflictRepository } from '../ports/IConflictRepository.js';
import { IEventDispatcher } from '../ports/IEventDispatcher.js';
import { IObservabilityContext } from '../ports/IObservabilityContext.js';
import { IAgentActionProposal, AgentActionProposalUtils } from '../../domain/entities/AgentActionProposal.js';
import { IConflict, ConflictBuilder } from '../../domain/entities/ArbitrationDecision.js';
import { AgentConflictDetected, ConflictDetails } from '../../domain/events/AgentConflictDetected.js';

/**
 * Result of conflict detection.
 */
export interface ConflictDetectionResult {
    /** Conflicts detected */
    conflicts: IConflict[];
    /** Proposals with no conflict (can proceed directly) */
    unconflictedProposals: IAgentActionProposal[];
}

/**
 * Service for detecting conflicts between proposals.
 */
export class ConflictDetectionService {
    constructor(
        private readonly proposalRepository: IAgentProposalRepository,
        private readonly conflictRepository: IConflictRepository,
        private readonly eventDispatcher: IEventDispatcher,
        private readonly observability: IObservabilityContext
    ) {}

    /**
     * Detect conflicts among all pending proposals.
     */
    async detectConflicts(): Promise<ConflictDetectionResult> {
        const pendingProposals = await this.proposalRepository.findPending();

        this.observability.logger.debug('Detecting conflicts', {
            pendingCount: pendingProposals.length,
        });

        if (pendingProposals.length === 0) {
            return { conflicts: [], unconflictedProposals: [] };
        }

        // Group proposals by target
        const groupedByTarget = this.groupByTarget(pendingProposals);

        const conflicts: IConflict[] = [];
        const conflictedProposalIds = new Set<string>();
        const unconflictedProposals: IAgentActionProposal[] = [];

        // Analyze each group for conflicts
        for (const [_targetKey, proposals] of groupedByTarget) {
            if (proposals.length === 1) {
                // No conflict - single proposal
                unconflictedProposals.push(proposals[0]);
                continue;
            }

            // Multiple proposals for same target = conflict
            const conflict = await this.createConflict(proposals);
            conflicts.push(conflict);

            for (const proposal of proposals) {
                conflictedProposalIds.add(proposal.id);
            }
        }

        this.observability.logger.info('Conflict detection complete', {
            conflictsDetected: conflicts.length,
            unconflictedCount: unconflictedProposals.length,
        });

        this.observability.metrics.setGauge('conflicts.pending', conflicts.length);

        return { conflicts, unconflictedProposals };
    }

    /**
     * Detect conflicts for proposals related to a specific event.
     */
    async detectConflictsForEvent(eventId: string): Promise<ConflictDetectionResult> {
        const proposals = await this.proposalRepository.findByOriginatingEvent(eventId);
        const pendingProposals = proposals.filter((p) => p.status === 'pending');

        if (pendingProposals.length <= 1) {
            return {
                conflicts: [],
                unconflictedProposals: pendingProposals,
            };
        }

        // Check for conflicts among these proposals
        const groupedByTarget = this.groupByTarget(pendingProposals);

        const conflicts: IConflict[] = [];
        const unconflictedProposals: IAgentActionProposal[] = [];

        for (const [_targetKey, proposals] of groupedByTarget) {
            if (proposals.length === 1) {
                unconflictedProposals.push(proposals[0]);
            } else {
                const conflict = await this.createConflict(proposals);
                conflicts.push(conflict);
            }
        }

        return { conflicts, unconflictedProposals };
    }

    /**
     * Group proposals by their target.
     */
    private groupByTarget(proposals: IAgentActionProposal[]): Map<string, IAgentActionProposal[]> {
        const grouped = new Map<string, IAgentActionProposal[]>();

        for (const proposal of proposals) {
            const key = this.getTargetKey(proposal);
            const existing = grouped.get(key) ?? [];
            existing.push(proposal);
            grouped.set(key, existing);
        }

        return grouped;
    }

    /**
     * Get a unique key for the proposal's target.
     */
    private getTargetKey(proposal: IAgentActionProposal): string {
        const { type, id, key } = proposal.targetRef;
        return key ? `${type}:${id}:${key}` : `${type}:${id}`;
    }

    /**
     * Create a conflict from a set of conflicting proposals.
     */
    private async createConflict(proposals: IAgentActionProposal[]): Promise<IConflict> {
        const conflictType = this.determineConflictType(proposals);
        const conflictId = IdGenerator.generate();
        const firstProposal = proposals[0];

        const conflict = ConflictBuilder.create()
            .withId(conflictId)
            .withProposals(proposals.map((p) => p.id))
            .withType(conflictType)
            .withDescription(this.generateConflictDescription(proposals, conflictType))
            .withTarget({
                type: firstProposal.targetRef.type,
                id: firstProposal.targetRef.id,
                key: firstProposal.targetRef.key,
            })
            .build();

        // Save conflict
        await this.conflictRepository.save(conflict);

        // Emit event
        const conflictDetails: ConflictDetails = {
            conflictingAgents: [...new Set(proposals.map((p) => p.agentName))],
            targetAggregateId: firstProposal.targetRef.id,
            targetAggregateType: firstProposal.targetRef.type,
            conflictType: this.mapToEventConflictType(conflictType),
            proposedActions: proposals.map((p) => ({
                proposalId: p.id,
                agentName: p.agentName,
                action: {
                    type: 'update_goal' as const,
                    targetAggregateId: p.targetRef.id,
                    targetAggregateType: p.targetRef.type,
                    payload: { value: p.proposedValue, key: p.targetRef.key },
                },
                timestamp: p.createdAt,
            })),
        };

        await this.eventDispatcher.dispatch(
            new AgentConflictDetected(conflictDetails, conflictId)
        );

        this.observability.logger.info('Conflict created', {
            conflictId,
            conflictType,
            proposalCount: proposals.length,
            agents: conflictDetails.conflictingAgents,
        });

        this.observability.metrics.incrementCounter('conflict.detected', 1, {
            type: conflictType,
        });

        return conflict;
    }

    /**
     * Determine the type of conflict.
     */
    private determineConflictType(
        proposals: IAgentActionProposal[]
    ): IConflict['conflictType'] {
        // Check if all proposals have the same value (same_target but not mutually exclusive)
        const values = proposals.map((p) => JSON.stringify(p.proposedValue));
        const uniqueValues = new Set(values);

        if (uniqueValues.size === 1) {
            // Same value proposed by multiple agents - still a conflict for arbitration
            return 'same_target';
        }

        // Different values = mutually exclusive
        if (uniqueValues.size > 1) {
            return 'mutually_exclusive';
        }

        // Default
        return 'same_target';
    }

    /**
     * Generate a description for the conflict.
     */
    private generateConflictDescription(
        proposals: IAgentActionProposal[],
        conflictType: IConflict['conflictType']
    ): string {
        const agents = [...new Set(proposals.map((p) => p.agentName))];
        const target = proposals[0].targetRef;

        switch (conflictType) {
            case 'mutually_exclusive':
                return `Agents ${agents.join(', ')} proposed different values for ${target.type}:${target.id}${target.key ? `:${target.key}` : ''}`;
            case 'same_target':
                return `Agents ${agents.join(', ')} are competing to modify ${target.type}:${target.id}${target.key ? `:${target.key}` : ''}`;
            case 'resource_competition':
                return `Resource competition between ${agents.join(', ')} for ${target.type}:${target.id}`;
            case 'invariant_violation':
                return `Combined proposals from ${agents.join(', ')} would violate invariants`;
            default:
                return `Conflict between ${agents.join(', ')}`;
        }
    }

    /**
     * Map internal conflict type to event conflict type.
     */
    private mapToEventConflictType(
        conflictType: IConflict['conflictType']
    ): import('../../domain/events/AgentConflictDetected.js').ConflictType {
        switch (conflictType) {
            case 'same_target':
                return 'concurrent_modification';
            case 'mutually_exclusive':
                return 'contradicting_advice';
            case 'resource_competition':
                return 'resource_contention';
            case 'invariant_violation':
                return 'concurrent_modification';
            default:
                return 'concurrent_modification';
        }
    }
}
