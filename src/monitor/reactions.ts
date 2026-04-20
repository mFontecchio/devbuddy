export interface Reaction {
  animation: string;
  dialogueCategory: string;
  xp: number;
}

const REACTION_MAP: Record<string, Reaction> = {
  // Command-name reactions (from shell hooks)
  "cmd:test": { animation: "thinking", dialogueCategory: "encouragement", xp: 10 },
  "cmd:build": { animation: "thinking", dialogueCategory: "encouragement", xp: 10 },
  "cmd:git-commit": { animation: "happy", dialogueCategory: "gitCommit", xp: 20 },
  "cmd:git-push": { animation: "happy", dialogueCategory: "encouragement", xp: 15 },
  "cmd:git-pull": { animation: "thinking", dialogueCategory: "idle", xp: 5 },
  "cmd:git-merge": { animation: "thinking", dialogueCategory: "encouragement", xp: 10 },
  "cmd:install": { animation: "thinking", dialogueCategory: "idle", xp: 5 },
  "cmd:lint": { animation: "thinking", dialogueCategory: "encouragement", xp: 5 },
  "cmd:run": { animation: "happy", dialogueCategory: "encouragement", xp: 5 },
  "cmd:devops": { animation: "thinking", dialogueCategory: "encouragement", xp: 10 },

  // Output-line reactions (from terminal output forwarding)
  "test:pass": { animation: "celebrating", dialogueCategory: "testPass", xp: 25 },
  "test:fail": { animation: "sad", dialogueCategory: "testFail", xp: 5 },
  "compile:error": { animation: "thinking", dialogueCategory: "error", xp: 2 },
  "runtime:error": { animation: "sad", dialogueCategory: "error", xp: 3 },
  "build:success": { animation: "happy", dialogueCategory: "encouragement", xp: 15 },
  "build:fail": { animation: "sad", dialogueCategory: "error", xp: 3 },
  "git:commit": { animation: "happy", dialogueCategory: "gitCommit", xp: 20 },
  "npm:install": { animation: "thinking", dialogueCategory: "idle", xp: 5 },
  "generic:error": { animation: "thinking", dialogueCategory: "error", xp: 2 },
  "fs:error": { animation: "sad", dialogueCategory: "error", xp: 2 },

  // Fallback reactions (used by orchestrator for exit-code-based handling)
  "generic:success": { animation: "happy", dialogueCategory: "encouragement", xp: 3 },
};

export function getReaction(event: string): Reaction | undefined {
  return REACTION_MAP[event];
}

export function getAllReactionEvents(): string[] {
  return Object.keys(REACTION_MAP);
}
