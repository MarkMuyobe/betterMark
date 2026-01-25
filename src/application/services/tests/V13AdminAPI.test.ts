/**
 * V13AdminAPI.test.ts - Tests for V13 Admin Control Plane API.
 *
 * Mandatory test requirements:
 * 1. Admin endpoints return paginated responses
 * 2. Filters and sorting work
 * 3. Approve/reject endpoints are idempotent
 * 4. Rollback endpoint works for all modes
 * 5. Auth gating enforced (401 without key)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IncomingMessage, ServerResponse } from 'http';
import { Readable, Writable } from 'stream';
import { Socket } from 'net';

// Pagination
import { paginate, parsePaginationQuery, parseQueryString } from '../../../shared/types/Pagination.js';

// Admin Controllers
import { AdminPreferencesController } from '../../../interface-adapters/controllers/admin/AdminPreferencesController.js';
import { AdminSuggestionsController } from '../../../interface-adapters/controllers/admin/AdminSuggestionsController.js';
import { AdminArbitrationsController } from '../../../interface-adapters/controllers/admin/AdminArbitrationsController.js';
import { AdminAuditController } from '../../../interface-adapters/controllers/admin/AdminAuditController.js';
import { AdminExplanationsController } from '../../../interface-adapters/controllers/admin/AdminExplanationsController.js';

// Middleware
import { ApiKeyAuth } from '../../../interface-adapters/middleware/ApiKeyAuth.js';
import { JwtAuth } from '../../../interface-adapters/middleware/JwtAuth.js';
import { IdempotencyMiddleware } from '../../../interface-adapters/middleware/IdempotencyMiddleware.js';
import { TimeoutMiddleware } from '../../../interface-adapters/middleware/TimeoutMiddleware.js';

// Router
import { Router } from '../../../interface-adapters/routing/Router.js';
import { AdminRouter } from '../../../interface-adapters/routing/AdminRouter.js';

// V14 Dependencies
import { JwtService } from '../../../infrastructure/auth/JwtService.js';
import { InMemoryUserStore } from '../../../infrastructure/auth/UserStore.js';
import { InMemoryTokenStore } from '../../../infrastructure/auth/TokenStore.js';
import { AdminAuthController } from '../../../interface-adapters/controllers/admin/AdminAuthController.js';
import { AdminMetrics } from '../../../infrastructure/observability/AdminMetrics.js';
import { InMemoryMetricsCollector } from '../../../infrastructure/observability/MetricsCollector.js';
import { InMemoryIdempotencyStore } from '../../../infrastructure/persistence/in-memory/InMemoryIdempotencyStore.js';

// Projection Services
import { PreferenceProjectionService } from '../../projections/PreferenceProjectionService.js';
import { SuggestionProjectionService } from '../../projections/SuggestionProjectionService.js';
import { ArbitrationDecisionProjectionService } from '../../projections/ArbitrationDecisionProjectionService.js';
import { AuditTrailProjectionService } from '../../projections/AuditTrailProjectionService.js';

// Services
import { DecisionExplanationService } from '../DecisionExplanationService.js';
import { SuggestionApprovalService } from '../SuggestionApprovalService.js';
import { EscalationApprovalService } from '../EscalationApprovalService.js';
import { RollbackService } from '../RollbackService.js';
import { AutoAdaptationService, InMemoryAutoAdaptationAttemptRepository } from '../AutoAdaptationService.js';
import { AdaptationPolicyService, InMemoryAdaptationPolicyRepository } from '../AdaptationPolicyService.js';
import { AgentProposalService } from '../AgentProposalService.js';

// Repositories
import { InMemoryAgentLearningRepository } from '../../../infrastructure/persistence/in-memory/InMemoryAgentLearningRepository.js';
import { InMemoryAgentProposalRepository } from '../../../infrastructure/persistence/in-memory/InMemoryAgentProposalRepository.js';
import { InMemoryArbitrationPolicyRepository } from '../../../infrastructure/persistence/in-memory/InMemoryArbitrationPolicyRepository.js';
import { InMemoryArbitrationDecisionRepository } from '../../../infrastructure/persistence/in-memory/InMemoryArbitrationDecisionRepository.js';

// Domain
import { PreferenceRegistry } from '../../../domain/services/PreferenceRegistry.js';

// Ports
import { IEventDispatcher } from '../../ports/IEventDispatcher.js';
import { IObservabilityContext } from '../../ports/IObservabilityContext.js';
import { IDomainEvent } from '../../../domain/events/IDomainEvent.js';

describe('V13 Admin Control Plane - Mandatory Tests', () => {
    // Repositories
    let learningRepository: InMemoryAgentLearningRepository;
    let proposalRepository: InMemoryAgentProposalRepository;
    let arbitrationPolicyRepository: InMemoryArbitrationPolicyRepository;
    let decisionRepository: InMemoryArbitrationDecisionRepository;
    let adaptationPolicyRepository: InMemoryAdaptationPolicyRepository;
    let attemptRepository: InMemoryAutoAdaptationAttemptRepository;

    // Services
    let preferenceRegistry: PreferenceRegistry;
    let adaptationPolicyService: AdaptationPolicyService;
    let autoAdaptationService: AutoAdaptationService;
    let proposalService: AgentProposalService;

    // Projection Services
    let preferenceProjection: PreferenceProjectionService;
    let suggestionProjection: SuggestionProjectionService;
    let arbitrationProjection: ArbitrationDecisionProjectionService;
    let auditProjection: AuditTrailProjectionService;

    // Control Services
    let explanationService: DecisionExplanationService;
    let suggestionApproval: SuggestionApprovalService;
    let escalationApproval: EscalationApprovalService;
    let rollbackService: RollbackService;

    // Admin Controllers
    let preferencesController: AdminPreferencesController;
    let suggestionsController: AdminSuggestionsController;
    let arbitrationsController: AdminArbitrationsController;
    let auditController: AdminAuditController;
    let explanationsController: AdminExplanationsController;

    // Admin Router
    let adminRouter: AdminRouter;

    // Mocks
    let eventDispatcher: IEventDispatcher;
    let observability: IObservabilityContext;
    let dispatchedEvents: IDomainEvent[];

    beforeEach(async () => {
        // Initialize repositories
        preferenceRegistry = PreferenceRegistry.createDefault();
        learningRepository = new InMemoryAgentLearningRepository(preferenceRegistry);
        proposalRepository = new InMemoryAgentProposalRepository();
        arbitrationPolicyRepository = new InMemoryArbitrationPolicyRepository();
        decisionRepository = new InMemoryArbitrationDecisionRepository();
        adaptationPolicyRepository = new InMemoryAdaptationPolicyRepository();
        attemptRepository = new InMemoryAutoAdaptationAttemptRepository();

        // Track dispatched events
        dispatchedEvents = [];
        eventDispatcher = {
            dispatch: vi.fn(async (event: IDomainEvent) => {
                dispatchedEvents.push(event);
            }),
            subscribe: vi.fn(),
        };

        // Mock observability
        observability = {
            logger: {
                debug: vi.fn(),
                info: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
                child: vi.fn(() => observability.logger),
            },
            metrics: {
                incrementCounter: vi.fn(),
                setGauge: vi.fn(),
                recordHistogram: vi.fn(),
                startTimer: vi.fn(() => () => 0),
                getMetrics: vi.fn(() => ({ timestamp: new Date(), counters: {}, gauges: {}, histograms: {} })),
                reset: vi.fn(),
            },
            tracer: {
                startSpan: vi.fn((_name: string) => ({
                    context: () => ({}),
                    name: _name,
                    startTime: Date.now(),
                    setAttributes: vi.fn(),
                    addEvent: vi.fn(),
                    setStatus: vi.fn(),
                    end: vi.fn(),
                    isRecording: () => true,
                })),
            },
        } as unknown as IObservabilityContext;

        // Initialize services
        adaptationPolicyService = new AdaptationPolicyService(
            adaptationPolicyRepository,
            preferenceRegistry,
            observability
        );

        autoAdaptationService = new AutoAdaptationService(
            learningRepository,
            adaptationPolicyService,
            attemptRepository,
            preferenceRegistry,
            eventDispatcher,
            observability
        );

        proposalService = new AgentProposalService(
            proposalRepository,
            eventDispatcher,
            observability
        );

        // Initialize projection services
        preferenceProjection = new PreferenceProjectionService(
            learningRepository,
            preferenceRegistry,
            attemptRepository
        );

        suggestionProjection = new SuggestionProjectionService(
            learningRepository,
            preferenceRegistry,
            adaptationPolicyService
        );

        arbitrationProjection = new ArbitrationDecisionProjectionService(
            decisionRepository,
            proposalRepository
        );

        auditProjection = new AuditTrailProjectionService(
            decisionRepository,
            proposalRepository,
            attemptRepository
        );

        // Initialize control services
        explanationService = new DecisionExplanationService(
            decisionRepository,
            arbitrationPolicyRepository,
            proposalRepository,
            attemptRepository,
            adaptationPolicyService
        );

        suggestionApproval = new SuggestionApprovalService(
            learningRepository,
            eventDispatcher,
            proposalService,
            observability
        );

        escalationApproval = new EscalationApprovalService(
            decisionRepository,
            proposalRepository,
            eventDispatcher,
            observability
        );

        rollbackService = new RollbackService(
            learningRepository,
            decisionRepository,
            proposalRepository,
            attemptRepository,
            autoAdaptationService,
            eventDispatcher,
            observability
        );

        // Initialize admin controllers
        preferencesController = new AdminPreferencesController(
            preferenceProjection,
            rollbackService
        );

        suggestionsController = new AdminSuggestionsController(
            suggestionProjection,
            suggestionApproval
        );

        arbitrationsController = new AdminArbitrationsController(
            arbitrationProjection,
            escalationApproval,
            rollbackService
        );

        auditController = new AdminAuditController(auditProjection);

        explanationsController = new AdminExplanationsController(explanationService);

        // Initialize V14 dependencies for admin router
        const jwtService = new JwtService({
            secret: 'test-secret-key-for-testing-purposes-only',
            accessTokenExpiry: '15m',
            refreshTokenExpiry: '7d',
        });
        const userStore = new InMemoryUserStore();
        const tokenStore = new InMemoryTokenStore();
        const jwtAuth = new JwtAuth(jwtService, tokenStore);
        const idempotencyStore = new InMemoryIdempotencyStore();
        const idempotencyMiddleware = new IdempotencyMiddleware(idempotencyStore);
        const timeoutMiddleware = new TimeoutMiddleware({ defaultTimeout: 30000 });
        const metricsCollector = new InMemoryMetricsCollector();
        const adminMetrics = new AdminMetrics(metricsCollector);
        const authController = new AdminAuthController(jwtService, userStore, tokenStore);

        // Initialize admin router with V14 dependencies
        adminRouter = new AdminRouter({
            preferencesController,
            suggestionsController,
            arbitrationsController,
            auditController,
            explanationsController,
            authController,
            jwtAuth,
            idempotencyMiddleware,
            timeoutMiddleware,
            adminMetrics,
        });
    });

    describe('Pagination Utilities', () => {
        it('should parse pagination query correctly', () => {
            const query = parsePaginationQuery({ page: '2', pageSize: '10' });
            expect(query.page).toBe(2);
            expect(query.pageSize).toBe(10);
        });

        it('should use defaults for invalid values', () => {
            const query = parsePaginationQuery({ page: 'invalid', pageSize: '-5' });
            expect(query.page).toBe(1);
            expect(query.pageSize).toBe(25); // V14: DEFAULT_PAGE_SIZE changed from 20 to 25
        });

        it('should cap pageSize at MAX_PAGE_SIZE', () => {
            const query = parsePaginationQuery({ page: '1', pageSize: '1000' });
            expect(query.pageSize).toBe(100);
        });

        it('should paginate items correctly', () => {
            const items = Array.from({ length: 25 }, (_, i) => ({ id: i }));
            const result = paginate(items, { page: 2, pageSize: 10 });

            expect(result.data.length).toBe(10);
            expect(result.data[0].id).toBe(10);
            expect(result.pagination.page).toBe(2);
            expect(result.pagination.pageSize).toBe(10);
            expect(result.pagination.total).toBe(25);
            expect(result.pagination.totalPages).toBe(3);
        });

        it('should handle last page with fewer items', () => {
            const items = Array.from({ length: 25 }, (_, i) => ({ id: i }));
            const result = paginate(items, { page: 3, pageSize: 10 });

            expect(result.data.length).toBe(5);
            expect(result.data[0].id).toBe(20);
        });

        it('should parse query string correctly', () => {
            const query = parseQueryString('/admin/preferences?page=2&agent=CoachAgent&status=pending');

            expect(query.page).toBe('2');
            expect(query.agent).toBe('CoachAgent');
            expect(query.status).toBe('pending');
        });
    });

    describe('API Key Authentication', () => {
        it('should authenticate valid API key', () => {
            const auth = new ApiKeyAuth({ validKeys: ['valid-key'], enabled: true });
            const req = createMockRequest({ headers: { 'x-admin-key': 'valid-key' } });

            const result = auth.authenticate(req);
            expect(result.authenticated).toBe(true);
        });

        it('should reject missing API key', () => {
            const auth = new ApiKeyAuth({ validKeys: ['valid-key'], enabled: true });
            const req = createMockRequest({ headers: {} });

            const result = auth.authenticate(req);
            expect(result.authenticated).toBe(false);
            expect(result.error).toContain('Missing API key');
        });

        it('should reject invalid API key', () => {
            const auth = new ApiKeyAuth({ validKeys: ['valid-key'], enabled: true });
            const req = createMockRequest({ headers: { 'x-admin-key': 'wrong-key' } });

            const result = auth.authenticate(req);
            expect(result.authenticated).toBe(false);
            expect(result.error).toContain('Invalid API key');
        });

        it('should allow all requests when disabled', () => {
            const auth = new ApiKeyAuth({ validKeys: ['valid-key'], enabled: false });
            const req = createMockRequest({ headers: {} });

            const result = auth.authenticate(req);
            expect(result.authenticated).toBe(true);
        });
    });

    describe('Router', () => {
        it('should match simple routes', async () => {
            const router = new Router();
            let called = false;

            router.get('/test', async (req, res, params) => {
                called = true;
            });

            const req = createMockRequest({ method: 'GET', url: '/test' });
            const res = createMockResponse();

            const handled = await router.handle(req, res);
            expect(handled).toBe(true);
            expect(called).toBe(true);
        });

        it('should extract path parameters', async () => {
            const router = new Router();
            let extractedId = '';

            router.get('/items/:id', async (req, res, params) => {
                extractedId = params.params.id;
            });

            const req = createMockRequest({ method: 'GET', url: '/items/123' });
            const res = createMockResponse();

            await router.handle(req, res);
            expect(extractedId).toBe('123');
        });

        it('should extract query parameters', async () => {
            const router = new Router();
            let extractedQuery: Record<string, string> = {};

            router.get('/search', async (req, res, params) => {
                extractedQuery = params.query;
            });

            const req = createMockRequest({ method: 'GET', url: '/search?q=test&page=1' });
            const res = createMockResponse();

            await router.handle(req, res);
            expect(extractedQuery.q).toBe('test');
            expect(extractedQuery.page).toBe('1');
        });

        it('should handle route with prefix', async () => {
            const router = new Router('/api');
            let called = false;

            router.get('/items', async () => {
                called = true;
            });

            const req = createMockRequest({ method: 'GET', url: '/api/items' });
            const res = createMockResponse();

            const handled = await router.handle(req, res);
            expect(handled).toBe(true);
            expect(called).toBe(true);
        });

        it('should not match wrong methods', async () => {
            const router = new Router();
            router.get('/test', async () => { });

            const req = createMockRequest({ method: 'POST', url: '/test' });
            const res = createMockResponse();

            const handled = await router.handle(req, res);
            expect(handled).toBe(false);
        });
    });

    describe('Admin Router - Auth Gating', () => {
        it('should return 401 for requests without JWT token', async () => {
            const req = createMockRequest({
                method: 'GET',
                url: '/admin/preferences',
                headers: {},
            });
            const res = createMockResponse();

            await adminRouter.handle(req, res);

            expect(res.writeHead).toHaveBeenCalledWith(401, expect.any(Object));
        });

        it('should return 401 for requests with invalid JWT token', async () => {
            const req = createMockRequest({
                method: 'GET',
                url: '/admin/preferences',
                headers: { 'authorization': 'Bearer invalid-token' },
            });
            const res = createMockResponse();

            await adminRouter.handle(req, res);

            // V14: Invalid JWT should return 401
            expect(res.writeHead).toHaveBeenCalledWith(401, expect.any(Object));
        });
    });

    describe('Admin Preferences Controller', () => {
        it('should return paginated preferences list', async () => {
            // Ensure agent profile exists
            await learningRepository.getOrCreate('CoachAgent');

            const req = createMockRequest({
                method: 'GET',
                url: '/admin/preferences?page=1&pageSize=5',
                headers: { 'x-admin-key': 'test-key' },
            });
            const res = createMockResponse();

            await preferencesController.list(req, res, {
                params: {},
                query: { page: '1', pageSize: '5' },
            });

            expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
            const response = getResponseBody(res);
            expect(response).toHaveProperty('data');
            expect(response).toHaveProperty('pagination');
            expect(response.pagination).toHaveProperty('page', 1);
            expect(response.pagination).toHaveProperty('pageSize', 5);
        });

        it('should filter preferences by agent', async () => {
            await learningRepository.getOrCreate('CoachAgent');
            await learningRepository.getOrCreate('PlannerAgent');

            const req = createMockRequest({
                method: 'GET',
                url: '/admin/preferences?agent=CoachAgent',
                headers: { 'x-admin-key': 'test-key' },
            });
            const res = createMockResponse();

            await preferencesController.list(req, res, {
                params: {},
                query: { agent: 'CoachAgent' },
            });

            const response = getResponseBody(res);
            const preferences = response.data;

            // All returned preferences should be for CoachAgent
            for (const pref of preferences) {
                expect(pref.agentType).toBe('CoachAgent');
            }
        });
    });

    describe('Admin Suggestions Controller', () => {
        beforeEach(async () => {
            // Create a profile with a suggestion
            const profile = await learningRepository.getOrCreate('CoachAgent');
            await learningRepository.addSuggestedPreference('CoachAgent', {
                suggestionId: 'suggestion-1',
                category: 'communication',
                key: 'tone',
                suggestedValue: 'direct',
                currentValue: 'encouraging',
                confidence: 0.85,
                reason: 'User prefers direct communication',
                learnedFrom: [],
                status: 'pending',
                suggestedAt: new Date(),
            });
        });

        it('should return paginated suggestions list', async () => {
            const req = createMockRequest({
                method: 'GET',
                url: '/admin/suggestions',
                headers: { 'x-admin-key': 'test-key' },
            });
            const res = createMockResponse();

            await suggestionsController.list(req, res, {
                params: {},
                query: {},
            });

            expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
            const response = getResponseBody(res);
            expect(response.data.length).toBeGreaterThan(0);
        });

        it('should filter suggestions by status', async () => {
            const req = createMockRequest({
                method: 'GET',
                url: '/admin/suggestions?status=pending',
                headers: { 'x-admin-key': 'test-key' },
            });
            const res = createMockResponse();

            await suggestionsController.list(req, res, {
                params: {},
                query: { status: 'pending' },
            });

            const response = getResponseBody(res);
            for (const suggestion of response.data) {
                expect(suggestion.status).toBe('pending');
            }
        });
    });

    describe('Admin Audit Controller', () => {
        it('should return paginated audit trail', async () => {
            const req = createMockRequest({
                method: 'GET',
                url: '/admin/audit',
                headers: { 'x-admin-key': 'test-key' },
            });
            const res = createMockResponse();

            await auditController.list(req, res, {
                params: {},
                query: {},
            });

            expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
            const response = getResponseBody(res);
            expect(response).toHaveProperty('data');
            expect(response).toHaveProperty('pagination');
        });

        it('should filter audit trail by type', async () => {
            const req = createMockRequest({
                method: 'GET',
                url: '/admin/audit?type=arbitration',
                headers: { 'x-admin-key': 'test-key' },
            });
            const res = createMockResponse();

            await auditController.list(req, res, {
                params: {},
                query: { type: 'arbitration' },
            });

            expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
        });

        it('should reject invalid audit type', async () => {
            const req = createMockRequest({
                method: 'GET',
                url: '/admin/audit/type/invalid',
                headers: { 'x-admin-key': 'test-key' },
            });
            const res = createMockResponse();

            await auditController.listByType(req, res, {
                params: { type: 'invalid' },
                query: {},
            });

            expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
        });
    });

    describe('Admin Explanations Controller', () => {
        it('should return 404 for non-existent decision', async () => {
            const req = createMockRequest({
                method: 'GET',
                url: '/admin/explanations/non-existent',
                headers: { 'x-admin-key': 'test-key' },
            });
            const res = createMockResponse();

            await explanationsController.getExplanation(req, res, {
                params: { id: 'non-existent' },
                query: {},
            });

            expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
        });
    });

    describe('Idempotency', () => {
        it('should handle repeated reject calls gracefully', async () => {
            // Create a profile with a pending suggestion
            await learningRepository.getOrCreate('CoachAgent');
            await learningRepository.addSuggestedPreference('CoachAgent', {
                suggestionId: 'suggestion-idempotent',
                category: 'communication',
                key: 'tone',
                suggestedValue: 'direct',
                currentValue: 'encouraging',
                confidence: 0.85,
                reason: 'Test suggestion',
                learnedFrom: [],
                status: 'pending',
                suggestedAt: new Date(),
            });

            // First rejection should succeed
            const result1 = await suggestionApproval.rejectSuggestion(
                'CoachAgent',
                'suggestion-idempotent',
                'Test rejection'
            );
            expect(result1.success).toBe(true);

            // Second rejection should fail gracefully (not pending)
            const result2 = await suggestionApproval.rejectSuggestion(
                'CoachAgent',
                'suggestion-idempotent',
                'Test rejection again'
            );
            expect(result2.success).toBe(false);
            expect(result2.error).toContain('not pending');
        });
    });
});

// Helper functions

function createMockRequest(options: {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    body?: string;
}): IncomingMessage {
    const readable = new Readable({
        read() {
            if (options.body) {
                this.push(options.body);
            }
            this.push(null);
        },
    });

    const req = Object.assign(readable, {
        method: options.method ?? 'GET',
        url: options.url ?? '/',
        headers: options.headers ?? {},
        httpVersion: '1.1',
        httpVersionMajor: 1,
        httpVersionMinor: 1,
        connection: {} as Socket,
        socket: {} as Socket,
        complete: true,
        aborted: false,
        rawHeaders: [],
        trailers: {},
        rawTrailers: [],
        setTimeout: vi.fn(),
        statusCode: undefined,
        statusMessage: undefined,
    }) as unknown as IncomingMessage;

    return req;
}

function createMockResponse(): ServerResponse {
    let responseBody = '';
    let statusCode = 200;
    let headers: Record<string, string> = {};

    const writable = new Writable({
        write(chunk, encoding, callback) {
            responseBody += chunk.toString();
            callback();
        },
    });

    const res = Object.assign(writable, {
        writeHead: vi.fn((code: number, hdrs?: Record<string, string>) => {
            statusCode = code;
            if (hdrs) headers = hdrs;
            return res;
        }),
        end: vi.fn((data?: string | Buffer) => {
            if (data) responseBody = data.toString();
            return res;
        }),
        setHeader: vi.fn((key: string, value: string) => {
            headers[key] = value;
            return res;
        }),
        getHeader: vi.fn((key: string) => headers[key]),
        statusCode,
        getResponseBody: () => responseBody,
        req: {} as IncomingMessage,
    }) as unknown as ServerResponse & { getResponseBody: () => string };

    return res;
}

function getResponseBody(res: ServerResponse): any {
    const endMock = res.end as any;
    if (endMock.mock && endMock.mock.calls.length > 0) {
        const lastCall = endMock.mock.calls[endMock.mock.calls.length - 1];
        if (lastCall[0]) {
            return JSON.parse(lastCall[0]);
        }
    }
    return null;
}
