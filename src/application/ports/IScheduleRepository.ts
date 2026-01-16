import { IScheduleBlock } from '../../domain/entities/ScheduleBlock.js';
import { TimeRange } from '../../domain/value-objects/TimeRange.js';

export interface IScheduleRepository {
    getBlocksSafe(range: TimeRange): Promise<IScheduleBlock[]>;
    saveBlock(block: IScheduleBlock): Promise<void>;
    deleteBlock(id: string): Promise<void>;
}
