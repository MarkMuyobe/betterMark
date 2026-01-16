import { IGoalRepository } from '../../ports/IGoalRepository.js';
import { IEventDispatcher } from '../../ports/IEventDispatcher.js';
import { IGoal } from '../../../domain/entities/Goal.js';
import { IdGenerator } from '../../../shared/utils/IdGenerator.js';
import { Facet } from '../../../domain/enums/Facet.js';
import { DifficultyProfile } from '../../../domain/enums/DifficultyProfile.js';
import { GoalCreated } from '../../../domain/events/GoalCreated.js';

export interface CreateGoalRequest {
    title: string;
    description?: string;
    facet: Facet;
    difficulty: DifficultyProfile;
}

export class CreateGoal {
    constructor(
        private goalRepository: IGoalRepository,
        private eventDispatcher: IEventDispatcher
    ) { }

    async execute(request: CreateGoalRequest): Promise<IGoal> {
        // 1. Validate Input
        if (!request.title || request.title.trim().length === 0) {
            throw new Error("Goal title is required");
        }

        // 2. Create Domain Entity
        const newGoal: IGoal = {
            id: IdGenerator.generate(),
            title: request.title,
            description: request.description,
            facet: request.facet,
            difficulty: request.difficulty,
            createdAt: new Date(),
            updatedAt: new Date(),
            isCompleted: false,
            coachAgentId: 'default-coach',
            subGoalIds: []
        };

        // 3. Persist
        await this.goalRepository.save(newGoal);

        // 4. Emit Event
        await this.eventDispatcher.dispatch(new GoalCreated(newGoal));

        return newGoal;
    }
}
