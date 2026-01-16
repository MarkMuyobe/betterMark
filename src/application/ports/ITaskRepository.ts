import { ITask } from '../../domain/entities/Task.js';

export interface ITaskRepository {
    findById(id: string): Promise<ITask | null>;
    save(task: ITask): Promise<void>;
    findAll(): Promise<ITask[]>;
    delete(id: string): Promise<void>;
}
