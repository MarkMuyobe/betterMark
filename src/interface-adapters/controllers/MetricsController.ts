/**
 * MetricsController - V14 Metrics endpoint controller.
 *
 * Exposes application metrics in various formats.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { IMetricsCollector, MetricsSnapshot, HistogramData } from '../../infrastructure/observability/MetricsCollector.js';
import { RequestContext } from '../../infrastructure/observability/RequestContext.js';
import { sendSuccessResponse } from '../../shared/errors/ErrorNormalizer.js';

/**
 * Metrics output format.
 */
export type MetricsFormat = 'json' | 'prometheus';

/**
 * Metrics controller.
 */
export class MetricsController {
    constructor(private readonly metrics: IMetricsCollector) {}

    /**
     * Handle metrics request.
     * GET /metrics?format=json|prometheus
     */
    handle(req: IncomingMessage, res: ServerResponse): void {
        const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
        const format = (url.searchParams.get('format') ?? 'json') as MetricsFormat;
        const correlationId = RequestContext.getCorrelationId();

        const snapshot = this.metrics.getMetrics();

        if (format === 'prometheus') {
            this.sendPrometheusFormat(res, snapshot);
        } else {
            sendSuccessResponse(res, snapshot, correlationId);
        }
    }

    /**
     * Send metrics in Prometheus text format.
     */
    private sendPrometheusFormat(res: ServerResponse, snapshot: MetricsSnapshot): void {
        const lines: string[] = [];

        // Add timestamp comment
        lines.push(`# Metrics snapshot at ${snapshot.timestamp.toISOString()}`);
        lines.push('');

        // Counters
        for (const [name, value] of Object.entries(snapshot.counters)) {
            const { metricName, labels } = this.parseMetricKey(name);
            lines.push(`# TYPE ${metricName} counter`);
            lines.push(`${metricName}${labels} ${value}`);
        }

        // Gauges
        for (const [name, value] of Object.entries(snapshot.gauges)) {
            const { metricName, labels } = this.parseMetricKey(name);
            lines.push(`# TYPE ${metricName} gauge`);
            lines.push(`${metricName}${labels} ${value}`);
        }

        // Histograms
        for (const [name, data] of Object.entries(snapshot.histograms)) {
            const { metricName, labels } = this.parseMetricKey(name);
            lines.push(`# TYPE ${metricName} histogram`);
            lines.push(...this.formatHistogram(metricName, labels, data));
        }

        const content = lines.join('\n') + '\n';
        res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
        res.end(content);
    }

    /**
     * Parse metric key into name and labels.
     */
    private parseMetricKey(key: string): { metricName: string; labels: string } {
        const match = key.match(/^([^{]+)(\{.*\})?$/);
        if (match) {
            return {
                metricName: match[1],
                labels: match[2] ?? '',
            };
        }
        return { metricName: key, labels: '' };
    }

    /**
     * Format histogram data for Prometheus.
     */
    private formatHistogram(name: string, labels: string, data: HistogramData): string[] {
        const lines: string[] = [];
        const baseLabels = labels ? labels.slice(0, -1) : '';  // Remove trailing }

        // Compute percentiles (simplified)
        const sorted = [...data.values].sort((a, b) => a - b);
        const p50 = this.percentile(sorted, 0.5);
        const p90 = this.percentile(sorted, 0.9);
        const p99 = this.percentile(sorted, 0.99);

        // Output bucket counts (simplified - using common buckets)
        const buckets = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
        for (const le of buckets) {
            const count = data.values.filter(v => v <= le).length;
            const bucketLabels = baseLabels ? `${baseLabels},le="${le}"}` : `{le="${le}"}`;
            lines.push(`${name}_bucket${bucketLabels} ${count}`);
        }
        const infLabels = baseLabels ? `${baseLabels},le="+Inf"}` : `{le="+Inf"}`;
        lines.push(`${name}_bucket${infLabels} ${data.count}`);

        // Output sum and count
        lines.push(`${name}_sum${labels} ${data.sum}`);
        lines.push(`${name}_count${labels} ${data.count}`);

        return lines;
    }

    /**
     * Calculate percentile from sorted array.
     */
    private percentile(sorted: number[], p: number): number {
        if (sorted.length === 0) return 0;
        const index = Math.ceil(sorted.length * p) - 1;
        return sorted[Math.max(0, index)];
    }
}
