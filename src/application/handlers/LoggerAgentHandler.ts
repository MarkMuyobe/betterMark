import { IEventHandler } from '../ports/IEventDispatcher.js';
import { IDomainEvent } from '../../domain/events/IDomainEvent.js';
import { ILlmService } from '../ports/ILlmService.js';
import { IAgentActionLogRepository } from '../ports/IAgentActionLogRepository.js';
import { IAgentLearningRepository } from '../ports/IAgentLearningRepository.js';
import { IAgentActionLog } from '../../domain/entities/AgentActionLog.js';
import { AgentLearningProfileUtils } from '../../domain/entities/AgentLearningProfile.js';
import { IdGenerator } from '../../shared/utils/IdGenerator.js';
import { AgentGovernanceService, DecisionEventInfo } from '../services/AgentGovernanceService.js';
import { SummarizationDepth } from '../../domain/value-objects/PreferenceTypes.js';

const AGENT_NAME = 'LoggerAgent';

/**
 * Formatters for different summarization depths.
 */
const DEPTH_FORMATTERS: Record<SummarizationDepth, (event: IDomainEvent) => string> = {
    minimal: (event) => {
        return `${event.constructor.name}`;
    },
    standard: (event) => {
        return `${event.constructor.name} at ${event.dateTimeOccurred.toISOString()}`;
    },
    detailed: (event) => {
        const eventData = JSON.stringify(event, null, 2);
        return `${event.constructor.name} at ${event.dateTimeOccurred.toISOString()}\nPayload: ${eventData}`;
    },
};

export class LoggerAgentHandler implements IEventHandler<IDomainEvent> {
    constructor(
        private llmService: ILlmService,
        private actionLogRepository: IAgentActionLogRepository,
        private learningRepository?: IAgentLearningRepository,
        private governanceService?: AgentGovernanceService
    ) { }

    /**
     * Read preferred summarization depth from learning profile.
     */
    private async getPreferredSummarizationDepth(): Promise<SummarizationDepth> {
        if (!this.learningRepository) return 'standard';

        const profile = await this.learningRepository.findByAgentName(AGENT_NAME);
        if (!profile) return 'standard';

        return AgentLearningProfileUtils.getPreference<SummarizationDepth>(
            profile,
            'logging',
            'summarization_depth',
            'standard'
        );
    }

    async handle(event: IDomainEvent): Promise<void> {
        const eventName = event.constructor.name;

        // Read preferred summarization depth from learning profile
        const depth = await this.getPreferredSummarizationDepth();
        const formatter = DEPTH_FORMATTERS[depth];
        const formattedOutput = formatter(event);

        console.log(`[${AGENT_NAME}] [${depth}] ${formattedOutput}`);

        const actionContent = `Logged event (${depth} depth)`;

        // V8: Create decision record for feedback capture
        let decisionRecordId: string | undefined;
        if (this.governanceService) {
            const eventId = `${event.getAggregateId()}-${event.dateTimeOccurred.getTime()}`;
            const decisionEventInfo: DecisionEventInfo = {
                triggeringEventType: eventName,
                triggeringEventId: eventId,
                aggregateType: 'Event',
                aggregateId: event.getAggregateId(),
                decisionType: 'activity_log',
            };

            decisionRecordId = await this.governanceService.createDecisionRecord(
                AGENT_NAME,
                actionContent,
                'rule',
                decisionEventInfo
            );
        }

        // Log the action with depth information
        const actionLog: IAgentActionLog = {
            id: IdGenerator.generate(),
            timestamp: new Date(),
            agentName: AGENT_NAME,
            eventReceived: eventName,
            eventAggregateId: event.getAggregateId(),
            reasoningSource: 'rule',
            actionTaken: actionContent,
            details: {
                summarizationDepth: depth,
                outputLength: formattedOutput.length,
                decisionRecordId, // V8: Link to decision record
            }
        };
        await this.actionLogRepository.save(actionLog);
    }
}
