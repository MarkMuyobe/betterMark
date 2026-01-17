// Mock Prisma Client
import {
    Goal,
    SubGoal,
    Task,
    ScheduleBlock,
    JournalEntry,
    ActivityLog,
    AgentActionLogDb,
    DecisionRecordDb,
} from './types.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
class MockDelegate<T> {
    async findUnique(_args: any): Promise<T | null> { return null; }
    async findMany(_args?: any): Promise<T[]> { return []; }
    async create(args: any): Promise<T> { return args.data as T; }
    async update(args: any): Promise<T> { return args.data as T; }
    async delete(_args: any): Promise<T> { return {} as T; }
    async upsert(args: any): Promise<T> { return args.create as T; }
    async count(_args?: any): Promise<number> { return 0; }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export class PrismaClient {
    goal = new MockDelegate<Goal>();
    subGoal = new MockDelegate<SubGoal>();
    task = new MockDelegate<Task>();
    scheduleBlock = new MockDelegate<ScheduleBlock>();
    journalEntry = new MockDelegate<JournalEntry>();
    activityLog = new MockDelegate<ActivityLog>();
    agentActionLog = new MockDelegate<AgentActionLogDb>();
    decisionRecord = new MockDelegate<DecisionRecordDb>();

    async $queryRaw(_query: unknown): Promise<unknown> {
        return [1];
    }
}

export const prisma = new PrismaClient();
