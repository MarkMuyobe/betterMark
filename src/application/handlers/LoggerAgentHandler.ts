import { IEventHandler } from '../ports/IEventDispatcher.js';
import { IDomainEvent } from '../../domain/events/IDomainEvent.js';
import { ILlmService } from '../ports/ILlmService.js';
import { IAgentActionLogRepository } from '../ports/IAgentActionLogRepository.js';
import { IAgentActionLog } from '../../domain/entities/AgentActionLog.js';
import { IdGenerator } from '../../shared/utils/IdGenerator.js';

export class LoggerAgentHandler implements IEventHandler<IDomainEvent> {
    constructor(
        private llmService: ILlmService,
        private actionLogRepository: IAgentActionLogRepository
    ) { }

    async handle(event: IDomainEvent): Promise<void> {
        const eventName = event.constructor.name;
        console.log(`[LoggerAgent] RAW: ${eventName} at ${event.dateTimeOccurred.toISOString()}`);

        // Log the action
        const actionLog: IAgentActionLog = {
            id: IdGenerator.generate(),
            timestamp: new Date(),
            agentName: 'LoggerAgent',
            eventReceived: eventName,
            eventAggregateId: event.getAggregateId(),
            reasoningSource: 'rule',
            actionTaken: `Logged event to console.`
        };
        await this.actionLogRepository.save(actionLog);
    }
}
