/**
 * ScheduleProjectionService - V15 projection builder for schedules.
 *
 * Pure projection service with:
 * - No side effects
 * - No writes
 * - No domain mutation
 * - Idempotent operations
 */

import { IGoalRepository } from '../ports/IGoalRepository.js';
import { ISubGoalRepository } from '../ports/ISubGoalRepository.js';
import { ITaskRepository } from '../ports/ITaskRepository.js';
import { IScheduleRepository } from '../ports/IScheduleRepository.js';
import {
    ScheduleDayReadModel,
    ScheduleDayReadModelBuilder,
    ScheduleBlockReadModel,
    ScheduleBlockReadModelBuilder,
    ScheduleConflict,
    AvailableSlot,
} from '../read-models/ScheduleDayReadModel.js';

/**
 * Day boundaries for schedule calculation.
 */
export interface DayBoundaries {
    startHour: number;  // e.g., 6 for 6 AM
    endHour: number;    // e.g., 22 for 10 PM
}

/**
 * Default day boundaries.
 */
export const DEFAULT_DAY_BOUNDARIES: DayBoundaries = {
    startHour: 6,
    endHour: 22,
};

/**
 * Service for building schedule read models.
 */
export class ScheduleProjectionService {
    constructor(
        private readonly goalRepository: IGoalRepository,
        private readonly subGoalRepository: ISubGoalRepository,
        private readonly taskRepository: ITaskRepository,
        private readonly scheduleRepository: IScheduleRepository
    ) {}

    /**
     * Build schedule read model for a specific date.
     */
    async buildScheduleForDate(
        dateStr: string,  // YYYY-MM-DD
        boundaries: DayBoundaries = DEFAULT_DAY_BOUNDARIES
    ): Promise<ScheduleDayReadModel> {
        const date = new Date(dateStr);
        date.setHours(0, 0, 0, 0);

        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);

        // Get all schedule blocks
        const allBlocks = await this.scheduleRepository.findAll();

        // Filter blocks for this date
        const dayBlocks = allBlocks.filter(block => {
            const blockStart = new Date(block.timeRange.start);
            return blockStart >= date && blockStart < nextDay;
        });

        // Get all related data
        const allTasks = await this.taskRepository.findAll();
        const allSubGoals = await this.subGoalRepository.findAll();
        const allGoals = await this.goalRepository.findAll();

        // Create lookup maps
        const taskMap = new Map(allTasks.map(t => [t.id, t]));
        const subGoalMap = new Map(allSubGoals.map(sg => [sg.id, sg]));
        const goalMap = new Map(allGoals.map(g => [g.id, g]));

        // Build block read models
        const blockReadModels: ScheduleBlockReadModel[] = [];

        for (const block of dayBlocks) {
            const builder = ScheduleBlockReadModelBuilder.create()
                .withId(block.id)
                .withStartTime(block.timeRange.start.toISOString())
                .withEndTime(block.timeRange.end.toISOString())
                .withLabel(block.label)
                .withIsFixed(block.isFixed);

            // Add task context if linked
            if (block.taskId) {
                const task = taskMap.get(block.taskId);
                if (task) {
                    builder
                        .withTaskId(task.id)
                        .withTaskTitle(task.title)
                        .withTaskIsCompleted(task.isCompleted);

                    const subGoal = subGoalMap.get(task.subGoalId);
                    if (subGoal) {
                        const goal = goalMap.get(subGoal.goalId);
                        if (goal) {
                            builder
                                .withGoalId(goal.id)
                                .withGoalTitle(goal.title)
                                .withGoalFacet(goal.facet);
                        }
                    }
                }
            }

            blockReadModels.push(builder.build());
        }

        // Sort blocks by start time
        blockReadModels.sort((a, b) =>
            new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );

        // Detect conflicts
        const conflicts = this.detectConflicts(blockReadModels);

        // Calculate available slots
        const availableSlots = this.calculateAvailableSlots(
            blockReadModels,
            date,
            boundaries
        );

        // Calculate total scheduled time
        const totalScheduledMinutes = blockReadModels.reduce((sum, block) => {
            const start = new Date(block.startTime);
            const end = new Date(block.endTime);
            return sum + (end.getTime() - start.getTime()) / (1000 * 60);
        }, 0);

        // Calculate total available time
        const totalAvailableMinutes = availableSlots.reduce((sum, slot) =>
            sum + slot.durationMinutes, 0
        );

        return ScheduleDayReadModelBuilder.create()
            .withDate(dateStr)
            .withBlocks(blockReadModels)
            .withConflicts(conflicts)
            .withAvailableSlots(availableSlots)
            .withTotalScheduledMinutes(Math.round(totalScheduledMinutes))
            .withTotalAvailableMinutes(Math.round(totalAvailableMinutes))
            .build();
    }

    /**
     * Detect conflicts between schedule blocks.
     */
    private detectConflicts(blocks: ScheduleBlockReadModel[]): ScheduleConflict[] {
        const conflicts: ScheduleConflict[] = [];

        for (let i = 0; i < blocks.length; i++) {
            for (let j = i + 1; j < blocks.length; j++) {
                const block1 = blocks[i];
                const block2 = blocks[j];

                const start1 = new Date(block1.startTime);
                const end1 = new Date(block1.endTime);
                const start2 = new Date(block2.startTime);
                const end2 = new Date(block2.endTime);

                // Check for overlap
                if (start1 < end2 && end1 > start2) {
                    // Calculate overlap duration
                    const overlapStart = Math.max(start1.getTime(), start2.getTime());
                    const overlapEnd = Math.min(end1.getTime(), end2.getTime());
                    const overlapMinutes = Math.round(
                        (overlapEnd - overlapStart) / (1000 * 60)
                    );

                    conflicts.push({
                        blockId1: block1.id,
                        blockId2: block2.id,
                        overlapMinutes,
                        description: `"${block1.label}" overlaps with "${block2.label}" by ${overlapMinutes} minutes`,
                    });
                }
            }
        }

        return conflicts;
    }

    /**
     * Calculate available time slots.
     */
    private calculateAvailableSlots(
        blocks: ScheduleBlockReadModel[],
        date: Date,
        boundaries: DayBoundaries
    ): AvailableSlot[] {
        const slots: AvailableSlot[] = [];

        // Day start and end times
        const dayStart = new Date(date);
        dayStart.setHours(boundaries.startHour, 0, 0, 0);

        const dayEnd = new Date(date);
        dayEnd.setHours(boundaries.endHour, 0, 0, 0);

        // Sort blocks by start time
        const sortedBlocks = [...blocks].sort((a, b) =>
            new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );

        let currentTime = dayStart.getTime();

        for (const block of sortedBlocks) {
            const blockStart = new Date(block.startTime).getTime();
            const blockEnd = new Date(block.endTime).getTime();

            // If there's a gap before this block, add an available slot
            if (blockStart > currentTime && currentTime < dayEnd.getTime()) {
                const slotEnd = Math.min(blockStart, dayEnd.getTime());
                const durationMinutes = Math.round(
                    (slotEnd - currentTime) / (1000 * 60)
                );

                if (durationMinutes >= 15) {  // Only include slots >= 15 minutes
                    slots.push({
                        startTime: new Date(currentTime).toISOString(),
                        endTime: new Date(slotEnd).toISOString(),
                        durationMinutes,
                    });
                }
            }

            // Move current time past this block
            currentTime = Math.max(currentTime, blockEnd);
        }

        // Check for remaining time after last block
        if (currentTime < dayEnd.getTime()) {
            const durationMinutes = Math.round(
                (dayEnd.getTime() - currentTime) / (1000 * 60)
            );

            if (durationMinutes >= 15) {
                slots.push({
                    startTime: new Date(currentTime).toISOString(),
                    endTime: dayEnd.toISOString(),
                    durationMinutes,
                });
            }
        }

        return slots;
    }

    /**
     * Check if a time range has conflicts on a given date.
     */
    async checkConflicts(
        dateStr: string,
        startTime: string,
        endTime: string,
        excludeBlockId?: string
    ): Promise<{ hasConflict: boolean; conflictingBlocks: string[] }> {
        const schedule = await this.buildScheduleForDate(dateStr);

        const start = new Date(startTime).getTime();
        const end = new Date(endTime).getTime();

        const conflictingBlocks: string[] = [];

        for (const block of schedule.blocks) {
            if (excludeBlockId && block.id === excludeBlockId) continue;

            const blockStart = new Date(block.startTime).getTime();
            const blockEnd = new Date(block.endTime).getTime();

            if (start < blockEnd && end > blockStart) {
                conflictingBlocks.push(block.id);
            }
        }

        return {
            hasConflict: conflictingBlocks.length > 0,
            conflictingBlocks,
        };
    }

    /**
     * Find available slots that can fit a task of given duration.
     */
    async findSlotsForDuration(
        dateStr: string,
        durationMinutes: number,
        boundaries: DayBoundaries = DEFAULT_DAY_BOUNDARIES
    ): Promise<AvailableSlot[]> {
        const schedule = await this.buildScheduleForDate(dateStr, boundaries);
        return schedule.availableSlots.filter(slot =>
            slot.durationMinutes >= durationMinutes
        );
    }
}
