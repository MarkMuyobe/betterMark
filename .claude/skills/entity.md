# Create Domain Entity

Create a new domain entity with its repository interface and implementations.

## Usage

```
/entity <EntityName>
```

Example: `/entity Habit`

## Instructions

### 1. Create the Entity Interface

Create `src/domain/entities/<EntityName>.ts`:

```typescript
export interface I<EntityName> {
    id: string;
    // Required fields
    createdAt: Date;
    updatedAt: Date;
}
```

### 2. Add to Prisma Schema

Add to `schema.prisma`:

```prisma
model <EntityName> {
  id        String   @id @default(uuid())
  // fields...
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relationships
  // relatedId String?
  // related   RelatedModel? @relation(fields: [relatedId], references: [id])
}
```

Run `npx prisma generate` after updating schema.

### 3. Create Repository Port

Create `src/application/ports/I<EntityName>Repository.ts`:

```typescript
import { I<EntityName> } from '../../domain/entities/<EntityName>.js';

export interface I<EntityName>Repository {
    findById(id: string): Promise<I<EntityName> | null>;
    findAll(): Promise<I<EntityName>[]>;
    save(entity: I<EntityName>): Promise<void>;
    delete(id: string): Promise<void>;
    // Add domain-specific queries:
    // findByStatus(status: string): Promise<I<EntityName>[]>;
}
```

### 4. Create InMemory Repository

Create `src/infrastructure/persistence/in-memory/InMemory<EntityName>Repository.ts`:

```typescript
import { I<EntityName>Repository } from '../../../application/ports/I<EntityName>Repository.js';
import { I<EntityName> } from '../../../domain/entities/<EntityName>.js';

export class InMemory<EntityName>Repository implements I<EntityName>Repository {
    private entities: Map<string, I<EntityName>> = new Map();

    async findById(id: string): Promise<I<EntityName> | null> {
        return this.entities.get(id) ?? null;
    }

    async findAll(): Promise<I<EntityName>[]> {
        return Array.from(this.entities.values());
    }

    async save(entity: I<EntityName>): Promise<void> {
        this.entities.set(entity.id, { ...entity });
    }

    async delete(id: string): Promise<void> {
        this.entities.delete(id);
    }
}
```

### 5. Create Prisma Types (if using mock client)

Add to `src/infrastructure/persistence/prisma/types.ts`:

```typescript
export interface <EntityName> {
    id: string;
    // Match Prisma schema fields
    createdAt: Date;
    updatedAt: Date;
}
```

### 6. Create Mapper

Create `src/infrastructure/persistence/mappers/<EntityName>Mapper.ts`:

```typescript
import { I<EntityName> } from '../../../domain/entities/<EntityName>.js';
import { <EntityName> as Prisma<EntityName> } from '../prisma/types.js';

export class <EntityName>Mapper {
    static toDomain(prisma: Prisma<EntityName>): I<EntityName> {
        return {
            id: prisma.id,
            // Map fields
            createdAt: prisma.createdAt,
            updatedAt: prisma.updatedAt,
        };
    }

    static toPrisma(domain: I<EntityName>): Prisma<EntityName> {
        return {
            id: domain.id,
            // Map fields
            createdAt: domain.createdAt,
            updatedAt: domain.updatedAt,
        };
    }
}
```

### 7. Create Prisma Repository

Create `src/infrastructure/persistence/repositories/Prisma<EntityName>Repository.ts`:

```typescript
import { I<EntityName>Repository } from '../../../application/ports/I<EntityName>Repository.js';
import { I<EntityName> } from '../../../domain/entities/<EntityName>.js';
import { prisma } from '../prisma/client.js';
import { <EntityName>Mapper } from '../mappers/<EntityName>Mapper.js';

export class Prisma<EntityName>Repository implements I<EntityName>Repository {
    async findById(id: string): Promise<I<EntityName> | null> {
        const result = await prisma.<entityName>.findUnique({ where: { id } });
        return result ? <EntityName>Mapper.toDomain(result) : null;
    }

    async findAll(): Promise<I<EntityName>[]> {
        const results = await prisma.<entityName>.findMany();
        return results.map(<EntityName>Mapper.toDomain);
    }

    async save(entity: I<EntityName>): Promise<void> {
        const data = <EntityName>Mapper.toPrisma(entity);
        await prisma.<entityName>.upsert({
            where: { id: entity.id },
            create: data,
            update: data,
        });
    }

    async delete(id: string): Promise<void> {
        await prisma.<entityName>.delete({ where: { id } });
    }
}
```

### 8. Wire in AppContainer

Add to `src/AppContainer.ts`:

```typescript
import { Prisma<EntityName>Repository } from './infrastructure/persistence/repositories/Prisma<EntityName>Repository.js';

// In class properties:
public <entityName>Repository: Prisma<EntityName>Repository;

// In constructor:
this.<entityName>Repository = new Prisma<EntityName>Repository();
```

### 9. Export from index.ts

```typescript
export * from './domain/entities/<EntityName>.js';
export * from './application/ports/I<EntityName>Repository.js';
export * from './infrastructure/persistence/repositories/Prisma<EntityName>Repository.js';
```

### 10. Update Mock Prisma Client

Add delegate to `src/infrastructure/persistence/prisma/client.ts`:

```typescript
<entityName> = new MockDelegate<<EntityName>>();
```

## Domain Rules

- Entities are defined as interfaces (I<EntityName>) in the domain layer
- Repository interfaces (ports) are in the application layer
- Repository implementations are in the infrastructure layer
- Mappers handle Prisma ↔ Domain conversion
- Use InMemory repositories for testing
