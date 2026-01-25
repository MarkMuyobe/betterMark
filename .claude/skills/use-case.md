# Create Use Case

Create a new use case following Clean Architecture patterns with proper event emission.

## Usage

```
/use-case <UseCaseName>
```

Example: `/use-case DeleteGoal`

## Instructions

### 1. Define the Use Case Interface (optional)

If part of a use case group, add to existing interface file in `src/application/use-cases/`:

```typescript
export interface I<UseCaseName> {
    execute(request: <UseCaseName>Request): Promise<<UseCaseName>Response>;
}
```

### 2. Create the Use Case Implementation

Create `src/application/use-cases/implementation/<UseCaseName>.ts`:

```typescript
import { I<Entity>Repository } from '../../ports/I<Entity>Repository.js';
import { IEventDispatcher } from '../../ports/IEventDispatcher.js';
import { <DomainEvent> } from '../../../domain/events/<DomainEvent>.js';

export interface <UseCaseName>Request {
    // Input fields
}

export interface <UseCaseName>Response {
    // Output fields (or use domain entity interface)
}

export class <UseCaseName> {
    constructor(
        private repository: I<Entity>Repository,
        private eventDispatcher: IEventDispatcher
    ) { }

    async execute(request: <UseCaseName>Request): Promise<<UseCaseName>Response> {
        // 1. Validate input
        if (!request.requiredField) {
            throw new Error('Validation error message');
        }

        // 2. Fetch existing data if needed
        const existing = await this.repository.findById(request.id);
        if (!existing) {
            throw new Error('Entity not found');
        }

        // 3. Perform business logic
        // ... transform data, apply rules

        // 4. Persist changes
        await this.repository.save(entity);

        // 5. Emit domain event
        await this.eventDispatcher.dispatch(new <DomainEvent>(
            entity.id,
            // event-specific data
        ));

        // 6. Return response
        return entity;
    }
}
```

### 3. Create Domain Event (if needed)

Create `src/domain/events/<EventName>.ts`:

```typescript
import { IDomainEvent } from './IDomainEvent.js';

export class <EventName> implements IDomainEvent {
    readonly dateTimeOccurred: Date;

    constructor(
        public readonly aggregateId: string,
        // event-specific fields
    ) {
        this.dateTimeOccurred = new Date();
    }

    getAggregateId(): string {
        return this.aggregateId;
    }
}
```

### 4. Wire in AppContainer

Add to `src/AppContainer.ts`:

```typescript
// In constructor, after repositories are initialized:
public <useCaseName>UseCase: <UseCaseName>;

// In constructor body:
this.<useCaseName>UseCase = new <UseCaseName>(
    this.<entity>Repository,
    this.eventDispatcher
);
```

### 5. Create Controller (if HTTP endpoint needed)

Create `src/interface-adapters/controllers/<UseCaseName>Controller.ts`:

```typescript
import { <UseCaseName>, <UseCaseName>Request } from '../../application/use-cases/implementation/<UseCaseName>.js';

interface HttpRequest {
    body: any;
    params?: Record<string, string>;
}

interface HttpResponse {
    statusCode: number;
    body: any;
}

export class <UseCaseName>Controller {
    constructor(private useCase: <UseCaseName>) { }

    async handle(request: HttpRequest): Promise<HttpResponse> {
        try {
            const useCaseRequest: <UseCaseName>Request = {
                // Map from HTTP request
            };

            const result = await this.useCase.execute(useCaseRequest);

            return {
                statusCode: 200, // or 201 for creation
                body: result
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';

            if (message.includes('not found')) {
                return { statusCode: 404, body: { error: message } };
            }
            if (message.includes('Validation') || message.includes('required')) {
                return { statusCode: 400, body: { error: message } };
            }

            return { statusCode: 500, body: { error: message } };
        }
    }
}
```

### 6. Add Route in server.ts

```typescript
if (req.url === '/<entities>' && req.method === 'POST') {
    // ... handle request body
    const result = await container.<useCaseName>Controller.handle({ body: parsedBody });
    // ... send response
}
```

### 7. Export from index.ts

```typescript
export * from './application/use-cases/implementation/<UseCaseName>.js';
export * from './domain/events/<EventName>.js'; // if new event
```

### 8. Write Unit Tests

Create `src/application/use-cases/tests/<UseCaseName>.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { <UseCaseName> } from '../implementation/<UseCaseName>.js';
import { InMemory<Entity>Repository } from '../../../infrastructure/persistence/in-memory/InMemory<Entity>Repository.js';
import { InMemoryEventDispatcher } from '../../../infrastructure/messaging/InMemoryEventDispatcher.js';

describe('<UseCaseName> Use Case', () => {
    let useCase: <UseCaseName>;
    let repository: InMemory<Entity>Repository;
    let dispatcher: InMemoryEventDispatcher;

    beforeEach(() => {
        repository = new InMemory<Entity>Repository();
        dispatcher = new InMemoryEventDispatcher();
        useCase = new <UseCaseName>(repository, dispatcher);
    });

    it('should <expected behavior>', async () => {
        // Arrange
        const request = { /* ... */ };

        // Act
        const result = await useCase.execute(request);

        // Assert
        expect(result).toBeDefined();
    });

    it('should throw error when <invalid condition>', async () => {
        const request = { /* invalid data */ };
        await expect(useCase.execute(request)).rejects.toThrow('<error message>');
    });

    it('should emit <EventName> event', async () => {
        let eventEmitted = false;
        dispatcher.subscribe('<EventName>', {
            handle: async () => { eventEmitted = true; }
        });

        await useCase.execute({ /* valid request */ });

        expect(eventEmitted).toBe(true);
    });
});
```

## Clean Architecture Rules

- Use cases depend on repository interfaces (ports), not implementations
- Use cases emit domain events, never call agents directly
- Validation happens in use case, not controller
- Use cases return domain entities or DTOs, not HTTP responses
