export type ReasoningSource = 'rule' | 'llm' | 'heuristic' | 'fallback';

/**
 * Governance metadata for AI-driven actions
 */
export interface IAgentGovernanceMetadata {
    /** Policy that was applied */
    policyName: string;
    /** Whether AI was used for this action */
    aiUsed: boolean;
    /** Confidence score of the response (0.0 to 1.0) */
    confidence: number;
    /** Latency of AI call in milliseconds */
    latencyMs: number;
    /** Cost in USD (if applicable) */
    costUsd: number;
    /** Model used for generation */
    model: string;
    /** Whether a fallback was triggered */
    fallbackTriggered: boolean;
    /** Reason for fallback (if applicable) */
    fallbackReason?: string;
    /** Token usage */
    tokens?: {
        prompt: number;
        completion: number;
        total: number;
    };
}

export interface IAgentActionLog {
    id: string;
    timestamp: Date;
    agentName: string;
    eventReceived: string; // e.g., 'GoalCompleted'
    eventAggregateId: string;
    reasoningSource: ReasoningSource;
    actionTaken: string; // Description of the action
    details?: any; // Optional structured data (e.g., the LLM prompt/response)

    // V6 Governance fields
    governance?: IAgentGovernanceMetadata;
}

/**
 * Builder for creating AgentActionLog entries with governance metadata.
 */
export class AgentActionLogBuilder {
    private log: Partial<IAgentActionLog> = {};

    static create(): AgentActionLogBuilder {
        return new AgentActionLogBuilder();
    }

    withId(id: string): this {
        this.log.id = id;
        return this;
    }

    withAgent(agentName: string): this {
        this.log.agentName = agentName;
        return this;
    }

    withEvent(eventReceived: string, aggregateId: string): this {
        this.log.eventReceived = eventReceived;
        this.log.eventAggregateId = aggregateId;
        return this;
    }

    withReasoning(source: ReasoningSource, action: string): this {
        this.log.reasoningSource = source;
        this.log.actionTaken = action;
        return this;
    }

    withDetails(details: any): this {
        this.log.details = details;
        return this;
    }

    withGovernance(governance: IAgentGovernanceMetadata): this {
        this.log.governance = governance;
        return this;
    }

    build(): IAgentActionLog {
        if (!this.log.id || !this.log.agentName || !this.log.eventReceived || !this.log.eventAggregateId) {
            throw new Error('AgentActionLog requires id, agentName, eventReceived, and eventAggregateId');
        }

        return {
            id: this.log.id,
            timestamp: new Date(),
            agentName: this.log.agentName,
            eventReceived: this.log.eventReceived,
            eventAggregateId: this.log.eventAggregateId,
            reasoningSource: this.log.reasoningSource ?? 'rule',
            actionTaken: this.log.actionTaken ?? 'No action recorded',
            details: this.log.details,
            governance: this.log.governance,
        };
    }
}
