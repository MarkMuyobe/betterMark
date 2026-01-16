import { IDomainEvent } from '../../domain/events/IDomainEvent.js';
import { IEventDispatcher, IEventHandler } from '../../application/ports/IEventDispatcher.js';

export class InMemoryEventDispatcher implements IEventDispatcher {
    private handlers: Map<string, IEventHandler<any>[]> = new Map();

    async dispatch(event: IDomainEvent): Promise<void> {
        const eventName = event.constructor.name;
        const eventHandlers = this.handlers.get(eventName) || [];

        for (const handler of eventHandlers) {
            await handler.handle(event);
        }
    }

    subscribe<T extends IDomainEvent>(eventName: string, handler: IEventHandler<T>): void {
        const currentHandlers = this.handlers.get(eventName) || [];
        currentHandlers.push(handler);
        this.handlers.set(eventName, currentHandlers);
    }

    getSubscriberCount(): number {
        let count = 0;
        this.handlers.forEach(handlers => count += handlers.length);
        return count;
    }
}
