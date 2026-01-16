import { describe, it, expect, beforeEach } from 'vitest';
import { ScheduleTask } from '../implementation/ScheduleTask.js';
import { InMemoryScheduleRepository } from '../../../infrastructure/persistence/in-memory/InMemoryScheduleRepository.js';
import { InMemoryTaskRepository } from '../../../infrastructure/persistence/in-memory/InMemoryTaskRepository.js';
import { InMemoryEventDispatcher } from '../../../infrastructure/messaging/InMemoryEventDispatcher.js';
import { TimeRange } from '../../../domain/value-objects/TimeRange.js';
import { DifficultyProfile } from '../../../domain/enums/DifficultyProfile.js';
import { ScheduleConflictDetected } from '../../../domain/events/ScheduleConflictDetected.js';

describe('ScheduleTask Use Case', () => {
    let useCase: ScheduleTask;
    let scheduleRepo: InMemoryScheduleRepository;
    let taskRepo: InMemoryTaskRepository;
    let dispatcher: InMemoryEventDispatcher;

    beforeEach(async () => {
        scheduleRepo = new InMemoryScheduleRepository();
        taskRepo = new InMemoryTaskRepository();
        dispatcher = new InMemoryEventDispatcher();
        useCase = new ScheduleTask(scheduleRepo, taskRepo, dispatcher);

        await taskRepo.save({
            id: 't1', title: 'Task 1', isCompleted: false, difficulty: DifficultyProfile.Easy, subGoalId: 'sg1'
        });
    });

    it('should schedule a task successfully', async () => {
        const start = new Date('2026-01-17T10:00:00Z');
        const end = new Date('2026-01-17T11:00:00Z');
        await expect(useCase.execute('t1', start, end)).resolves.not.toThrow();
    });

    it('should emit ScheduleConflictDetected when blocked', async () => {
        const start = new Date('2026-01-17T10:00:00Z');
        const end = new Date('2026-01-17T11:00:00Z');

        await scheduleRepo.saveBlock({
            id: 'fixed-1', timeRange: new TimeRange(start, end), label: 'Meeting', isFixed: true, taskId: 'fixed-t'
        });

        let conflictEvent: ScheduleConflictDetected | undefined;
        dispatcher.subscribe('ScheduleConflictDetected', {
            handle: async (e: ScheduleConflictDetected) => {
                conflictEvent = e;
            }
        });

        const newStart = new Date('2026-01-17T10:30:00Z');
        const newEnd = new Date('2026-01-17T11:30:00Z');

        await expect(useCase.execute('t1', newStart, newEnd))
            .rejects.toThrow('Cannot schedule over an existing fixed block');

        expect(conflictEvent).toBeDefined();
        expect(conflictEvent?.conflictingBlockId).toBe('fixed-1');
    });
});
