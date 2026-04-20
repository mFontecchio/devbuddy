import { describe, it, expect } from "vitest";
import { buddyDefinitionSchema } from "../../../src/buddy/schema.js";

const validBuddy = {
  id: "test-buddy",
  name: "Test Buddy",
  description: "A test buddy",
  version: 1,
  appearance: { width: 10, height: 5 },
  stats: { wisdom: 5, energy: 5, humor: 5, debugSkill: 5, patience: 5 },
  personality: {
    traits: ["friendly"],
    speechStyle: "Normal",
    catchphrase: "Hello!",
  },
  animations: {
    idle: {
      frameDuration: 500,
      loop: true,
      frames: ["frame1"],
    },
  },
  dialogue: {
    greetings: ["Hello!"],
  },
};

describe("buddyDefinitionSchema", () => {
  it("validates a correct buddy definition", () => {
    const result = buddyDefinitionSchema.safeParse(validBuddy);
    expect(result.success).toBe(true);
  });

  it("rejects invalid id format", () => {
    const result = buddyDefinitionSchema.safeParse({
      ...validBuddy,
      id: "Bad Name!",
    });
    expect(result.success).toBe(false);
  });

  it("requires idle animation", () => {
    const result = buddyDefinitionSchema.safeParse({
      ...validBuddy,
      animations: {
        happy: { frameDuration: 500, loop: true, frames: ["f1"] },
      },
    });
    expect(result.success).toBe(false);
  });

  it("requires greetings dialogue", () => {
    const result = buddyDefinitionSchema.safeParse({
      ...validBuddy,
      dialogue: {
        idle: ["..."],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects stats outside 1-10 range", () => {
    const result = buddyDefinitionSchema.safeParse({
      ...validBuddy,
      stats: { ...validBuddy.stats, wisdom: 11 },
    });
    expect(result.success).toBe(false);
  });

  it("accepts level unlocks", () => {
    const result = buddyDefinitionSchema.safeParse({
      ...validBuddy,
      levelUnlocks: {
        "2": [
          {
            type: "dialogue",
            category: "idle",
            entries: ["New dialogue!"],
          },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it("defaults levelUnlocks to empty", () => {
    const result = buddyDefinitionSchema.safeParse(validBuddy);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.levelUnlocks).toEqual({});
    }
  });
});
