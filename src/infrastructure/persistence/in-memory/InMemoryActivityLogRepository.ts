/**
 * InMemoryActivityLogRepository - V15 In-memory activity log storage.
 */

import { IActivityLog } from '../../../domain/entities/ActivityLog.js';
import { IActivityLogRepository } from '../../../application/projections/ActivityProjectionService.js';

/**
 * In-memory implementation of activity log repository.
 */
export class InMemoryActivityLogRepository implements IActivityLogRepository {
    private logs: Map<string, IActivityLog> = new Map();

    async findAll(): Promise<IActivityLog[]> {
        return Array.from(this.logs.values());
    }

    async findById(id: string): Promise<IActivityLog | null> {
        return this.logs.get(id) ?? null;
    }

    async save(log: IActivityLog): Promise<void> {
        this.logs.set(log.id, { ...log });
    }

    async delete(id: string): Promise<void> {
        this.logs.delete(id);
    }

    /**
     * Find logs by task ID.
     */
    async findByTaskId(taskId: string): Promise<IActivityLog[]> {
        return Array.from(this.logs.values()).filter(l => l.taskId === taskId);
    }

    /**
     * Find logs by goal ID.
     */
    async findByGoalId(goalId: string): Promise<IActivityLog[]> {
        return Array.from(this.logs.values()).filter(l => l.goalId === goalId);
    }

    /**
     * Find logs in a date range.
     */
    async findByDateRange(from: Date, to: Date): Promise<IActivityLog[]> {
        return Array.from(this.logs.values()).filter(l =>
            l.timestamp >= from && l.timestamp <= to
        );
    }

    /**
     * Clear all logs (for testing).
     */
    clear(): void {
        this.logs.clear();
    }
}
