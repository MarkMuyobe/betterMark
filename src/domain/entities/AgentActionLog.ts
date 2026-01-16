export type ReasoningSource = 'rule' | 'llm' | 'heuristic';

export interface IAgentActionLog {
    id: string;
    timestamp: Date;
    agentName: string;
    eventReceived: string; // e.g., 'GoalCompleted'
    eventAggregateId: string;
    reasoningSource: ReasoningSource;
    actionTaken: string; // Description of the action
    details?: any; // Optional structured data (e.g., the LLM prompt/response)
}
