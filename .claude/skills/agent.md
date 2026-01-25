# Create Agent Handler

Create a new agent handler that follows the Clean Architecture patterns and V6 Agent Governance system.

## Usage

```
/agent <AgentName> <DomainEvent>
```

Example: `/agent Reminder TaskDeadlineApproaching`

## Instructions

When creating a new agent handler, follow these steps:

### 1. Create the Domain Event (if it doesn't exist)

Create `src/domain/events/<EventName>.ts`:

```typescript
import { IDomainEvent } from './IDomainEvent.js';

export class <EventName> implements IDomainEvent {
    readonly dateTimeOccurred: Date;

    constructor(
        public readonly aggregateId: string,
        // Add event-specific fields
    ) {
        this.dateTimeOccurred = new Date();
    }

    getAggregateId(): string {
        return this.aggregateId;
    }
}
```

### 2. Create a Prompt Template

Add to `src/application/ai/PromptTemplates.ts`:

```typescript
export const <AGENT_NAME>_<EVENT_NAME>: PromptTemplate = {
    name: '<agent_name>_<event_name>',
    version: '1.0.0',
    requiredFields: ['field1', 'field2'],
    template: `Your prompt template here with {{field1}} and {{field2}} placeholders.`,
};
```

Register it in the `PromptBuilder` constructor.

### 3. Create the Agent Handler

Create `src/application/handlers/<AgentName>Handler.ts`:

```typescript
import { IEventHandler } from '../ports/IEventDispatcher.js';
import { IAgentActionLogRepository } from '../ports/IAgentActionLogRepository.js';
import { <EventName> } from '../../domain/events/<EventName>.js';
import { AgentActionLogBuilder } from '../../domain/entities/AgentActionLog.js';
import { IdGenerator } from '../../shared/utils/IdGenerator.js';
import { AgentGovernanceService } from '../services/AgentGovernanceService.js';
import { <AGENT_NAME>_<EVENT_NAME> } from '../ai/PromptTemplates.js';

const AGENT_NAME = '<AgentName>';

export class <AgentName>Handler implements IEventHandler<<EventName>> {
    constructor(
        // Add required repositories (read-only access)
        private governanceService: AgentGovernanceService,
        private actionLogRepository: IAgentActionLogRepository
    ) { }

    async handle(event: <EventName>): Promise<void> {
        // 1. Check cooldown
        if (!this.governanceService.canTakeAction(AGENT_NAME, event.getAggregateId())) {
            console.log(`[${AGENT_NAME}] Skipping - cooldown active`);
            return;
        }

        // 2. Check suggestion limit
        const eventId = `${event.getAggregateId()}-${event.dateTimeOccurred.getTime()}`;
        if (!this.governanceService.canMakeSuggestion(AGENT_NAME, eventId)) {
            console.log(`[${AGENT_NAME}] Skipping - suggestion limit reached`);
            return;
        }

        // 3. Fetch required data (read-only)
        // const data = await this.repository.findById(event.aggregateId);

        // 4. Generate response with governance
        const response = await this.governanceService.generateWithGovernance(
            AGENT_NAME,
            <AGENT_NAME>_<EVENT_NAME>.name,
            {
                // Template context fields
            },
            () => this.getRuleBasedResponse() // Fallback
        );

        console.log(`[${AGENT_NAME}] Response (${response.reasoningSource}): ${response.content}`);

        // 5. Record action for rate limiting
        this.governanceService.recordAction(AGENT_NAME, event.getAggregateId());
        this.governanceService.recordSuggestion(AGENT_NAME, eventId);

        // 6. Log with governance metadata
        const actionLog = AgentActionLogBuilder.create()
            .withId(IdGenerator.generate())
            .withAgent(AGENT_NAME)
            .withEvent('<EventName>', event.getAggregateId())
            .withReasoning(response.reasoningSource, `Action: "${response.content}"`)
            .withGovernance(response.governance)
            .build();

        await this.actionLogRepository.save(actionLog);
    }

    private getRuleBasedResponse(): string {
        // Deterministic fallback logic
        return 'Default rule-based response';
    }
}
```

### 4. Register Policy in AppContainer

Add to `registerAgentPolicies()` in `src/AppContainer.ts`:

```typescript
this.governanceService.registerPolicy(AgentPolicy.create({
    agentName: '<AgentName>',
    maxSuggestionsPerEvent: 3,
    confidenceThreshold: 0.7,
    cooldownMs: 30000,
    aiEnabled: true,
    fallbackToRules: true,
}));
```

### 5. Wire in AppContainer Constructor

```typescript
this.eventDispatcher.subscribe('<EventName>', new <AgentName>Handler(
    // repositories,
    this.governanceService,
    this.agentActionLogRepository
));
```

### 6. Export from index.ts

```typescript
export * from './application/handlers/<AgentName>Handler.js';
export * from './domain/events/<EventName>.js';
```

### 7. Write Unit Tests

Create `src/application/handlers/tests/<AgentName>Handler.test.ts` with tests for:
- Event handling with governance
- Cooldown enforcement
- Suggestion rate limiting
- Fallback behavior
- Action logging with governance metadata

## Agent Rules (from architecture)

- Agents do NOT mutate domain entities
- Agents do NOT call repositories for writes
- Agents react ONLY to domain events
- Agents use rule-based logic first, AI is advisory
- All actions must be logged with governance metadata
