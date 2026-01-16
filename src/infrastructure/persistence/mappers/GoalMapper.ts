import { Goal, SubGoal, Task } from '../prisma/types.js'; // Changed import
import { IGoal } from '../../../domain/entities/Goal.js';
import { ISubGoal } from '../../../domain/entities/SubGoal.js';
import { ITask } from '../../../domain/entities/Task.js';
import { Facet as DomainFacet } from '../../../domain/enums/Facet.js';
import { DifficultyProfile as DomainDifficulty } from '../../../domain/enums/DifficultyProfile.js';

export class GoalMapper {
    static toDomain(raw: Goal & { subGoals?: (SubGoal & { tasks?: Task[] })[] }): IGoal {
        return {
            id: raw.id,
            title: raw.title,
            description: raw.description || undefined,
            facet: raw.facet as unknown as DomainFacet,
            difficulty: raw.difficulty as unknown as DomainDifficulty,
            createdAt: raw.createdAt,
            updatedAt: raw.updatedAt,
            subGoalIds: raw.subGoals?.map(sg => sg.id) || [],
            coachAgentId: '',
            isCompleted: false
        };
    }

    static toPersistence(domain: IGoal): any {
        return {
            id: domain.id,
            title: domain.title,
            description: domain.description,
            facet: domain.facet,
            difficulty: 'Medium',
        };
    }
}
