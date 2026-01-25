/**
 * ActivityProjectionService - V15 projection builder for activity and journal.
 *
 * Pure projection service with:
 * - No side effects
 * - No writes
 * - No domain mutation
 * - Idempotent operations
 */

import { IGoalRepository } from '../ports/IGoalRepository.js';
import { ITaskRepository } from '../ports/ITaskRepository.js';
import {
    ActivityLogReadModel,
    ActivityLogReadModelBuilder,
    JournalEntryReadModel,
    JournalEntryReadModelBuilder,
} from '../read-models/ActivityLogReadModel.js';
import { IActivityLog } from '../../domain/entities/ActivityLog.js';
import { IJournalEntry } from '../../domain/entities/JournalEntry.js';

/**
 * Activity log repository interface.
 */
export interface IActivityLogRepository {
    findAll(): Promise<IActivityLog[]>;
    findById(id: string): Promise<IActivityLog | null>;
    save(log: IActivityLog): Promise<void>;
}

/**
 * Journal entry repository interface.
 */
export interface IJournalEntryRepository {
    findAll(): Promise<IJournalEntry[]>;
    findById(id: string): Promise<IJournalEntry | null>;
    save(entry: IJournalEntry): Promise<void>;
}

/**
 * Filter options for activity logs.
 */
export interface ActivityFilterOptions {
    type?: ActivityLogReadModel['type'];
    dateFrom?: Date;
    dateTo?: Date;
    goalId?: string;
    taskId?: string;
}

/**
 * Filter options for journal entries.
 */
export interface JournalFilterOptions {
    dateFrom?: Date;
    dateTo?: Date;
    tags?: string[];
}

/**
 * Service for building activity and journal read models.
 */
export class ActivityProjectionService {
    constructor(
        private readonly goalRepository: IGoalRepository,
        private readonly taskRepository: ITaskRepository,
        private readonly activityLogRepository: IActivityLogRepository,
        private readonly journalEntryRepository: IJournalEntryRepository
    ) {}

    /**
     * Build all activity log read models.
     */
    async buildAllActivityLogReadModels(
        filters?: ActivityFilterOptions
    ): Promise<ActivityLogReadModel[]> {
        const allLogs = await this.activityLogRepository.findAll();
        const allTasks = await this.taskRepository.findAll();
        const allGoals = await this.goalRepository.findAll();

        // Create lookup maps
        const taskMap = new Map(allTasks.map(t => [t.id, t]));
        const goalMap = new Map(allGoals.map(g => [g.id, g]));

        const readModels: ActivityLogReadModel[] = [];

        for (const log of allLogs) {
            // Determine type
            const type = this.determineActivityType(log);

            // Apply filters
            if (filters?.type && type !== filters.type) {
                continue;
            }
            if (filters?.dateFrom && log.timestamp < filters.dateFrom) {
                continue;
            }
            if (filters?.dateTo && log.timestamp > filters.dateTo) {
                continue;
            }
            if (filters?.goalId && log.goalId !== filters.goalId) {
                continue;
            }
            if (filters?.taskId && log.taskId !== filters.taskId) {
                continue;
            }

            // Get task and goal context
            let taskTitle: string | undefined;
            let goalTitle: string | undefined;
            let goalId = log.goalId;

            if (log.taskId) {
                const task = taskMap.get(log.taskId);
                if (task) {
                    taskTitle = task.title;
                }
            }

            if (goalId) {
                const goal = goalMap.get(goalId);
                if (goal) {
                    goalTitle = goal.title;
                }
            }

            readModels.push(
                ActivityLogReadModelBuilder.create()
                    .withId(log.id)
                    .withType(type)
                    .withDescription(log.description)
                    .withTimestamp(log.timestamp)
                    .withDurationMinutes(log.durationMinutes)
                    .withTaskId(log.taskId)
                    .withTaskTitle(taskTitle)
                    .withGoalId(goalId)
                    .withGoalTitle(goalTitle)
                    .build()
            );
        }

        // Sort by timestamp descending (most recent first)
        readModels.sort((a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        return readModels;
    }

    /**
     * Build all journal entry read models.
     */
    async buildAllJournalEntryReadModels(
        filters?: JournalFilterOptions
    ): Promise<JournalEntryReadModel[]> {
        const allEntries = await this.journalEntryRepository.findAll();

        const readModels: JournalEntryReadModel[] = [];

        for (const entry of allEntries) {
            // Apply filters
            if (filters?.dateFrom && entry.date < filters.dateFrom) {
                continue;
            }
            if (filters?.dateTo && entry.date > filters.dateTo) {
                continue;
            }
            if (filters?.tags && filters.tags.length > 0) {
                const hasTag = filters.tags.some(tag =>
                    entry.tags.includes(tag)
                );
                if (!hasTag) continue;
            }

            readModels.push(
                JournalEntryReadModelBuilder.create()
                    .withId(entry.id)
                    .withContent(entry.content)
                    .withDate(entry.date)
                    .withTags(entry.tags)
                    .withImageUrls(entry.imageUrls)
                    .withAudioUrls(entry.audioUrls)
                    .withCreatedAt(entry.createdAt)
                    .build()
            );
        }

        // Sort by date descending (most recent first)
        readModels.sort((a, b) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
        );

        return readModels;
    }

    /**
     * Build activity log for a specific date.
     */
    async buildActivityForDate(dateStr: string): Promise<ActivityLogReadModel[]> {
        const date = new Date(dateStr);
        date.setHours(0, 0, 0, 0);

        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);

        return this.buildAllActivityLogReadModels({
            dateFrom: date,
            dateTo: nextDay,
        });
    }

    /**
     * Build journal entry for a specific date.
     */
    async buildJournalForDate(dateStr: string): Promise<JournalEntryReadModel | null> {
        const entries = await this.buildAllJournalEntryReadModels();
        return entries.find(e => e.date === dateStr) ?? null;
    }

    /**
     * Build activity summary for a date range.
     */
    async buildActivitySummary(dateFrom: Date, dateTo: Date): Promise<{
        totalActivities: number;
        totalMinutes: number;
        taskCompletions: number;
        goalCompletions: number;
    }> {
        const activities = await this.buildAllActivityLogReadModels({
            dateFrom,
            dateTo,
        });

        return {
            totalActivities: activities.length,
            totalMinutes: activities.reduce((sum, a) =>
                sum + (a.durationMinutes ?? 0), 0
            ),
            taskCompletions: activities.filter(a =>
                a.type === 'task_completed'
            ).length,
            goalCompletions: activities.filter(a =>
                a.type === 'goal_completed'
            ).length,
        };
    }

    /**
     * Determine activity type from log data.
     */
    private determineActivityType(log: IActivityLog): ActivityLogReadModel['type'] {
        // Check description for type hints
        const desc = log.description.toLowerCase();

        if (desc.includes('completed task') || desc.includes('task completed')) {
            return 'task_completed';
        }
        if (desc.includes('completed goal') || desc.includes('goal completed')) {
            return 'goal_completed';
        }
        if (desc.includes('scheduled') || desc.includes('schedule')) {
            return 'task_scheduled';
        }

        return 'manual_log';
    }
}
