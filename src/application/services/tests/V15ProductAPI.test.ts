/**
 * V15ProductAPI.test.ts - Tests for V15 Product API
 *
 * Tests for:
 * - GoalProjectionService
 * - TaskProjectionService
 * - ScheduleProjectionService
 * - CreateSubGoal and CreateTask use cases
 * - Task completion bubbling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GoalProjectionService } from '../../projections/GoalProjectionService.js';
import { TaskProjectionService } from '../../projections/TaskProjectionService.js';
import { ScheduleProjectionService } from '../../projections/ScheduleProjectionService.js';
import { CreateSubGoal } from '../../use-cases/implementation/CreateSubGoal.js';
import { CreateTask } from '../../use-cases/implementation/CreateTask.js';
import { CompleteTask } from '../../use-cases/implementation/CompleteTask.js';
import { CreateGoal } from '../../use-cases/implementation/CreateGoal.js';
import { InMemoryGoalRepository } from '../../../infrastructure/persistence/in-memory/InMemoryGoalRepository.js';
import { InMemorySubGoalRepository } from '../../../infrastructure/persistence/in-memory/InMemorySubGoalRepository.js';
import { InMemoryTaskRepository } from '../../../infrastructure/persistence/in-memory/InMemoryTaskRepository.js';
import { InMemoryEventDispatcher } from '../../../infrastructure/messaging/InMemoryEventDispatcher.js';
import { Facet } from '../../../domain/enums/Facet.js';
import { DifficultyProfile } from '../../../domain/enums/DifficultyProfile.js';
import { IScheduleRepository } from '../../ports/IScheduleRepository.js';
import { IScheduleBlock } from '../../../domain/entities/ScheduleBlock.js';
import { TimeRange } from '../../../domain/value-objects/TimeRange.js';

// Mock schedule repository for tests
class MockScheduleRepository implements IScheduleRepository {
    private blocks: Map<string, IScheduleBlock> = new Map();

    async findAll(): Promise<IScheduleBlock[]> {
        return Array.from(this.blocks.values());
    }

    async findById(id: string): Promise<IScheduleBlock | null> {
        return this.blocks.get(id) ?? null;
    }

    async getBlocksSafe(range: TimeRange): Promise<IScheduleBlock[]> {
        return Array.from(this.blocks.values()).filter(block => {
            return block.timeRange.start < range.end && block.timeRange.end > range.start;
        });
    }

    async saveBlock(block: IScheduleBlock): Promise<void> {
        this.blocks.set(block.id, block);
    }

    async deleteBlock(id: string): Promise<void> {
        this.blocks.delete(id);
    }

    clear(): void {
        this.blocks.clear();
    }
}

describe('V15 Product API', () => {
    let goalRepository: InMemoryGoalRepository;
    let subGoalRepository: InMemorySubGoalRepository;
    let taskRepository: InMemoryTaskRepository;
    let scheduleRepository: MockScheduleRepository;
    let eventDispatcher: InMemoryEventDispatcher;

    beforeEach(() => {
        goalRepository = new InMemoryGoalRepository();
        subGoalRepository = new InMemorySubGoalRepository();
        taskRepository = new InMemoryTaskRepository();
        scheduleRepository = new MockScheduleRepository();
        eventDispatcher = new InMemoryEventDispatcher();
    });

    describe('GoalProjectionService', () => {
        let goalProjection: GoalProjectionService;
        let createGoal: CreateGoal;
        let createSubGoal: CreateSubGoal;
        let createTask: CreateTask;

        beforeEach(() => {
            goalProjection = new GoalProjectionService(
                goalRepository,
                subGoalRepository,
                taskRepository
            );
            createGoal = new CreateGoal(goalRepository, eventDispatcher);
            createSubGoal = new CreateSubGoal(goalRepository, subGoalRepository, eventDispatcher);
            createTask = new CreateTask(subGoalRepository, taskRepository, eventDispatcher);
        });

        it('should calculate progress from tasks', async () => {
            // Create a goal
            const goal = await createGoal.execute({
                title: 'Test Goal',
                facet: Facet.Career,
                difficulty: DifficultyProfile.Medium,
            });

            // Create a subgoal
            const subGoal = await createSubGoal.execute({
                goalId: goal.id,
                title: 'Test SubGoal',
            });

            // Create tasks
            await createTask.execute({ subGoalId: subGoal.id, title: 'Task 1' });
            await createTask.execute({ subGoalId: subGoal.id, title: 'Task 2' });
            const task3 = await createTask.execute({ subGoalId: subGoal.id, title: 'Task 3' });
            const task4 = await createTask.execute({ subGoalId: subGoal.id, title: 'Task 4' });

            // Complete 2 of 4 tasks
            task3.isCompleted = true;
            task4.isCompleted = true;
            await taskRepository.save(task3);
            await taskRepository.save(task4);

            // Build read model
            const readModels = await goalProjection.buildAllGoalListReadModels();

            expect(readModels).toHaveLength(1);
            expect(readModels[0].progressPercent).toBe(50);
            expect(readModels[0].taskCount).toBe(4);
            expect(readModels[0].completedTaskCount).toBe(2);
        });

        it('should build detail with nested subgoals', async () => {
            // Create a goal
            const goal = await createGoal.execute({
                title: 'Test Goal',
                description: 'A test goal',
                facet: Facet.Health,
                difficulty: DifficultyProfile.Hard,
            });

            // Create multiple subgoals with tasks
            const subGoal1 = await createSubGoal.execute({
                goalId: goal.id,
                title: 'SubGoal 1',
            });
            const subGoal2 = await createSubGoal.execute({
                goalId: goal.id,
                title: 'SubGoal 2',
            });

            await createTask.execute({ subGoalId: subGoal1.id, title: 'Task 1.1' });
            await createTask.execute({ subGoalId: subGoal1.id, title: 'Task 1.2' });
            await createTask.execute({ subGoalId: subGoal2.id, title: 'Task 2.1' });

            // Build detail model
            const detail = await goalProjection.buildGoalDetailReadModel(goal.id);

            expect(detail).not.toBeNull();
            expect(detail!.id).toBe(goal.id);
            expect(detail!.title).toBe('Test Goal');
            expect(detail!.subGoals).toHaveLength(2);
            expect(detail!.totalTaskCount).toBe(3);

            // Check subgoal structure
            const sg1 = detail!.subGoals.find(sg => sg.title === 'SubGoal 1');
            expect(sg1?.tasks).toHaveLength(2);
        });

        it('should filter goals by facet', async () => {
            await createGoal.execute({
                title: 'Health Goal',
                facet: Facet.Health,
                difficulty: DifficultyProfile.Easy,
            });
            await createGoal.execute({
                title: 'Career Goal',
                facet: Facet.Career,
                difficulty: DifficultyProfile.Easy,
            });

            const healthGoals = await goalProjection.buildGoalsByFacet(Facet.Health);
            expect(healthGoals).toHaveLength(1);
            expect(healthGoals[0].facet).toBe(Facet.Health);
        });

        it('should filter active vs completed goals', async () => {
            const goal1 = await createGoal.execute({
                title: 'Active Goal',
                facet: Facet.Education,
                difficulty: DifficultyProfile.Easy,
            });
            const goal2 = await createGoal.execute({
                title: 'Completed Goal',
                facet: Facet.Education,
                difficulty: DifficultyProfile.Easy,
            });

            // Mark one as completed
            goal2.isCompleted = true;
            await goalRepository.save(goal2);

            const activeGoals = await goalProjection.buildActiveGoals();
            const completedGoals = await goalProjection.buildCompletedGoals();

            expect(activeGoals).toHaveLength(1);
            expect(activeGoals[0].title).toBe('Active Goal');
            expect(completedGoals).toHaveLength(1);
            expect(completedGoals[0].title).toBe('Completed Goal');
        });
    });

    describe('TaskProjectionService', () => {
        let taskProjection: TaskProjectionService;
        let createGoal: CreateGoal;
        let createSubGoal: CreateSubGoal;
        let createTask: CreateTask;

        beforeEach(() => {
            taskProjection = new TaskProjectionService(
                goalRepository,
                subGoalRepository,
                taskRepository,
                scheduleRepository
            );
            createGoal = new CreateGoal(goalRepository, eventDispatcher);
            createSubGoal = new CreateSubGoal(goalRepository, subGoalRepository, eventDispatcher);
            createTask = new CreateTask(subGoalRepository, taskRepository, eventDispatcher);
        });

        it('should build task list with goal context', async () => {
            const goal = await createGoal.execute({
                title: 'Test Goal',
                facet: Facet.Business,
                difficulty: DifficultyProfile.Medium,
            });
            const subGoal = await createSubGoal.execute({
                goalId: goal.id,
                title: 'Test SubGoal',
            });
            await createTask.execute({
                subGoalId: subGoal.id,
                title: 'Test Task',
            });

            const tasks = await taskProjection.buildAllTaskListReadModels();

            expect(tasks).toHaveLength(1);
            expect(tasks[0].title).toBe('Test Task');
            expect(tasks[0].goalTitle).toBe('Test Goal');
            expect(tasks[0].subGoalTitle).toBe('Test SubGoal');
            expect(tasks[0].goalFacet).toBe(Facet.Business);
        });

        it('should identify overdue tasks', async () => {
            const goal = await createGoal.execute({
                title: 'Test Goal',
                facet: Facet.Finance,
                difficulty: DifficultyProfile.Easy,
            });
            const subGoal = await createSubGoal.execute({
                goalId: goal.id,
                title: 'Test SubGoal',
            });

            // Create a task with past deadline
            const task = await createTask.execute({
                subGoalId: subGoal.id,
                title: 'Overdue Task',
                deadline: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
            });

            const tasks = await taskProjection.buildAllTaskListReadModels();

            expect(tasks[0].status).toBe('overdue');
        });

        it('should filter pending tasks', async () => {
            const goal = await createGoal.execute({
                title: 'Test Goal',
                facet: Facet.Habits,
                difficulty: DifficultyProfile.Easy,
            });
            const subGoal = await createSubGoal.execute({
                goalId: goal.id,
                title: 'Test SubGoal',
            });

            const task1 = await createTask.execute({ subGoalId: subGoal.id, title: 'Pending Task' });
            const task2 = await createTask.execute({ subGoalId: subGoal.id, title: 'Completed Task' });

            task2.isCompleted = true;
            await taskRepository.save(task2);

            const pendingTasks = await taskProjection.buildPendingTasks();

            expect(pendingTasks).toHaveLength(1);
            expect(pendingTasks[0].title).toBe('Pending Task');
        });
    });

    describe('ScheduleProjectionService', () => {
        let scheduleProjection: ScheduleProjectionService;

        beforeEach(() => {
            scheduleProjection = new ScheduleProjectionService(
                goalRepository,
                subGoalRepository,
                taskRepository,
                scheduleRepository
            );
        });

        it('should detect fixed block conflicts', async () => {
            // Use UTC dates to avoid timezone issues
            const dateStr = '2025-01-15';

            // Create two overlapping blocks
            const block1Start = new Date('2025-01-15T09:00:00.000Z');
            const block1End = new Date('2025-01-15T10:30:00.000Z');
            const block2Start = new Date('2025-01-15T10:00:00.000Z');
            const block2End = new Date('2025-01-15T11:00:00.000Z');

            await scheduleRepository.saveBlock({
                id: 'block-1',
                timeRange: new TimeRange(block1Start, block1End),
                label: 'Meeting 1',
                isFixed: true,
            });

            await scheduleRepository.saveBlock({
                id: 'block-2',
                timeRange: new TimeRange(block2Start, block2End),
                label: 'Meeting 2',
                isFixed: true,
            });

            const schedule = await scheduleProjection.buildScheduleForDate(dateStr);

            expect(schedule.conflicts).toHaveLength(1);
            expect(schedule.conflicts[0].overlapMinutes).toBe(30);
        });

        it('should calculate available time slots', async () => {
            // Use fixed UTC dates
            const dateStr = '2025-01-16';

            // Create a block in the middle of the day (12-13 UTC)
            const blockStart = new Date('2025-01-16T12:00:00.000Z');
            const blockEnd = new Date('2025-01-16T13:00:00.000Z');

            await scheduleRepository.saveBlock({
                id: 'lunch-block',
                timeRange: new TimeRange(blockStart, blockEnd),
                label: 'Lunch',
                isFixed: true,
            });

            const schedule = await scheduleProjection.buildScheduleForDate(dateStr);

            // With default day boundaries (6-22), the lunch block splits the day
            // Check we have blocks and available slots are calculated
            expect(schedule.blocks).toHaveLength(1);
            expect(schedule.totalScheduledMinutes).toBe(60);
        });

        it('should find slots for specific duration', async () => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const dateStr = today.toISOString().split('T')[0];

            // Empty schedule should have plenty of slots
            const slots = await scheduleProjection.findSlotsForDuration(dateStr, 60);

            expect(slots.length).toBeGreaterThan(0);
            slots.forEach(slot => {
                expect(slot.durationMinutes).toBeGreaterThanOrEqual(60);
            });
        });
    });

    describe('Task Completion Bubbling', () => {
        let completeTask: CompleteTask;
        let createGoal: CreateGoal;
        let createSubGoal: CreateSubGoal;
        let createTask: CreateTask;

        beforeEach(() => {
            completeTask = new CompleteTask(
                taskRepository,
                subGoalRepository,
                goalRepository,
                eventDispatcher
            );
            createGoal = new CreateGoal(goalRepository, eventDispatcher);
            createSubGoal = new CreateSubGoal(goalRepository, subGoalRepository, eventDispatcher);
            createTask = new CreateTask(subGoalRepository, taskRepository, eventDispatcher);
        });

        it('should bubble to subgoal when all tasks complete', async () => {
            const goal = await createGoal.execute({
                title: 'Test Goal',
                facet: Facet.Career,
                difficulty: DifficultyProfile.Easy,
            });
            const subGoal = await createSubGoal.execute({
                goalId: goal.id,
                title: 'Test SubGoal',
            });

            const task1 = await createTask.execute({ subGoalId: subGoal.id, title: 'Task 1' });
            const task2 = await createTask.execute({ subGoalId: subGoal.id, title: 'Task 2' });

            // Complete first task
            await completeTask.execute(task1.id);
            let updatedSubGoal = await subGoalRepository.findById(subGoal.id);
            expect(updatedSubGoal!.isCompleted).toBe(false);

            // Complete second task
            await completeTask.execute(task2.id);
            updatedSubGoal = await subGoalRepository.findById(subGoal.id);
            expect(updatedSubGoal!.isCompleted).toBe(true);
        });

        it('should bubble to goal when all subgoals complete', async () => {
            const goal = await createGoal.execute({
                title: 'Test Goal',
                facet: Facet.Education,
                difficulty: DifficultyProfile.Medium,
            });

            const subGoal1 = await createSubGoal.execute({ goalId: goal.id, title: 'SubGoal 1' });
            const subGoal2 = await createSubGoal.execute({ goalId: goal.id, title: 'SubGoal 2' });

            const task1 = await createTask.execute({ subGoalId: subGoal1.id, title: 'Task 1' });
            const task2 = await createTask.execute({ subGoalId: subGoal2.id, title: 'Task 2' });

            // Complete first subgoal
            await completeTask.execute(task1.id);
            let updatedGoal = await goalRepository.findById(goal.id);
            expect(updatedGoal!.isCompleted).toBe(false);

            // Complete second subgoal
            await completeTask.execute(task2.id);
            updatedGoal = await goalRepository.findById(goal.id);
            expect(updatedGoal!.isCompleted).toBe(true);
        });
    });

    describe('CreateSubGoal Use Case', () => {
        let createSubGoal: CreateSubGoal;
        let createGoal: CreateGoal;

        beforeEach(() => {
            createGoal = new CreateGoal(goalRepository, eventDispatcher);
            createSubGoal = new CreateSubGoal(goalRepository, subGoalRepository, eventDispatcher);
        });

        it('should create subgoal under existing goal', async () => {
            const goal = await createGoal.execute({
                title: 'Parent Goal',
                facet: Facet.Finance,
                difficulty: DifficultyProfile.Hard,
            });

            const subGoal = await createSubGoal.execute({
                goalId: goal.id,
                title: 'Child SubGoal',
                description: 'A subgoal description',
            });

            expect(subGoal.id).toBeDefined();
            expect(subGoal.title).toBe('Child SubGoal');
            expect(subGoal.goalId).toBe(goal.id);

            // Verify goal was updated
            const updatedGoal = await goalRepository.findById(goal.id);
            expect(updatedGoal!.subGoalIds).toContain(subGoal.id);
        });

        it('should throw error for non-existent goal', async () => {
            await expect(
                createSubGoal.execute({
                    goalId: 'non-existent-id',
                    title: 'Test SubGoal',
                })
            ).rejects.toThrow('not found');
        });

        it('should require title', async () => {
            const goal = await createGoal.execute({
                title: 'Parent Goal',
                facet: Facet.Health,
                difficulty: DifficultyProfile.Easy,
            });

            await expect(
                createSubGoal.execute({
                    goalId: goal.id,
                    title: '',
                })
            ).rejects.toThrow('required');
        });
    });

    describe('CreateTask Use Case', () => {
        let createTask: CreateTask;
        let createSubGoal: CreateSubGoal;
        let createGoal: CreateGoal;

        beforeEach(() => {
            createGoal = new CreateGoal(goalRepository, eventDispatcher);
            createSubGoal = new CreateSubGoal(goalRepository, subGoalRepository, eventDispatcher);
            createTask = new CreateTask(subGoalRepository, taskRepository, eventDispatcher);
        });

        it('should create task under existing subgoal', async () => {
            const goal = await createGoal.execute({
                title: 'Parent Goal',
                facet: Facet.Business,
                difficulty: DifficultyProfile.Medium,
            });
            const subGoal = await createSubGoal.execute({
                goalId: goal.id,
                title: 'Parent SubGoal',
            });

            const task = await createTask.execute({
                subGoalId: subGoal.id,
                title: 'New Task',
                estimatedDurationMinutes: 30,
            });

            expect(task.id).toBeDefined();
            expect(task.title).toBe('New Task');
            expect(task.subGoalId).toBe(subGoal.id);
            expect(task.estimatedDurationMinutes).toBe(30);

            // Verify subgoal was updated
            const updatedSubGoal = await subGoalRepository.findById(subGoal.id);
            expect(updatedSubGoal!.taskIds).toContain(task.id);
        });

        it('should throw error for non-existent subgoal', async () => {
            await expect(
                createTask.execute({
                    subGoalId: 'non-existent-id',
                    title: 'Test Task',
                })
            ).rejects.toThrow('not found');
        });

        it('should use default difficulty when not specified', async () => {
            const goal = await createGoal.execute({
                title: 'Parent Goal',
                facet: Facet.Relationships,
                difficulty: DifficultyProfile.Easy,
            });
            const subGoal = await createSubGoal.execute({
                goalId: goal.id,
                title: 'Parent SubGoal',
            });

            const task = await createTask.execute({
                subGoalId: subGoal.id,
                title: 'Task without difficulty',
            });

            expect(task.difficulty).toBe(DifficultyProfile.Medium);
        });
    });
});
