/**
 * MetricsCollector - Metrics collection interface and implementation.
 *
 * Provides application metrics for:
 * - Counters (incrementing values)
 * - Gauges (point-in-time values)
 * - Histograms (distributions)
 * - Timers (latency measurement)
 */

export interface MetricLabels {
    [key: string]: string;
}

export interface HistogramData {
    count: number;
    sum: number;
    min: number;
    max: number;
    avg: number;
    values: number[];
}

export interface MetricsSnapshot {
    timestamp: Date;
    counters: Record<string, number>;
    gauges: Record<string, number>;
    histograms: Record<string, HistogramData>;
}

export interface IMetricsCollector {
    /**
     * Increment a counter metric.
     */
    incrementCounter(name: string, value?: number, labels?: MetricLabels): void;

    /**
     * Set a gauge metric to a specific value.
     */
    setGauge(name: string, value: number, labels?: MetricLabels): void;

    /**
     * Record a value in a histogram (for distributions like latency).
     */
    recordHistogram(name: string, value: number, labels?: MetricLabels): void;

    /**
     * Start a timer and return a function to stop it.
     * Automatically records to a histogram.
     */
    startTimer(name: string, labels?: MetricLabels): () => number;

    /**
     * Get current metrics snapshot.
     */
    getMetrics(): MetricsSnapshot;

    /**
     * Reset all metrics (useful for testing).
     */
    reset(): void;
}

/**
 * In-memory metrics collector for development and testing.
 */
export class InMemoryMetricsCollector implements IMetricsCollector {
    private counters: Map<string, number> = new Map();
    private gauges: Map<string, number> = new Map();
    private histograms: Map<string, number[]> = new Map();

    private makeKey(name: string, labels?: MetricLabels): string {
        if (!labels || Object.keys(labels).length === 0) {
            return name;
        }
        const labelStr = Object.entries(labels)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}="${v}"`)
            .join(',');
        return `${name}{${labelStr}}`;
    }

    incrementCounter(name: string, value: number = 1, labels?: MetricLabels): void {
        const key = this.makeKey(name, labels);
        const current = this.counters.get(key) ?? 0;
        this.counters.set(key, current + value);
    }

    setGauge(name: string, value: number, labels?: MetricLabels): void {
        const key = this.makeKey(name, labels);
        this.gauges.set(key, value);
    }

    recordHistogram(name: string, value: number, labels?: MetricLabels): void {
        const key = this.makeKey(name, labels);
        const values = this.histograms.get(key) ?? [];
        values.push(value);
        this.histograms.set(key, values);
    }

    startTimer(name: string, labels?: MetricLabels): () => number {
        const start = Date.now();
        return () => {
            const duration = Date.now() - start;
            this.recordHistogram(name, duration, labels);
            return duration;
        };
    }

    getMetrics(): MetricsSnapshot {
        const counters: Record<string, number> = {};
        const gauges: Record<string, number> = {};
        const histograms: Record<string, HistogramData> = {};

        this.counters.forEach((value, key) => {
            counters[key] = value;
        });

        this.gauges.forEach((value, key) => {
            gauges[key] = value;
        });

        this.histograms.forEach((values, key) => {
            if (values.length > 0) {
                const sum = values.reduce((a, b) => a + b, 0);
                histograms[key] = {
                    count: values.length,
                    sum,
                    min: Math.min(...values),
                    max: Math.max(...values),
                    avg: sum / values.length,
                    values: [...values],
                };
            }
        });

        return {
            timestamp: new Date(),
            counters,
            gauges,
            histograms,
        };
    }

    reset(): void {
        this.counters.clear();
        this.gauges.clear();
        this.histograms.clear();
    }

    /**
     * Get a specific counter value (for testing).
     */
    getCounter(name: string, labels?: MetricLabels): number {
        const key = this.makeKey(name, labels);
        return this.counters.get(key) ?? 0;
    }

    /**
     * Get a specific gauge value (for testing).
     */
    getGauge(name: string, labels?: MetricLabels): number | undefined {
        const key = this.makeKey(name, labels);
        return this.gauges.get(key);
    }

    /**
     * Get histogram data (for testing).
     */
    getHistogramData(name: string, labels?: MetricLabels): HistogramData | undefined {
        const key = this.makeKey(name, labels);
        const values = this.histograms.get(key);
        if (!values || values.length === 0) return undefined;

        const sum = values.reduce((a, b) => a + b, 0);
        return {
            count: values.length,
            sum,
            min: Math.min(...values),
            max: Math.max(...values),
            avg: sum / values.length,
            values: [...values],
        };
    }
}

/**
 * No-op metrics collector for when metrics are disabled.
 */
export class NullMetricsCollector implements IMetricsCollector {
    incrementCounter(_name: string, _value?: number, _labels?: MetricLabels): void {}
    setGauge(_name: string, _value: number, _labels?: MetricLabels): void {}
    recordHistogram(_name: string, _value: number, _labels?: MetricLabels): void {}
    startTimer(_name: string, _labels?: MetricLabels): () => number {
        return () => 0;
    }
    getMetrics(): MetricsSnapshot {
        return { timestamp: new Date(), counters: {}, gauges: {}, histograms: {} };
    }
    reset(): void {}
}
