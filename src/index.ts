// Daemon
export { DaemonServer } from "./daemon/server.js";
export { DaemonClient } from "./daemon/client.js";
export { Orchestrator } from "./daemon/orchestrator.js";

// Core
export { TypedEventBus, eventBus } from "./core/events.js";
export { loadConfig } from "./core/config.js";

// Buddy
export { BuddyRegistry } from "./buddy/registry.js";
export { BuddyInstance } from "./buddy/instance.js";
export { Animator } from "./buddy/animator.js";

// Monitor
export { PatternMatcher } from "./monitor/pattern-matcher.js";

// Conversation
export { DialogueEngine } from "./conversation/dialogue-engine.js";
export { ConversationContext } from "./conversation/context.js";

// Types
export type { DevBuddyConfig } from "./types/config.js";
export type { BuddyDefinition, BuddyStats, BuddyPersonality } from "./types/buddy.js";
export type { EventMap, EventName } from "./types/events.js";
export type { PersistedState, BuddyProgress } from "./types/progression.js";
export type { InboundMessage, OutboundMessage } from "./daemon/protocol.js";
