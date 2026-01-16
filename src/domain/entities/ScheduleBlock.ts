import { TimeRange } from '../value-objects/TimeRange.js';

export interface IScheduleBlock {
    id: string;
    timeRange: TimeRange;
    taskId?: string; // Linked to a specific task if applicable
    label: string;
    isFixed: boolean; // Cannot be moved by auto-scheduler
}
