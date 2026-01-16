import { IAgentActionLog } from '../../domain/entities/AgentActionLog.js';

export interface IAgentActionLogRepository {
    save(log: IAgentActionLog): Promise<void>;
    findAll(): Promise<IAgentActionLog[]>;
    findByAgent(agentName: string): Promise<IAgentActionLog[]>;
}
