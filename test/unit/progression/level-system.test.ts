import { describe, it, expect } from "vitest";
import {
  xpForLevel,
  cumulativeXpForLevel,
  levelFromXp,
  levelProgress,
  xpToNextLevel,
} from "../../../src/progression/level-system.js";

describe("level-system", () => {
  it("level 1 requires 0 XP", () => {
    expect(xpForLevel(1)).toBe(0);
  });

  it("level 2 requires 100 XP", () => {
    expect(xpForLevel(2)).toBe(100);
  });

  it("XP requirements increase exponentially", () => {
    const l2 = xpForLevel(2);
    const l3 = xpForLevel(3);
    const l4 = xpForLevel(4);
    expect(l3).toBeGreaterThan(l2);
    expect(l4).toBeGreaterThan(l3);
  });

  it("levelFromXp returns correct level", () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(50)).toBe(1);
    expect(levelFromXp(100)).toBe(2);
    expect(levelFromXp(250)).toBe(3);
  });

  it("cumulativeXpForLevel is consistent with levelFromXp", () => {
    for (let level = 1; level <= 10; level++) {
      const cumXp = cumulativeXpForLevel(level);
      expect(levelFromXp(cumXp)).toBe(level);
    }
  });

  it("levelProgress returns 0-1 range", () => {
    const progress = levelProgress(50); // Halfway to level 2
    expect(progress).toBeGreaterThanOrEqual(0);
    expect(progress).toBeLessThanOrEqual(1);
    expect(progress).toBeCloseTo(0.5);
  });

  it("xpToNextLevel returns correct remaining XP", () => {
    const remaining = xpToNextLevel(0);
    expect(remaining).toBe(100); // Need 100 XP to reach level 2
  });

  it("xpToNextLevel at level boundary", () => {
    const remaining = xpToNextLevel(100); // Just reached level 2
    expect(remaining).toBe(xpForLevel(3)); // Need full next level XP
  });
});
