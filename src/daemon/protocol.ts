import type { BuddyProgress } from "../types/progression.js";
import type { BuddyStats, BuddyPersonality } from "../types/buddy.js";

// --- Inbound messages (hook/client -> daemon) ---

export interface CommandEvent {
  type: "cmd";
  cmd: string;
  exit: number;
  cwd: string;
  timestamp?: number;
}

export interface OutputEvent {
  type: "output";
  line: string;
}

export interface ChatMessage {
  type: "chat";
  text: string;
}

export interface SubscribeMessage {
  type: "subscribe";
}

export interface ChooseBuddyMessage {
  type: "choose_buddy";
  buddyId: string;
}

export interface PingMessage {
  type: "ping";
}

export interface StopMessage {
  type: "stop";
}

export type AgentSource = "claude" | "cursor" | "copilot";

export type AgentEventKind =
  | "prompt_submit"
  | "tool_use"
  | "file_edit"
  | "complete"
  | "error"
  | "stop";

export interface AgentEvent {
  type: "agent_event";
  source: AgentSource;
  kind: AgentEventKind;
  tool?: string;
  file?: string;
  summary?: string;
  exit?: number;
  timestamp?: number;
}

export type InboundMessage =
  | CommandEvent
  | OutputEvent
  | ChatMessage
  | SubscribeMessage
  | ChooseBuddyMessage
  | PingMessage
  | StopMessage
  | AgentEvent;

// --- Outbound messages (daemon -> display clients) ---

export interface BuddyStateUpdate {
  type: "state";
  buddy: {
    id: string;
    name: string;
    stats: BuddyStats;
    personality: BuddyPersonality;
  };
  animation: {
    state: string;
    frameIndex: number;
    frameLines: string[];
  };
  speech: string | null;
  progress: BuddyProgress;
  xpProgress: number;
  xpToNext: number;
}

export interface ChatResponseMessage {
  type: "chat_response";
  text: string;
}

export interface EventNotification {
  type: "event";
  event: string;
  detail?: string;
}

export interface PongMessage {
  type: "pong";
  uptime: number;
  clients: number;
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

export interface BuddyListMessage {
  type: "buddy_list";
  buddies: Array<{
    id: string;
    name: string;
    description: string;
    active: boolean;
  }>;
}

export type OutboundMessage =
  | BuddyStateUpdate
  | ChatResponseMessage
  | EventNotification
  | PongMessage
  | ErrorMessage
  | BuddyListMessage;

// --- Serialization helpers ---

export function serialize(msg: OutboundMessage | InboundMessage): string {
  return JSON.stringify(msg) + "\n";
}

export function parseMessage(raw: string): InboundMessage | null {
  try {
    const parsed = JSON.parse(raw.trim());
    if (parsed && typeof parsed.type === "string") {
      return parsed as InboundMessage;
    }
    return null;
  } catch {
    return null;
  }
}
