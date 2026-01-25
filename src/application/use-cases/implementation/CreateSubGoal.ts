/**
 * CreateSubGoal - V15 Use case to create a subgoal under a goal.
 */

import { IGoalRepository } from '../../ports/IGoalRepository.js';
import { ISubGoalRepository } from '../../ports/ISubGoalRepository.js';
import { IEventDispatcher } from '../../ports/IEventDispatcher.js';
import { ISubGoal } from '../../../domain/entities/SubGoal.js';
import { IdGenerator } from '../../../shared/utils/IdGenerator.js';

/**
 * Request to create a subgoal.
 */
export interface CreateSubGoalRequest {
    goalId: string;
    title: string;
    description?: string;
}

/**
 * Create SubGoal use case.
 */
export class CreateSubGoal {
    constructor(
        private readonly goalRepository: IGoalRepository,
        private readonly subGoalRepository: ISubGoalRepository,
        private readonly eventDispatcher: IEventDispatcher
    ) {}

    /**
     * Execute the use case.
     */
    async execute(request: CreateSubGoalRequest): Promise<ISubGoal> {
        // 1. Validate input
        if (!request.title || request.title.trim().length === 0) {
            throw new Error('SubGoal title is required');
        }

        // 2. Verify parent goal exists
        const goal = await this.goalRepository.findById(request.goalId);
        if (!goal) {
            throw new Error(`Goal ${request.goalId} not found`);
        }

        // 3. Create subgoal entity
        const newSubGoal: ISubGoal = {
            id: IdGenerator.generate(),
            title: request.title.trim(),
            description: request.description?.trim(),
            taskIds: [],
            isCompleted: false,
            goalId: request.goalId,
        };

        // 4. Save subgoal
        await this.subGoalRepository.save(newSubGoal);

        // 5. Update goal's subGoalIds
        goal.subGoalIds.push(newSubGoal.id);
        goal.updatedAt = new Date();
        await this.goalRepository.save(goal);

        return newSubGoal;
    }
}
