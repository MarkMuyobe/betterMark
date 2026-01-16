import { describe, it, expect, beforeEach } from 'vitest';
import { CompleteTask } from '../implementation/CompleteTask.js';
import { InMemoryTaskRepository } from '../../../infrastructure/persistence/in-memory/InMemoryTaskRepository.js';
import { InMemorySubGoalRepository } from '../../../infrastructure/persistence/in-memory/InMemorySubGoalRepository.js';
import { InMemoryGoalRepository } from '../../../infrastructure/persistence/in-memory/InMemoryGoalRepository.js';
import { InMemoryEventDispatcher } from '../../../infrastructure/messaging/InMemoryEventDispatcher.js';
import { DifficultyProfile } from '../../../domain/enums/DifficultyProfile.js';
import { Facet } from '../../../domain/enums/Facet.js';
import { IEventHandler } from '../../../application/ports/IEventDispatcher.js';
import { TaskCompleted } from '../../../domain/events/TaskCompleted.js';
import { GoalCompleted } from '../../../domain/events/GoalCompleted.js';

describe('CompleteTask Use Case', () => {
    let useCase: CompleteTask;
    let taskRepo: InMemoryTaskRepository;
    let subGoalRepo: InMemorySubGoalRepository;
    let goalRepo: InMemoryGoalRepository;
    let dispatcher: InMemoryEventDispatcher;

    beforeEach(() => {
        taskRepo = new InMemoryTaskRepository();
        subGoalRepo = new InMemorySubGoalRepository();
        goalRepo = new InMemoryGoalRepository();
        dispatcher = new InMemoryEventDispatcher();
        useCase = new CompleteTask(taskRepo, subGoalRepo, goalRepo, dispatcher);
    });

    it('should emit TaskCompleted event', async () => {
        await taskRepo.save({
            id: 't1', title: 'Task 1', isCompleted: false, difficulty: DifficultyProfile.Easy, subGoalId: 'sg1'
        });

        let taskEventReceived = false;
        dispatcher.subscribe('TaskCompleted', {
            handle: async (e: TaskCompleted) => {
                if (e.taskId === 't1') taskEventReceived = true;
            }
        });

        await useCase.execute('t1');
        expect(taskEventReceived).toBe(true);
    });

    it('should emit GoalCompleted when propagation finishes', async () => {
        await goalRepo.save({
            id: 'g1', title: 'Goal 1', facet: Facet.Career, difficulty: DifficultyProfile.Medium,
            createdAt: new Date(), updatedAt: new Date(), coachAgentId: 'c1', subGoalIds: ['sg1'], isCompleted: false
        });
        await subGoalRepo.save({
            id: 'sg1', title: 'SG', isCompleted: false, goalId: 'g1', taskIds: ['t1']
        });
        await taskRepo.save({
            id: 't1', title: 'Task 1', isCompleted: false, difficulty: DifficultyProfile.Easy, subGoalId: 'sg1'
        });

        let goalEventReceived = false;
        dispatcher.subscribe('GoalCompleted', {
            handle: async (e: GoalCompleted) => {
                if (e.goalId === 'g1') goalEventReceived = true;
            }
        });

        await useCase.execute('t1');
        expect(goalEventReceived).toBe(true);
    });
});
