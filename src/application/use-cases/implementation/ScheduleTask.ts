import { IScheduleRepository } from '../../ports/IScheduleRepository.js';
import { ITaskRepository } from '../../ports/ITaskRepository.js';
import { IEventDispatcher } from '../../ports/IEventDispatcher.js';
import { IScheduleBlock } from '../../../domain/entities/ScheduleBlock.js';
import { TimeRange } from '../../../domain/value-objects/TimeRange.js';
import { IdGenerator } from '../../../shared/utils/IdGenerator.js';
import { ScheduleConflictDetected } from '../../../domain/events/ScheduleConflictDetected.js';

export class ScheduleTask {
    constructor(
        private scheduleRepository: IScheduleRepository,
        private taskRepository: ITaskRepository,
        private eventDispatcher: IEventDispatcher
    ) { }

    async execute(
        taskId: string,
        startTime: Date,
        endTime: Date,
        isFixed: boolean = false
    ): Promise<IScheduleBlock> {
        // 1. Validate Time Range
        if (startTime >= endTime) {
            throw new Error("Start time must be before end time");
        }

        // 2. Validate Task Existence
        const task = await this.taskRepository.findById(taskId);
        if (!task) {
            throw new Error(`Task ${taskId} not found`);
        }

        const timeRange = new TimeRange(startTime, endTime);

        // 3. Check Constraints
        const existingBlocks = await this.scheduleRepository.getBlocksSafe(timeRange);

        // Find FIRST fixed conflict
        const conflictBlock = existingBlocks.find(b =>
            b.isFixed && b.timeRange.overlaps(timeRange)
        );

        if (conflictBlock) {
            // Emit Conflict Event
            await this.eventDispatcher.dispatch(new ScheduleConflictDetected(
                taskId,
                timeRange,
                conflictBlock.id
            ));

            throw new Error("Cannot schedule over an existing fixed block");
        }

        // 4. Create and Save Block
        const newBlock: IScheduleBlock = {
            id: IdGenerator.generate(),
            timeRange: timeRange,
            label: task.title,
            isFixed: isFixed,
            taskId: taskId
        };

        await this.scheduleRepository.saveBlock(newBlock);
        return newBlock;
    }
}
