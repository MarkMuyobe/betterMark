import { ScheduleBlock } from '../prisma/types.js'; // Changed import
import { IScheduleBlock } from '../../../domain/entities/ScheduleBlock.js';
import { TimeRange } from '../../../domain/value-objects/TimeRange.js';

export class ScheduleMapper {
    static toDomain(raw: ScheduleBlock): IScheduleBlock {
        return {
            id: raw.id,
            label: raw.label,
            isFixed: raw.isFixed,
            taskId: raw.taskId || undefined,
            timeRange: new TimeRange(raw.startTime, raw.endTime)
        };
    }

    static toPersistence(domain: IScheduleBlock): any {
        return {
            id: domain.id,
            label: domain.label,
            isFixed: domain.isFixed,
            taskId: domain.taskId,
            startTime: domain.timeRange.start,
            endTime: domain.timeRange.end
        };
    }
}
