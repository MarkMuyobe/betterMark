/**
 * DecisionRecord - Audit trail for agent decisions.
 *
 * Tracks every decision made by an agent, including:
 * - The triggering event
 * - The decision content and reasoning source
 * - AI metadata (model, tokens, cost, latency)
 * - User outcome feedback (for learning)
 */

import { ReasoningSource } from './AgentActionLog.js';

/**
 * Types of decisions agents can make.
 */
export type DecisionType =
    | 'suggestion'
    | 'reschedule'
    | 'goal_adjustment'
    | 'notification'
    | 'task_creation'
    | 'activity_log';

/**
 * AI metadata for a decision.
 */
export interface IDecisionAIMetadata {
    model: string;
    confidence: number;
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
    latencyMs: number;
}

/**
 * Outcome tracking for a decision.
 */
export interface IDecisionOutcome {
    /** Whether the user accepted the suggestion */
    userAccepted: boolean | null;
    /** Optional user feedback */
    userFeedback?: string;
    /** What actually happened */
    actualResult?: string;
    /** When the outcome was recorded */
    recordedAt: Date;
}

/**
 * A decision record for analytics and auditing.
 */
export interface IDecisionRecord {
    id: string;
    timestamp: Date;

    // Source event
    triggeringEventType: string;
    triggeringEventId: string;
    aggregateType: string;
    aggregateId: string;

    // Decision details
    agentName: string;
    decisionType: DecisionType;
    reasoningSource: ReasoningSource;
    decisionContent: string;

    // AI metadata (null for rule-based decisions)
    aiMetadata?: IDecisionAIMetadata;

    // Outcome (populated later via feedback)
    outcome?: IDecisionOutcome;
}

/**
 * Builder for creating DecisionRecord entries.
 */
export class DecisionRecordBuilder {
    private record: Partial<IDecisionRecord> = {};

    static create(): DecisionRecordBuilder {
        return new DecisionRecordBuilder();
    }

    withId(id: string): this {
        this.record.id = id;
        return this;
    }

    withEvent(eventType: string, eventId: string): this {
        this.record.triggeringEventType = eventType;
        this.record.triggeringEventId = eventId;
        return this;
    }

    withAggregate(aggregateType: string, aggregateId: string): this {
        this.record.aggregateType = aggregateType;
        this.record.aggregateId = aggregateId;
        return this;
    }

    withDecision(
        agentName: string,
        decisionType: DecisionType,
        reasoningSource: ReasoningSource,
        content: string
    ): this {
        this.record.agentName = agentName;
        this.record.decisionType = decisionType;
        this.record.reasoningSource = reasoningSource;
        this.record.decisionContent = content;
        return this;
    }

    withAIMetadata(metadata: IDecisionAIMetadata): this {
        this.record.aiMetadata = metadata;
        return this;
    }

    withOutcome(outcome: IDecisionOutcome): this {
        this.record.outcome = outcome;
        return this;
    }

    build(): IDecisionRecord {
        if (!this.record.id || !this.record.agentName || !this.record.decisionContent) {
            throw new Error('DecisionRecord requires id, agentName, and decisionContent');
        }

        return {
            id: this.record.id,
            timestamp: new Date(),
            triggeringEventType: this.record.triggeringEventType ?? 'Unknown',
            triggeringEventId: this.record.triggeringEventId ?? '',
            aggregateType: this.record.aggregateType ?? 'Unknown',
            aggregateId: this.record.aggregateId ?? '',
            agentName: this.record.agentName,
            decisionType: this.record.decisionType ?? 'suggestion',
            reasoningSource: this.record.reasoningSource ?? 'rule',
            decisionContent: this.record.decisionContent,
            aiMetadata: this.record.aiMetadata,
            outcome: this.record.outcome,
        };
    }
}
