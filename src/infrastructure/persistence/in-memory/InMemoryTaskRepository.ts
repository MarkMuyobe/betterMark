import { ITaskRepository } from '../../../application/ports/ITaskRepository.js';
import { ITask } from '../../../domain/entities/Task.js';

export class InMemoryTaskRepository implements ITaskRepository {
    private tasks: Map<string, ITask> = new Map();

    async findById(id: string): Promise<ITask | null> {
        return this.tasks.get(id) || null;
    }

    async save(task: ITask): Promise<void> {
        this.tasks.set(task.id, task);
    }

    async findAll(): Promise<ITask[]> {
        return Array.from(this.tasks.values());
    }

    async delete(id: string): Promise<void> {
        this.tasks.delete(id);
    }
}
