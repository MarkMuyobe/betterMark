import { IAgentActionLogRepository } from '../../../application/ports/IAgentActionLogRepository.js';
import { IAgentActionLog } from '../../../domain/entities/AgentActionLog.js';

export class InMemoryAgentActionLogRepository implements IAgentActionLogRepository {
    private logs: IAgentActionLog[] = [];

    async save(log: IAgentActionLog): Promise<void> {
        this.logs.push(log);
    }

    async findAll(): Promise<IAgentActionLog[]> {
        return [...this.logs];
    }

    async findByAgent(agentName: string): Promise<IAgentActionLog[]> {
        return this.logs.filter(l => l.agentName === agentName);
    }
}
