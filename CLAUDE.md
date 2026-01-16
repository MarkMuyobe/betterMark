# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
npm run build      # Compile TypeScript to dist/
npm run dev        # Watch mode for TypeScript compilation
npm run start      # Run the compiled server (dist/index.js)
npm run test       # Run all tests with Vitest
npx vitest run src/application/use-cases/tests/CreateGoal.test.ts  # Run a single test file
```

### Prisma Commands

```bash
npx prisma generate   # Generate Prisma client from schema.prisma
npx prisma migrate dev --name <name>  # Create and apply a migration
npx prisma db push    # Push schema changes without migration (dev only)
```

## Architecture

This is a goal/task management system built with **Clean Architecture** (Hexagonal/Ports & Adapters). The codebase uses TypeScript with ES modules.

### Layer Structure

```
src/
├── domain/           # Core business logic (entities, value objects, enums, events)
├── application/      # Use cases, ports (interfaces), and event handlers
├── infrastructure/   # Concrete implementations (Prisma repos, in-memory repos, AI services)
├── interface-adapters/  # Controllers that bridge HTTP to use cases
├── shared/           # Common utilities and types
```

### Key Patterns

- **Ports & Adapters**: Repository interfaces defined in `application/ports/`, implementations in `infrastructure/persistence/`
- **Domain Events**: Events like `GoalCreated`, `TaskCompleted` are dispatched through `InMemoryEventDispatcher`
- **Agent Handlers**: `CoachAgentHandler`, `PlannerAgentHandler`, `LoggerAgentHandler` subscribe to domain events and use `ILlmService` for AI-powered responses
- **Dependency Injection**: `AppContainer` wires all dependencies together as the composition root

### Path Aliases

TypeScript path aliases are configured:
- `@modules/*` → `src/modules/*`
- `@shared/*` → `src/shared/*`

### Domain Model

Goals have SubGoals, SubGoals have Tasks. Tasks can be scheduled via ScheduleBlocks. Each Goal can have a CoachAgent. The system tracks activity logs, streaks, and metrics.

**Facets**: Health, Finance, Career, Education, Business, Relationships, Habits, Mentality

### Database

SQLite via Prisma. Schema is in `schema.prisma`. Currently uses a mock Prisma client (`src/infrastructure/persistence/prisma/client.ts`) for development/testing.

### Testing

Tests use Vitest with in-memory repository implementations. Test files are colocated in `src/application/use-cases/tests/`.
