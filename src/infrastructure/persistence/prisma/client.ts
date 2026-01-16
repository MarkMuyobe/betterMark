// Mock Prisma Client
import { Goal, SubGoal, Task, ScheduleBlock, JournalEntry, ActivityLog } from './types.js';

class MockDelegate<T> {
    async findUnique(args: any): Promise<T | null> { return null; }
    async findMany(args?: any): Promise<T[]> { return []; }
    async create(args: any): Promise<T> { return args.data as T; }
    async update(args: any): Promise<T> { return args.data as T; }
    async delete(args: any): Promise<T> { return {} as T; }
    async upsert(args: any): Promise<T> { return args.create as T; }
}

export class PrismaClient {
    goal = new MockDelegate<Goal>();
    subGoal = new MockDelegate<SubGoal>();
    task = new MockDelegate<Task>();
    scheduleBlock = new MockDelegate<ScheduleBlock>();
    journalEntry = new MockDelegate<JournalEntry>();
    activityLog = new MockDelegate<ActivityLog>();

    async $queryRaw(query: any): Promise<any> {
        return [1];
    }
}

export const prisma = new PrismaClient();
