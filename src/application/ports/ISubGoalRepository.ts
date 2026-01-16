import { ISubGoal } from '../../domain/entities/SubGoal.js';

export interface ISubGoalRepository {
    findById(id: string): Promise<ISubGoal | null>;
    save(subGoal: ISubGoal): Promise<void>;
    findAll(): Promise<ISubGoal[]>;
    delete(id: string): Promise<void>;
}
