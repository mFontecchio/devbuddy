import { describe, it, expect } from "vitest";
import { BuddyInstance } from "../../../src/buddy/instance.js";
import type { BuddyDefinition } from "../../../src/types/buddy.js";

const testDefinition: BuddyDefinition = {
  id: "test",
  name: "Test",
  description: "Test buddy",
  version: 1,
  appearance: { width: 10, height: 5 },
  stats: { wisdom: 5, energy: 5, humor: 5, debugSkill: 5, patience: 5 },
  personality: {
    traits: ["friendly"],
    speechStyle: "Normal",
    catchphrase: "Hi!",
  },
  animations: {
    idle: { frameDuration: 500, loop: true, frames: ["idle-0", "idle-1"] },
    happy: { frameDuration: 300, loop: false, returnTo: "idle", frames: ["happy-0"] },
  },
  dialogue: {
    greetings: ["Hello!", "Hi there!"],
    idle: ["Waiting..."],
  },
  levelUnlocks: {
    2: [
      { type: "dialogue", category: "idle", entries: ["New line!"] },
    ],
  },
};

describe("BuddyInstance", () => {
  it("initializes with default progress", () => {
    const instance = new BuddyInstance(testDefinition);
    expect(instance.id).toBe("test");
    expect(instance.name).toBe("Test");
    expect(instance.level).toBe(1);
    expect(instance.xp).toBe(0);
  });

  it("returns dialogue from a category", () => {
    const instance = new BuddyInstance(testDefinition);
    const greeting = instance.getDialogue("greetings");
    expect(["Hello!", "Hi there!"]).toContain(greeting);
  });

  it("returns undefined for unknown dialogue category", () => {
    const instance = new BuddyInstance(testDefinition);
    expect(instance.getDialogue("nonexistent")).toBeUndefined();
  });

  it("applies level unlocks", () => {
    const instance = new BuddyInstance(testDefinition);
    const descriptions = instance.applyLevelUnlocks(2);
    expect(descriptions).toHaveLength(1);
    expect(descriptions[0]).toContain("dialogue");

    // Idle pool should now include the new line
    const pool = instance.getDialoguePool("idle");
    expect(pool).toContain("New line!");
    expect(pool).toContain("Waiting...");
  });

  it("delegates animation to animator", () => {
    const instance = new BuddyInstance(testDefinition);
    instance.setAnimation("happy");
    expect(instance.animator.state).toBe("happy");
  });

  it("ticks the animator", () => {
    const instance = new BuddyInstance(testDefinition);
    expect(instance.animator.frameIndex).toBe(0);
    instance.tick(500);
    expect(instance.animator.frameIndex).toBe(1);
  });
});
