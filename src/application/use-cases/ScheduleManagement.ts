import { IScheduleBlock } from '../../domain/entities/ScheduleBlock.js';

export interface IScheduleManagementUseCase {
    /**
     * Recalculates the schedule based on current priorities and constraints.
     * @returns Updated list of schedule blocks
     */
    recalculateSchedule(): Promise<IScheduleBlock[]>;
}
