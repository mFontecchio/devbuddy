import { EventEmitter } from "events";
import type { EventMap, EventName } from "../types/events.js";

type Listener<T> = T extends void ? () => void : (payload: T) => void;

export class TypedEventBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  on<K extends EventName>(event: K, listener: Listener<EventMap[K]>): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  once<K extends EventName>(event: K, listener: Listener<EventMap[K]>): this {
    this.emitter.once(event, listener as (...args: unknown[]) => void);
    return this;
  }

  off<K extends EventName>(event: K, listener: Listener<EventMap[K]>): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
    return this;
  }

  emit<K extends EventName>(
    event: K,
    ...args: EventMap[K] extends void ? [] : [EventMap[K]]
  ): boolean {
    return this.emitter.emit(event, ...args);
  }

  removeAllListeners(event?: EventName): this {
    this.emitter.removeAllListeners(event);
    return this;
  }
}

export const eventBus = new TypedEventBus();
