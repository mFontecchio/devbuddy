import type { BuddyInstance } from "../buddy/instance.js";
import { ConversationContext } from "./context.js";
import { weightedSelect } from "./personality.js";

/** Keyword groups for classifying user input into dialogue categories */
const KEYWORD_MAP: Array<{ keywords: string[]; category: string }> = [
  { keywords: ["hello", "hi", "hey", "greetings", "sup", "yo"], category: "greetings" },
  { keywords: ["help", "stuck", "confused", "lost", "how", "why"], category: "encouragement" },
  { keywords: ["test", "testing", "spec", "failing", "fail"], category: "testFail" },
  { keywords: ["debug", "bug", "error", "broken", "fix"], category: "error" },
  { keywords: ["great", "awesome", "nice", "good", "thanks", "ty"], category: "encouragement" },
  { keywords: ["bye", "quit", "exit", "leave", "later"], category: "farewell" },
  { keywords: ["level", "xp", "progress", "stats"], category: "levelUp" },
  { keywords: ["who", "name", "what are you"], category: "greetings" },
];

export interface ResponseProvider {
  respond(input: string, context: ConversationContext): Promise<string>;
}

export class DialogueEngine implements ResponseProvider {
  private buddy: BuddyInstance;
  private context: ConversationContext;

  constructor(buddy: BuddyInstance, context: ConversationContext) {
    this.buddy = buddy;
    this.context = context;
  }

  async respond(input: string): Promise<string> {
    const category = this.classifyInput(input);
    const pool = this.buddy.getDialoguePool(category);

    if (pool.length === 0) {
      // Fall back to idle
      const idlePool = this.buddy.getDialoguePool("idle");
      if (idlePool.length === 0) return this.buddy.definition.personality.catchphrase;
      return weightedSelect(idlePool, this.buddy.definition.stats, "idle");
    }

    let response = weightedSelect(pool, this.buddy.definition.stats, category);

    // Template interpolation
    response = this.interpolate(response);

    return response;
  }

  private classifyInput(input: string): string {
    const lower = input.toLowerCase();

    // Check keyword groups
    for (const { keywords, category } of KEYWORD_MAP) {
      if (keywords.some((kw) => lower.includes(kw))) {
        return category;
      }
    }

    // Context-aware fallback
    const summary = this.context.getSummary();
    switch (summary) {
      case "struggling":
        return "encouragement";
      case "succeeding":
        return "encouragement";
      default:
        return "idle";
    }
  }

  private interpolate(text: string): string {
    return text
      .replace("{level}", String(this.buddy.level))
      .replace("{name}", this.buddy.name)
      .replace("{streak}", "")
      .replace("{catchphrase}", this.buddy.definition.personality.catchphrase);
  }
}
