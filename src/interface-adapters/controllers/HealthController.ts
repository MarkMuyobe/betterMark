import { prisma } from '../../infrastructure/persistence/prisma/client.js';
import { InMemoryEventDispatcher } from '../../infrastructure/messaging/InMemoryEventDispatcher.js';

export class HealthController {
    constructor(private eventDispatcher: InMemoryEventDispatcher) { }

    async handle(): Promise<any> {
        const healthStatus: any = {
            status: 'ok',
            checks: {
                database: 'unknown',
                dispatcher: 'unknown',
                container: 'ok' // If we are here, container wired us up
            },
            timestamp: new Date().toISOString()
        };

        // 1. Check Database
        try {
            // Simple query to verify connectivity
            await prisma.$queryRaw`SELECT 1`;
            healthStatus.checks.database = 'connected';
        } catch (error: any) {
            healthStatus.status = 'error';
            healthStatus.checks.database = `failed: ${error.message}`;
        }

        // 2. Check Dispatcher
        try {
            const subscriberCount = this.eventDispatcher.getSubscriberCount();
            if (subscriberCount > 0) {
                healthStatus.checks.dispatcher = `active (${subscriberCount} subscribers)`;
            } else {
                healthStatus.status = 'warning'; // Not necessarily an error, but suspicious in V4
                healthStatus.checks.dispatcher = 'no-subscribers';
            }
        } catch (error: any) {
            healthStatus.status = 'error';
            healthStatus.checks.dispatcher = `failed: ${error.message}`;
        }

        const statusCode = healthStatus.status === 'error' ? 503 : 200;
        return {
            statusCode,
            body: healthStatus
        };
    }
}
