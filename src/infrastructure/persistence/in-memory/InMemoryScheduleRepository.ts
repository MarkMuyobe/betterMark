import { IScheduleRepository } from '../../../application/ports/IScheduleRepository.js';
import { IScheduleBlock } from '../../../domain/entities/ScheduleBlock.js';
import { TimeRange } from '../../../domain/value-objects/TimeRange.js';

export class InMemoryScheduleRepository implements IScheduleRepository {
    private blocks: Map<string, IScheduleBlock> = new Map();

    async findAll(): Promise<IScheduleBlock[]> {
        return Array.from(this.blocks.values());
    }

    async findById(id: string): Promise<IScheduleBlock | null> {
        return this.blocks.get(id) ?? null;
    }

    async getBlocksSafe(range: TimeRange): Promise<IScheduleBlock[]> {
        return Array.from(this.blocks.values()).filter(b =>
            b.timeRange.overlaps(range)
        );
    }

    async saveBlock(block: IScheduleBlock): Promise<void> {
        this.blocks.set(block.id, block);
    }

    async deleteBlock(id: string): Promise<void> {
        this.blocks.delete(id);
    }
}
