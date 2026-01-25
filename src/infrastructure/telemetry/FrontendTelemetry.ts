/**
 * FrontendTelemetry.ts - V16 Frontend-Only Telemetry
 *
 * Tracks suggestion interactions for UX tuning.
 * No learning logic - purely analytics.
 */

import { SuggestionAgentType, SuggestionContext, SuggestionActionType } from '../../application/read-models/SuggestionSurfaceReadModel.js';

/**
 * Telemetry event types for V16.
 */
export enum TelemetryEventType {
    SuggestionShown = 'suggestion_shown',
    SuggestionAppliedOnce = 'suggestion_applied_once',
    SuggestionAlwaysEnabled = 'suggestion_always_enabled',
    SuggestionDismissed = 'suggestion_dismissed',
    WhyModalOpened = 'why_modal_opened',
}

/**
 * Base telemetry event structure.
 */
export interface TelemetryEvent {
    type: TelemetryEventType;
    timestamp: Date;
    sessionId: string;
    userId?: string;
}

/**
 * Suggestion shown event.
 */
export interface SuggestionShownEvent extends TelemetryEvent {
    type: TelemetryEventType.SuggestionShown;
    suggestionId: string;
    agentType: SuggestionAgentType;
    context: SuggestionContext;
    confidence?: string;
}

/**
 * Suggestion applied once event.
 */
export interface SuggestionAppliedOnceEvent extends TelemetryEvent {
    type: TelemetryEventType.SuggestionAppliedOnce;
    suggestionId: string;
    agentType: SuggestionAgentType;
    context: SuggestionContext;
    /** Time from shown to action */
    dwellTimeMs: number;
}

/**
 * Suggestion always enabled event.
 */
export interface SuggestionAlwaysEnabledEvent extends TelemetryEvent {
    type: TelemetryEventType.SuggestionAlwaysEnabled;
    suggestionId: string;
    agentType: SuggestionAgentType;
    context: SuggestionContext;
    /** The preference suggestion that was approved */
    approvedSuggestionId: string;
    dwellTimeMs: number;
}

/**
 * Suggestion dismissed event.
 */
export interface SuggestionDismissedEvent extends TelemetryEvent {
    type: TelemetryEventType.SuggestionDismissed;
    suggestionId: string;
    agentType: SuggestionAgentType;
    context: SuggestionContext;
    dwellTimeMs: number;
}

/**
 * Why modal opened event.
 */
export interface WhyModalOpenedEvent extends TelemetryEvent {
    type: TelemetryEventType.WhyModalOpened;
    suggestionId: string;
    decisionId: string;
}

/**
 * Union type for all telemetry events.
 */
export type SuggestionTelemetryEvent =
    | SuggestionShownEvent
    | SuggestionAppliedOnceEvent
    | SuggestionAlwaysEnabledEvent
    | SuggestionDismissedEvent
    | WhyModalOpenedEvent;

/**
 * Telemetry collector interface.
 */
export interface ITelemetryCollector {
    track(event: SuggestionTelemetryEvent): void;
    flush(): Promise<void>;
}

/**
 * In-memory telemetry collector for testing and development.
 */
export class InMemoryTelemetryCollector implements ITelemetryCollector {
    private events: SuggestionTelemetryEvent[] = [];

    track(event: SuggestionTelemetryEvent): void {
        this.events.push(event);
    }

    async flush(): Promise<void> {
        // In production, this would send to analytics backend
        // For now, just clear the buffer
        this.events = [];
    }

    getEvents(): SuggestionTelemetryEvent[] {
        return [...this.events];
    }

    getEventsByType(type: TelemetryEventType): SuggestionTelemetryEvent[] {
        return this.events.filter(e => e.type === type);
    }

    clear(): void {
        this.events = [];
    }
}

/**
 * Telemetry service for V16 suggestion surfaces.
 */
export class SuggestionTelemetryService {
    private shownTimestamps: Map<string, number> = new Map();

    constructor(
        private readonly collector: ITelemetryCollector,
        private readonly sessionId: string,
        private readonly userId?: string
    ) {}

    /**
     * Track when a suggestion is shown.
     */
    trackShown(
        suggestionId: string,
        agentType: SuggestionAgentType,
        context: SuggestionContext,
        confidence?: string
    ): void {
        this.shownTimestamps.set(suggestionId, Date.now());

        this.collector.track({
            type: TelemetryEventType.SuggestionShown,
            timestamp: new Date(),
            sessionId: this.sessionId,
            userId: this.userId,
            suggestionId,
            agentType,
            context,
            confidence,
        });
    }

    /**
     * Track when user applies suggestion once.
     */
    trackAppliedOnce(
        suggestionId: string,
        agentType: SuggestionAgentType,
        context: SuggestionContext
    ): void {
        const dwellTimeMs = this.calculateDwellTime(suggestionId);

        this.collector.track({
            type: TelemetryEventType.SuggestionAppliedOnce,
            timestamp: new Date(),
            sessionId: this.sessionId,
            userId: this.userId,
            suggestionId,
            agentType,
            context,
            dwellTimeMs,
        });
    }

    /**
     * Track when user enables "always do this".
     */
    trackAlwaysEnabled(
        suggestionId: string,
        agentType: SuggestionAgentType,
        context: SuggestionContext,
        approvedSuggestionId: string
    ): void {
        const dwellTimeMs = this.calculateDwellTime(suggestionId);

        this.collector.track({
            type: TelemetryEventType.SuggestionAlwaysEnabled,
            timestamp: new Date(),
            sessionId: this.sessionId,
            userId: this.userId,
            suggestionId,
            agentType,
            context,
            approvedSuggestionId,
            dwellTimeMs,
        });
    }

    /**
     * Track when user dismisses suggestion.
     */
    trackDismissed(
        suggestionId: string,
        agentType: SuggestionAgentType,
        context: SuggestionContext
    ): void {
        const dwellTimeMs = this.calculateDwellTime(suggestionId);

        this.collector.track({
            type: TelemetryEventType.SuggestionDismissed,
            timestamp: new Date(),
            sessionId: this.sessionId,
            userId: this.userId,
            suggestionId,
            agentType,
            context,
            dwellTimeMs,
        });
    }

    /**
     * Track when user opens "Why?" modal.
     */
    trackWhyModalOpened(suggestionId: string, decisionId: string): void {
        this.collector.track({
            type: TelemetryEventType.WhyModalOpened,
            timestamp: new Date(),
            sessionId: this.sessionId,
            userId: this.userId,
            suggestionId,
            decisionId,
        });
    }

    private calculateDwellTime(suggestionId: string): number {
        const shownAt = this.shownTimestamps.get(suggestionId);
        if (!shownAt) return 0;
        return Date.now() - shownAt;
    }
}
