/**
 * Tracer - Distributed tracing interface and implementation.
 *
 * Provides trace context propagation for:
 * - Request tracing across services
 * - Agent action tracking
 * - Performance analysis
 */

import { IdGenerator } from '../../shared/utils/IdGenerator.js';

export interface SpanContext {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
}

export type SpanStatus = 'ok' | 'error';

export interface SpanAttributes {
    [key: string]: string | number | boolean | undefined;
}

export interface SpanEvent {
    name: string;
    timestamp: Date;
    attributes?: SpanAttributes;
}

export interface ISpan {
    readonly context: SpanContext;
    readonly name: string;
    readonly startTime: Date;

    setStatus(status: SpanStatus): void;
    setAttributes(attributes: SpanAttributes): void;
    setAttribute(key: string, value: string | number | boolean): void;
    addEvent(name: string, attributes?: SpanAttributes): void;
    end(): void;

    isEnded(): boolean;
    getDuration(): number | null;
}

export interface ITracer {
    /**
     * Start a new span.
     */
    startSpan(name: string, parentContext?: SpanContext): ISpan;

    /**
     * Get the current active span (if any).
     */
    getCurrentSpan(): ISpan | null;

    /**
     * Execute a function within a span context.
     */
    withSpan<T>(name: string, fn: () => Promise<T>): Promise<T>;

    /**
     * Get all completed traces (for debugging).
     */
    getTraces(): TraceData[];
}

export interface TraceData {
    traceId: string;
    spans: SpanData[];
}

export interface SpanData {
    context: SpanContext;
    name: string;
    startTime: Date;
    endTime?: Date;
    duration?: number;
    status: SpanStatus;
    attributes: SpanAttributes;
    events: SpanEvent[];
}

/**
 * Simple span implementation for in-memory tracing.
 */
class SimpleSpan implements ISpan {
    readonly context: SpanContext;
    readonly name: string;
    readonly startTime: Date;

    private endTime?: Date;
    private status: SpanStatus = 'ok';
    private attributes: SpanAttributes = {};
    private events: SpanEvent[] = [];

    constructor(name: string, context: SpanContext) {
        this.name = name;
        this.context = context;
        this.startTime = new Date();
    }

    setStatus(status: SpanStatus): void {
        if (!this.isEnded()) {
            this.status = status;
        }
    }

    setAttributes(attributes: SpanAttributes): void {
        if (!this.isEnded()) {
            this.attributes = { ...this.attributes, ...attributes };
        }
    }

    setAttribute(key: string, value: string | number | boolean): void {
        if (!this.isEnded()) {
            this.attributes[key] = value;
        }
    }

    addEvent(name: string, attributes?: SpanAttributes): void {
        if (!this.isEnded()) {
            this.events.push({
                name,
                timestamp: new Date(),
                attributes,
            });
        }
    }

    end(): void {
        if (!this.isEnded()) {
            this.endTime = new Date();
        }
    }

    isEnded(): boolean {
        return this.endTime !== undefined;
    }

    getDuration(): number | null {
        if (!this.endTime) return null;
        return this.endTime.getTime() - this.startTime.getTime();
    }

    toData(): SpanData {
        return {
            context: { ...this.context },
            name: this.name,
            startTime: this.startTime,
            endTime: this.endTime,
            duration: this.getDuration() ?? undefined,
            status: this.status,
            attributes: { ...this.attributes },
            events: [...this.events],
        };
    }
}

/**
 * Simple in-memory tracer for development and testing.
 */
export class SimpleTracer implements ITracer {
    private traces: Map<string, SimpleSpan[]> = new Map();
    private currentSpan: SimpleSpan | null = null;
    private maxTraces: number;

    constructor(maxTraces: number = 100) {
        this.maxTraces = maxTraces;
    }

    startSpan(name: string, parentContext?: SpanContext): ISpan {
        const traceId = parentContext?.traceId ?? IdGenerator.generate();
        const spanId = IdGenerator.generate();

        const context: SpanContext = {
            traceId,
            spanId,
            parentSpanId: parentContext?.spanId,
        };

        const span = new SimpleSpan(name, context);

        // Store span
        const traceSpans = this.traces.get(traceId) ?? [];
        traceSpans.push(span);
        this.traces.set(traceId, traceSpans);

        // Cleanup old traces if needed
        if (this.traces.size > this.maxTraces) {
            const oldestKey = this.traces.keys().next().value;
            if (oldestKey) {
                this.traces.delete(oldestKey);
            }
        }

        this.currentSpan = span;
        return span;
    }

    getCurrentSpan(): ISpan | null {
        return this.currentSpan;
    }

    async withSpan<T>(name: string, fn: () => Promise<T>): Promise<T> {
        const parentContext = this.currentSpan?.context;
        const span = this.startSpan(name, parentContext);

        try {
            const result = await fn();
            span.setStatus('ok');
            return result;
        } catch (error) {
            span.setStatus('error');
            if (error instanceof Error) {
                span.setAttribute('error.message', error.message);
                span.setAttribute('error.name', error.name);
            }
            throw error;
        } finally {
            span.end();
            // Restore parent span as current
            if (parentContext) {
                const parentSpans = this.traces.get(parentContext.traceId);
                this.currentSpan = parentSpans?.find(s => s.context.spanId === parentContext.spanId) ?? null;
            } else {
                this.currentSpan = null;
            }
        }
    }

    getTraces(): TraceData[] {
        const result: TraceData[] = [];

        this.traces.forEach((spans, traceId) => {
            result.push({
                traceId,
                spans: spans.map(s => s.toData()),
            });
        });

        return result;
    }

    /**
     * Get a specific trace by ID.
     */
    getTrace(traceId: string): TraceData | undefined {
        const spans = this.traces.get(traceId);
        if (!spans) return undefined;

        return {
            traceId,
            spans: spans.map(s => s.toData()),
        };
    }

    /**
     * Clear all traces (for testing).
     */
    clear(): void {
        this.traces.clear();
        this.currentSpan = null;
    }
}

/**
 * No-op tracer for when tracing is disabled.
 */
export class NullTracer implements ITracer {
    private nullSpan: ISpan = {
        context: { traceId: '', spanId: '' },
        name: '',
        startTime: new Date(),
        setStatus: () => {},
        setAttributes: () => {},
        setAttribute: () => {},
        addEvent: () => {},
        end: () => {},
        isEnded: () => true,
        getDuration: () => null,
    };

    startSpan(_name: string, _parentContext?: SpanContext): ISpan {
        return this.nullSpan;
    }

    getCurrentSpan(): ISpan | null {
        return null;
    }

    async withSpan<T>(_name: string, fn: () => Promise<T>): Promise<T> {
        return fn();
    }

    getTraces(): TraceData[] {
        return [];
    }
}
