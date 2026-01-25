/**
 * Server - V14 Production-ready HTTP server.
 */

import { AppContainer } from './AppContainer.js';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { withCorrelation } from './infrastructure/observability/CorrelationMiddleware.js';
import { RequestContext } from './infrastructure/observability/RequestContext.js';

// Composition Root
const container = new AppContainer();

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // V14: Enhanced CORS headers
    // Must use specific origin (not *) when credentials are included
    const origin = req.headers.origin || 'http://localhost:3001';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Correlation-Id, X-Idempotency-Key');
    res.setHeader('Access-Control-Expose-Headers', 'X-Correlation-Id, X-Request-Id');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // V14: Admin Control Plane routes (handled first, has its own correlation middleware)
    if (await container.adminRouter.handle(req, res)) {
        return;
    }

    // V15: Product UI routes
    if (await container.productRouter.handle(req, res)) {
        return;
    }

    // Wrap non-admin routes in correlation context
    await withCorrelation(req, res, async () => {
        const url = req.url ?? '';
        const startTime = Date.now();

        // Health Check
        if (url === '/health' && req.method === 'GET') {
            const result = await container.healthController.handle();
            res.writeHead(result.statusCode, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result.body));
            recordMetrics(req.method!, url, result.statusCode, startTime);
            return;
        }

        // V14: Metrics endpoint
        if (url.startsWith('/metrics') && req.method === 'GET') {
            container.metricsController.handle(req, res);
            return;
        }

        if (url === '/goals' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk.toString());
            req.on('end', async () => {
                try {
                    const parsedBody = JSON.parse(body);
                    const result = await container.createGoalController.handle({ body: parsedBody });

                    res.writeHead(result.statusCode, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result.body));
                    recordMetrics(req.method!, url, result.statusCode, startTime);
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid JSON' }));
                    recordMetrics(req.method!, url, 400, startTime);
                }
            });
            return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
        recordMetrics(req.method ?? 'UNKNOWN', url, 404, startTime);
    });
});

/**
 * Record request metrics.
 */
function recordMetrics(method: string, route: string, status: number, startTime: number): void {
    const duration = Date.now() - startTime;
    container.adminMetrics.recordRequest(method, route, status, duration);
}

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
server.listen(PORT, () => {
    container.logger.info(`V14 Production API Server running on port ${PORT}`);
});
