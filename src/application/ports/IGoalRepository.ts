import { IGoal } from '../../domain/entities/Goal.js';

export interface IGoalRepository {
    findById(id: string): Promise<IGoal | null>;
    save(goal: IGoal): Promise<void>;
    findAll(): Promise<IGoal[]>;
    findByFacet(facet: string): Promise<IGoal[]>;
    delete(id: string): Promise<void>;
}
