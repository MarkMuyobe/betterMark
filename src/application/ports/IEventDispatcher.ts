import { IDomainEvent } from '../../domain/events/IDomainEvent.js';

export interface IEventHandler<T extends IDomainEvent> {
    handle(event: T): Promise<void>;
}

export interface IEventDispatcher {
    dispatch(event: IDomainEvent): Promise<void>;
    subscribe<T extends IDomainEvent>(
        eventName: string,
        handler: IEventHandler<T>
    ): void;
}
