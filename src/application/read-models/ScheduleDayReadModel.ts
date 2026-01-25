/**
 * ScheduleDayReadModel - V15 Day schedule read model.
 *
 * Contains day view with schedule blocks and conflict information.
 */

import { Facet } from '../../domain/enums/Facet.js';

/**
 * Schedule block read model.
 */
export interface ScheduleBlockReadModel {
    id: string;
    startTime: string;  // ISO datetime
    endTime: string;    // ISO datetime
    label: string;
    isFixed: boolean;

    // Linked task info (if applicable)
    taskId?: string;
    taskTitle?: string;
    taskIsCompleted?: boolean;
    goalId?: string;
    goalTitle?: string;
    goalFacet?: Facet;
}

/**
 * Schedule conflict.
 */
export interface ScheduleConflict {
    blockId1: string;
    blockId2: string;
    overlapMinutes: number;
    description: string;
}

/**
 * Available time slot for scheduling.
 */
export interface AvailableSlot {
    startTime: string;
    endTime: string;
    durationMinutes: number;
}

/**
 * Day schedule read model.
 */
export interface ScheduleDayReadModel {
    date: string;  // YYYY-MM-DD
    blocks: ScheduleBlockReadModel[];
    conflicts: ScheduleConflict[];
    availableSlots: AvailableSlot[];
    totalScheduledMinutes: number;
    totalAvailableMinutes: number;
}

/**
 * Builder for ScheduleDayReadModel.
 */
export class ScheduleDayReadModelBuilder {
    private model: Partial<ScheduleDayReadModel> = {};

    private constructor() {}

    static create(): ScheduleDayReadModelBuilder {
        return new ScheduleDayReadModelBuilder();
    }

    withDate(date: string): this {
        this.model.date = date;
        return this;
    }

    withBlocks(blocks: ScheduleBlockReadModel[]): this {
        this.model.blocks = blocks;
        return this;
    }

    withConflicts(conflicts: ScheduleConflict[]): this {
        this.model.conflicts = conflicts;
        return this;
    }

    withAvailableSlots(slots: AvailableSlot[]): this {
        this.model.availableSlots = slots;
        return this;
    }

    withTotalScheduledMinutes(minutes: number): this {
        this.model.totalScheduledMinutes = minutes;
        return this;
    }

    withTotalAvailableMinutes(minutes: number): this {
        this.model.totalAvailableMinutes = minutes;
        return this;
    }

    build(): ScheduleDayReadModel {
        if (!this.model.date) throw new Error('date is required');

        return {
            date: this.model.date,
            blocks: this.model.blocks ?? [],
            conflicts: this.model.conflicts ?? [],
            availableSlots: this.model.availableSlots ?? [],
            totalScheduledMinutes: this.model.totalScheduledMinutes ?? 0,
            totalAvailableMinutes: this.model.totalAvailableMinutes ?? 0,
        };
    }
}

/**
 * Builder for ScheduleBlockReadModel.
 */
export class ScheduleBlockReadModelBuilder {
    private model: Partial<ScheduleBlockReadModel> = {};

    private constructor() {}

    static create(): ScheduleBlockReadModelBuilder {
        return new ScheduleBlockReadModelBuilder();
    }

    withId(id: string): this {
        this.model.id = id;
        return this;
    }

    withStartTime(startTime: string): this {
        this.model.startTime = startTime;
        return this;
    }

    withEndTime(endTime: string): this {
        this.model.endTime = endTime;
        return this;
    }

    withLabel(label: string): this {
        this.model.label = label;
        return this;
    }

    withIsFixed(isFixed: boolean): this {
        this.model.isFixed = isFixed;
        return this;
    }

    withTaskId(taskId?: string): this {
        this.model.taskId = taskId;
        return this;
    }

    withTaskTitle(taskTitle?: string): this {
        this.model.taskTitle = taskTitle;
        return this;
    }

    withTaskIsCompleted(isCompleted?: boolean): this {
        this.model.taskIsCompleted = isCompleted;
        return this;
    }

    withGoalId(goalId?: string): this {
        this.model.goalId = goalId;
        return this;
    }

    withGoalTitle(goalTitle?: string): this {
        this.model.goalTitle = goalTitle;
        return this;
    }

    withGoalFacet(facet?: Facet): this {
        this.model.goalFacet = facet;
        return this;
    }

    build(): ScheduleBlockReadModel {
        if (!this.model.id) throw new Error('id is required');
        if (!this.model.startTime) throw new Error('startTime is required');
        if (!this.model.endTime) throw new Error('endTime is required');
        if (!this.model.label) throw new Error('label is required');

        return {
            id: this.model.id,
            startTime: this.model.startTime,
            endTime: this.model.endTime,
            label: this.model.label,
            isFixed: this.model.isFixed ?? false,
            taskId: this.model.taskId,
            taskTitle: this.model.taskTitle,
            taskIsCompleted: this.model.taskIsCompleted,
            goalId: this.model.goalId,
            goalTitle: this.model.goalTitle,
            goalFacet: this.model.goalFacet,
        };
    }
}
