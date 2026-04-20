export interface EventMap {
  // Terminal events
  "terminal:output": { line: string; raw: string };
  "terminal:raw-output": { data: string };
  "terminal:resize": { cols: number; rows: number };
  "terminal:alternate-screen": { entered: boolean };

  // Pattern detection
  "pattern:detected": { event: string; match: string; groups?: string[] };

  // Buddy reactions
  "buddy:react": { animation: string; dialogueCategory?: string };
  "buddy:speak": { text: string; duration?: number };
  "buddy:animation": { state: string };

  // Progression
  "xp:gained": { amount: number; source: string };
  "level:up": { newLevel: number; unlocks: string[] };

  // Conversation
  "chat:open": void;
  "chat:message": { text: string };
  "chat:response": { text: string };
  "chat:close": void;

  // Lifecycle
  "engine:started": void;
  "engine:stopping": void;
  "engine:tick": { frame: number };
}

export type EventName = keyof EventMap;
