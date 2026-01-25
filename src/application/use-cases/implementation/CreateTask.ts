/**
 * CreateTask - V15 Use case to create a task under a subgoal.
 */

import { ISubGoalRepository } from '../../ports/ISubGoalRepository.js';
import { ITaskRepository } from '../../ports/ITaskRepository.js';
import { IEventDispatcher } from '../../ports/IEventDispatcher.js';
import { ITask } from '../../../domain/entities/Task.js';
import { DifficultyProfile } from '../../../domain/enums/DifficultyProfile.js';
import { IdGenerator } from '../../../shared/utils/IdGenerator.js';

/**
 * Request to create a task.
 */
export interface CreateTaskRequest {
    subGoalId: string;
    title: string;
    description?: string;
    difficulty?: DifficultyProfile;
    estimatedDurationMinutes?: number;
    deadline?: Date;
    location?: string;
    requiredEnergyLevel?: number;
    requiredTools?: string[];
}

/**
 * Create Task use case.
 */
export class CreateTask {
    constructor(
        private readonly subGoalRepository: ISubGoalRepository,
        private readonly taskRepository: ITaskRepository,
        private readonly eventDispatcher: IEventDispatcher
    ) {}

    /**
     * Execute the use case.
     */
    async execute(request: CreateTaskRequest): Promise<ITask> {
        // 1. Validate input
        if (!request.title || request.title.trim().length === 0) {
            throw new Error('Task title is required');
        }

        // 2. Verify parent subgoal exists
        const subGoal = await this.subGoalRepository.findById(request.subGoalId);
        if (!subGoal) {
            throw new Error(`SubGoal ${request.subGoalId} not found`);
        }

        // 3. Create task entity
        const newTask: ITask = {
            id: IdGenerator.generate(),
            title: request.title.trim(),
            description: request.description?.trim(),
            isCompleted: false,
            difficulty: request.difficulty ?? DifficultyProfile.Medium,
            estimatedDurationMinutes: request.estimatedDurationMinutes,
            deadline: request.deadline,
            location: request.location,
            requiredEnergyLevel: request.requiredEnergyLevel,
            requiredTools: request.requiredTools,
            subGoalId: request.subGoalId,
        };

        // 4. Save task
        await this.taskRepository.save(newTask);

        // 5. Update subgoal's taskIds
        subGoal.taskIds.push(newTask.id);
        await this.subGoalRepository.save(subGoal);

        return newTask;
    }
}
