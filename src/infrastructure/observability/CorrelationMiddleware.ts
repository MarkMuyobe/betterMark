/**
 * CorrelationMiddleware - V14 Generate/extract X-Correlation-Id.
 *
 * Ensures every request has a correlation ID for distributed tracing.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { RequestContext, RequestContextData } from './RequestContext.js';
import { IdGenerator } from '../../shared/utils/IdGenerator.js';

/**
 * Header name for correlation ID.
 */
export const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Header name for request ID.
 */
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Extract correlation ID from request headers or generate a new one.
 */
export function extractCorrelationId(req: IncomingMessage): string {
    const headerValue = req.headers[CORRELATION_ID_HEADER];
    if (typeof headerValue === 'string' && headerValue.length > 0) {
        return headerValue;
    }
    return IdGenerator.generate();
}

/**
 * Add correlation ID to response headers.
 */
export function addCorrelationHeaders(
    res: ServerResponse,
    correlationId: string,
    requestId: string
): void {
    res.setHeader('X-Correlation-Id', correlationId);
    res.setHeader('X-Request-Id', requestId);
}

/**
 * Parse the route from a URL (strip query string).
 */
export function parseRoute(url: string | undefined): string {
    if (!url) return 'unknown';
    const questionIndex = url.indexOf('?');
    return questionIndex > -1 ? url.slice(0, questionIndex) : url;
}

/**
 * Middleware function type.
 */
export type MiddlewareNext = () => Promise<void>;

/**
 * Create correlation middleware that wraps request handling.
 */
export function withCorrelation(
    req: IncomingMessage,
    res: ServerResponse,
    handler: () => Promise<void>
): Promise<void> {
    const correlationId = extractCorrelationId(req);
    const requestId = IdGenerator.generate();
    const route = parseRoute(req.url);
    const method = req.method ?? 'UNKNOWN';

    // Add headers to response
    addCorrelationHeaders(res, correlationId, requestId);

    // Run handler in request context
    return RequestContext.runAsync(
        {
            correlationId,
            requestId,
            startTime: new Date(),
            route,
            method,
        },
        handler
    );
}

/**
 * Create context data from a request.
 */
export function createContextFromRequest(req: IncomingMessage): Partial<RequestContextData> {
    const correlationId = extractCorrelationId(req);
    const requestId = IdGenerator.generate();
    const route = parseRoute(req.url);
    const method = req.method ?? 'UNKNOWN';

    return {
        correlationId,
        requestId,
        startTime: new Date(),
        route,
        method,
    };
}
