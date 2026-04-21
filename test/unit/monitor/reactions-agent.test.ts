import { describe, it, expect } from "vitest";
import { getReaction, getAllReactionEvents } from "../../../src/monitor/reactions.js";

describe("reactions / agent events", () => {
  const expected = [
    "agent:prompt",
    "agent:tool",
    "agent:edit",
    "agent:complete",
    "agent:error",
    "agent:stop",
  ];

  it("exposes reactions for every agent event key", () => {
    for (const key of expected) {
      const r = getReaction(key);
      expect(r).toBeTruthy();
      expect(typeof r!.animation).toBe("string");
      expect(typeof r!.dialogueCategory).toBe("string");
      expect(typeof r!.xp).toBe("number");
    }
  });

  it("includes agent events in getAllReactionEvents()", () => {
    const all = getAllReactionEvents();
    for (const key of expected) {
      expect(all).toContain(key);
    }
  });

  it("maps agent:error to a sad animation", () => {
    const r = getReaction("agent:error");
    expect(r?.animation).toBe("sad");
  });

  it("maps agent:complete to a positive animation and category", () => {
    const r = getReaction("agent:complete");
    expect(["happy", "celebrating"]).toContain(r!.animation);
    expect(r!.dialogueCategory).toBe("agentComplete");
  });
});
