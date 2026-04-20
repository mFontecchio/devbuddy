import { describe, it, expect, beforeEach } from "vitest";
import { PatternMatcher } from "../../../src/monitor/pattern-matcher.js";

describe("PatternMatcher", () => {
  let matcher: PatternMatcher;

  beforeEach(() => {
    matcher = new PatternMatcher();
  });

  it("detects test passing", () => {
    const result = matcher.match("  12 passing (3s)");
    expect(result).not.toBeNull();
    expect(result!.event).toBe("test:pass");
  });

  it("detects test failing", () => {
    const result = matcher.match("  3 failing");
    expect(result).not.toBeNull();
    expect(result!.event).toBe("test:fail");
  });

  it("detects TypeScript errors", () => {
    const result = matcher.match("src/index.ts(5,3): error TS2304: Cannot find name 'foo'.");
    expect(result).not.toBeNull();
    expect(result!.event).toBe("compile:error");
  });

  it("detects git commits", () => {
    const result = matcher.match("[main abc1234] Fix the bug");
    expect(result).not.toBeNull();
    expect(result!.event).toBe("git:commit");
  });

  it("detects npm install", () => {
    const result = matcher.match("added 42 packages in 5s");
    expect(result).not.toBeNull();
    expect(result!.event).toBe("npm:install");
  });

  it("detects generic errors", () => {
    const result = matcher.match("Error: Something went wrong");
    expect(result).not.toBeNull();
    expect(result!.event).toBe("generic:error");
  });

  it("returns null for unrecognized output", () => {
    const result = matcher.match("just some normal text output");
    expect(result).toBeNull();
  });

  it("detects SyntaxError", () => {
    const result = matcher.match("SyntaxError: Unexpected token");
    expect(result).not.toBeNull();
    expect(result!.event).toBe("runtime:error");
  });

  it("respects cooldown (same event not fired twice within window)", () => {
    const result1 = matcher.match("  5 passing (1s)");
    expect(result1).not.toBeNull();

    // Same event immediately should be cooldown-blocked
    const result2 = matcher.match("  10 passing (2s)");
    expect(result2).toBeNull();
  });
});
