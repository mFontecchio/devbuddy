import { describe, it, expect } from "vitest";
import { buddyDefinitionSchema } from "../../../src/buddy/schema.js";

const base = {
  id: "test-buddy",
  name: "Test Buddy",
  description: "A test buddy",
  version: 1,
  appearance: { width: 10, height: 5 },
  stats: { wisdom: 5, energy: 5, humor: 5, debugSkill: 5, patience: 5 },
  personality: { traits: ["friendly"], speechStyle: "Normal", catchphrase: "Hello!" },
  animations: { idle: { frameDuration: 500, loop: true, frames: ["frame1"] } },
  dialogue: {
    greetings: ["Hello!"],
  },
};

describe("buddyDefinitionSchema / overlay + agent dialogue", () => {
  it("accepts appearance without overlay (existing buddies still valid)", () => {
    expect(buddyDefinitionSchema.safeParse(base).success).toBe(true);
  });

  it("accepts appearance.overlay with preferredAnchor=top|bottom and padding", () => {
    const withOverlay = {
      ...base,
      appearance: { ...base.appearance, overlay: { preferredAnchor: "top", padding: 2 } },
    };
    expect(buddyDefinitionSchema.safeParse(withOverlay).success).toBe(true);
  });

  it("rejects invalid overlay anchor", () => {
    const bad = {
      ...base,
      appearance: { ...base.appearance, overlay: { preferredAnchor: "diagonal" as unknown as "top" } },
    };
    expect(buddyDefinitionSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts agent dialogue categories alongside standard ones", () => {
    const withAgent = {
      ...base,
      dialogue: {
        greetings: ["hi"],
        agentPrompt: ["thinking..."],
        agentTool: ["tool time"],
        agentEdit: ["nice edit"],
        agentComplete: ["done"],
        agentError: ["oops"],
      },
    };
    expect(buddyDefinitionSchema.safeParse(withAgent).success).toBe(true);
  });
});
