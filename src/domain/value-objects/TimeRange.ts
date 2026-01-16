export interface ITimeRange {
    start: Date;
    end: Date;
}

export class TimeRange implements ITimeRange {
    constructor(public start: Date, public end: Date) {
        if (start >= end) {
            throw new Error('Start time must be before end time');
        }
    }

    get durationInMinutes(): number {
        return (this.end.getTime() - this.start.getTime()) / (1000 * 60);
    }

    overlaps(other: TimeRange): boolean {
        return this.start < other.end && this.end > other.start;
    }
}
