import { describe, it, expect } from "vitest";
import { DialogueEngine } from "../../../src/conversation/dialogue-engine.js";
import { ConversationContext } from "../../../src/conversation/context.js";
import { BuddyInstance } from "../../../src/buddy/instance.js";
import type { BuddyDefinition } from "../../../src/types/buddy.js";

const testDef: BuddyDefinition = {
  id: "test",
  name: "Testy",
  description: "Test buddy",
  version: 1,
  appearance: { width: 10, height: 5 },
  stats: { wisdom: 5, energy: 5, humor: 5, debugSkill: 5, patience: 5 },
  personality: { traits: ["friendly"], speechStyle: "Normal", catchphrase: "Test!" },
  animations: {
    idle: { frameDuration: 500, loop: true, frames: ["idle"] },
  },
  dialogue: {
    greetings: ["Hello!", "Hi there!"],
    encouragement: ["Keep going!", "You got this!"],
    error: ["Oops!", "Let me look..."],
    idle: ["Just chilling."],
    farewell: ["Bye!"],
    testFail: ["Tests failed!"],
    levelUp: ["Level up!"],
  },
  levelUnlocks: {},
};

describe("DialogueEngine", () => {
  it("responds to greetings", async () => {
    const buddy = new BuddyInstance(testDef);
    const ctx = new ConversationContext();
    const engine = new DialogueEngine(buddy, ctx);

    const response = await engine.respond("hello there");
    expect(["Hello!", "Hi there!"]).toContain(response);
  });

  it("responds to help requests with encouragement", async () => {
    const buddy = new BuddyInstance(testDef);
    const ctx = new ConversationContext();
    const engine = new DialogueEngine(buddy, ctx);

    const response = await engine.respond("I'm stuck, help!");
    expect(["Keep going!", "You got this!"]).toContain(response);
  });

  it("responds to error-related input", async () => {
    const buddy = new BuddyInstance(testDef);
    const ctx = new ConversationContext();
    const engine = new DialogueEngine(buddy, ctx);

    const response = await engine.respond("there's a bug here");
    expect(["Oops!", "Let me look..."]).toContain(response);
  });

  it("falls back to idle for unknown input", async () => {
    const buddy = new BuddyInstance(testDef);
    const ctx = new ConversationContext();
    const engine = new DialogueEngine(buddy, ctx);

    const response = await engine.respond("asdfjkl random");
    expect(response).toBe("Just chilling.");
  });

  it("responds to farewell", async () => {
    const buddy = new BuddyInstance(testDef);
    const ctx = new ConversationContext();
    const engine = new DialogueEngine(buddy, ctx);

    const response = await engine.respond("bye!");
    expect(response).toBe("Bye!");
  });
});
