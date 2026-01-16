export interface IMetricSnapshot {
    id: string;
    timestamp: Date;
    key: string; // e.g., 'weight', 'mood', 'energy'
    value: number | string;
    unit: string;
}
