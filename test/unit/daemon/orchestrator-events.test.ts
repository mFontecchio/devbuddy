import { describe, it, expect, beforeEach } from "vitest";
import { Orchestrator } from "../../../src/daemon/orchestrator.js";
import type { RecentEventRecord } from "../../../src/daemon/protocol.js";

/**
 * Exercises the fixed-size ring buffer that backs `devbuddy doctor`.
 * The Orchestrator constructor does not open a socket or start any
 * timers, so we can push records synchronously and verify the buffer
 * semantics without touching the filesystem or network.
 */
describe("Orchestrator recent-events ring buffer", () => {
  let orchestrator: Orchestrator;

  beforeEach(() => {
    orchestrator = new Orchestrator();
  });

  function makeEvent(overrides: Partial<RecentEventRecord> = {}): RecentEventRecord {
    return {
      ts: Date.now(),
      kind: "cmd",
      summary: "npm test",
      exit: 0,
      ...overrides,
    };
  }

  it("starts empty", () => {
    expect(orchestrator.getRecentEvents()).toEqual([]);
  });

  it("records cmd events in order", () => {
    orchestrator.recordEvent(makeEvent({ summary: "first" }));
    orchestrator.recordEvent(makeEvent({ summary: "second" }));
    orchestrator.recordEvent(makeEvent({ summary: "third" }));

    const events = orchestrator.getRecentEvents();
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.summary)).toEqual(["first", "second", "third"]);
  });

  it("records agent_event records with source and subKind", () => {
    orchestrator.recordEvent(
      makeEvent({
        kind: "agent_event",
        source: "claude",
        subKind: "prompt_submit",
        summary: "claude /help",
        exit: undefined,
      }),
    );

    const [event] = orchestrator.getRecentEvents();
    expect(event.kind).toBe("agent_event");
    expect(event.source).toBe("claude");
    expect(event.subKind).toBe("prompt_submit");
  });

  it("caps the buffer at 20 entries, dropping the oldest", () => {
    for (let i = 0; i < 25; i++) {
      orchestrator.recordEvent(makeEvent({ summary: `cmd-${i}` }));
    }

    const events = orchestrator.getRecentEvents();
    expect(events).toHaveLength(20);
    // Oldest five should have been evicted; buffer should start at cmd-5
    expect(events[0].summary).toBe("cmd-5");
    expect(events[events.length - 1].summary).toBe("cmd-24");
  });

  it("returns a readonly view that reflects subsequent writes", () => {
    const view = orchestrator.getRecentEvents();
    expect(view).toHaveLength(0);
    orchestrator.recordEvent(makeEvent({ summary: "later" }));
    // The accessor returns the live internal array, so the caller sees
    // the newly pushed record without re-calling the getter.
    expect(view).toHaveLength(1);
    expect(view[0].summary).toBe("later");
  });
});
