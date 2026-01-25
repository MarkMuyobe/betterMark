/**
 * Logger - Structured logging interface and implementation.
 *
 * Provides consistent logging across the application with:
 * - Log levels (debug, info, warn, error)
 * - Structured context (correlationId, agentName, etc.)
 * - Child loggers for scoped contexts
 *
 * V14: Auto-injects correlationId from RequestContext.
 */

import { RequestContext } from './RequestContext.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
    correlationId?: string;
    agentName?: string;
    eventType?: string;
    aggregateId?: string;
    service?: string;
    component?: string;
    route?: string;
    statusCode?: number;
    latencyMs?: number;
    actor?: {
        userId?: string;
        role?: string;
    };
    action?: string;
    [key: string]: unknown;
}

export interface ILogger {
    debug(message: string, context?: LogContext): void;
    info(message: string, context?: LogContext): void;
    warn(message: string, context?: LogContext): void;
    error(message: string, error?: Error, context?: LogContext): void;

    /**
     * Creates a child logger with inherited context.
     */
    child(context: LogContext): ILogger;
}

/**
 * Console-based structured logger.
 * Outputs JSON-formatted logs for easy parsing.
 */
export class ConsoleLogger implements ILogger {
    private baseContext: LogContext;
    private minLevel: LogLevel;

    private static levelPriority: Record<LogLevel, number> = {
        debug: 0,
        info: 1,
        warn: 2,
        error: 3,
    };

    constructor(baseContext: LogContext = {}, minLevel: LogLevel = 'debug') {
        this.baseContext = baseContext;
        this.minLevel = minLevel;
    }

    debug(message: string, context?: LogContext): void {
        this.log('debug', message, context);
    }

    info(message: string, context?: LogContext): void {
        this.log('info', message, context);
    }

    warn(message: string, context?: LogContext): void {
        this.log('warn', message, context);
    }

    error(message: string, error?: Error, context?: LogContext): void {
        const errorContext: LogContext = {
            ...context,
            error: error ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
            } : undefined,
        };
        this.log('error', message, errorContext);
    }

    child(context: LogContext): ILogger {
        return new ConsoleLogger(
            { ...this.baseContext, ...context },
            this.minLevel
        );
    }

    private log(level: LogLevel, message: string, context?: LogContext): void {
        if (ConsoleLogger.levelPriority[level] < ConsoleLogger.levelPriority[this.minLevel]) {
            return;
        }

        // V14: Auto-inject correlationId and route from RequestContext
        const requestContext = RequestContext.get();
        const autoContext: Partial<LogContext> = {};

        if (requestContext) {
            if (!context?.correlationId && !this.baseContext.correlationId) {
                autoContext.correlationId = requestContext.correlationId;
            }
            if (!context?.route && !this.baseContext.route && requestContext.route) {
                autoContext.route = requestContext.route;
            }
            if (requestContext.user && !context?.actor) {
                autoContext.actor = {
                    userId: requestContext.user.userId,
                    role: requestContext.user.role,
                };
            }
        }

        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            ...this.baseContext,
            ...autoContext,
            ...context,
        };

        const output = JSON.stringify(logEntry);

        switch (level) {
            case 'debug':
                console.debug(output);
                break;
            case 'info':
                console.info(output);
                break;
            case 'warn':
                console.warn(output);
                break;
            case 'error':
                console.error(output);
                break;
        }
    }
}

/**
 * No-op logger for testing or when logging is disabled.
 */
export class NullLogger implements ILogger {
    debug(_message: string, _context?: LogContext): void {}
    info(_message: string, _context?: LogContext): void {}
    warn(_message: string, _context?: LogContext): void {}
    error(_message: string, _error?: Error, _context?: LogContext): void {}
    child(_context: LogContext): ILogger {
        return this;
    }
}
