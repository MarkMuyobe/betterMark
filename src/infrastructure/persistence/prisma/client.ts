// Mock Prisma Client with In-Memory Storage
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

/**
 * Mock delegate with actual in-memory storage.
 */
class MockDelegate<T extends { id: string }> {
    private store: Map<string, T> = new Map();

    async findUnique(args: any): Promise<T | null> {
        const id = args?.where?.id;
        if (!id) return null;
        const record = this.store.get(id);
        return record ? { ...record } : null;
    }

    async findMany(_args?: any): Promise<T[]> {
        return Array.from(this.store.values()).map(r => ({ ...r }));
    }

    async create(args: any): Promise<T> {
        const record = { ...args.data } as T;
        this.store.set(record.id, record);
        return record;
    }

    async update(args: any): Promise<T> {
        const id = args?.where?.id;
        const existing = this.store.get(id);
        if (!existing) throw new Error(`Record not found: ${id}`);
        const updated = { ...existing, ...args.data } as T;
        this.store.set(id, updated);
        return updated;
    }

    async delete(args: any): Promise<T> {
        const id = args?.where?.id;
        const record = this.store.get(id);
        if (record) this.store.delete(id);
        return record ?? ({} as T);
    }

    async upsert(args: any): Promise<T> {
        const id = args?.where?.id;
        const existing = this.store.get(id);
        if (existing) {
            const updated = { ...existing, ...args.update } as T;
            this.store.set(id, updated);
            return updated;
        } else {
            const record = { ...args.create } as T;
            this.store.set(record.id, record);
            return record;
        }
    }

    async count(_args?: any): Promise<number> {
        return this.store.size;
    }

    // For testing: clear all data
    clear(): void {
        this.store.clear();
    }
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
