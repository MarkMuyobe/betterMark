import { AppContainer } from './AppContainer.js';
import { createServer, IncomingMessage, ServerResponse } from 'http';

// Composition Root
const container = new AppContainer();

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Basic CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Health Check
    if (req.url === '/health' && req.method === 'GET') {
        const result = await container.healthController.handle();
        res.writeHead(result.statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.body));
        return;
    }

    if (req.url === '/goals' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
            try {
                const parsedBody = JSON.parse(body);
                const result = await container.createGoalController.handle({ body: parsedBody });

                res.writeHead(result.statusCode, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result.body));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
        });
        return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Prisma-backed API Server running on port ${PORT}`);
});
