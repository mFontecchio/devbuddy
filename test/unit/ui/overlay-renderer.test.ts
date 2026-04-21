import { describe, it, expect } from "vitest";
import {
  ANSI,
  buildRegionLines,
  computeRegion,
  diffLines,
  renderInit,
  renderTeardown,
  renderWrites,
} from "../../../src/ui/overlay-renderer.js";
import type { BuddyStateUpdate } from "../../../src/daemon/protocol.js";

function makeState(overrides: Partial<BuddyStateUpdate> = {}): BuddyStateUpdate {
  return {
    type: "state",
    buddy: {
      id: "test",
      name: "Test",
      stats: { wisdom: 5, energy: 5, humor: 5, debugSkill: 5, patience: 5 },
      personality: { traits: ["friendly"], speechStyle: "calm", catchphrase: "hi" },
    },
    animation: {
      state: "idle",
      frameIndex: 0,
      frameLines: ["o_o", "/|\\", "/ \\"],
    },
    speech: null,
    progress: {
      level: 1,
      xp: 0,
      totalSessions: 1,
      totalCommands: 0,
      unlockedAnimations: [],
      unlockedDialogue: {},
      equippedCosmetics: [],
    },
    xpProgress: 0.25,
    xpToNext: 75,
    ...overrides,
  };
}

describe("overlay-renderer / computeRegion", () => {
  it("bottom anchor reserves the bottom N rows and sets scroll region above", () => {
    const r = computeRegion({ termRows: 30, termCols: 80, anchor: "bottom", height: 8 });
    expect(r.top).toBe(23);
    expect(r.bottom).toBe(30);
    expect(r.width).toBe(80);
    expect(r.scrollTop).toBe(1);
    expect(r.scrollBottom).toBe(22);
    expect(r.anchor).toBe("bottom");
  });

  it("top anchor reserves the top N rows and sets scroll region below", () => {
    const r = computeRegion({ termRows: 30, termCols: 80, anchor: "top", height: 6 });
    expect(r.top).toBe(1);
    expect(r.bottom).toBe(6);
    expect(r.scrollTop).toBe(7);
    expect(r.scrollBottom).toBe(30);
  });

  it("clamps height to at least 3 rows and leaves room for the shell", () => {
    const r = computeRegion({ termRows: 10, termCols: 40, anchor: "bottom", height: 50 });
    expect(r.bottom - r.top + 1).toBeLessThanOrEqual(7); // termRows - 4 - 1 margin
    expect(r.bottom - r.top + 1).toBeGreaterThanOrEqual(3);
  });
});

describe("overlay-renderer / buildRegionLines", () => {
  it("produces exactly height lines of exactly width characters", () => {
    const state = makeState();
    const lines = buildRegionLines({ state, width: 30, height: 8 });
    expect(lines.length).toBe(8);
    for (const l of lines) {
      expect(l.length).toBe(30);
    }
  });

  it("pads with trailing spaces so stale content is erased", () => {
    const state = makeState();
    const lines = buildRegionLines({ state, width: 40, height: 6 });
    for (const l of lines) expect(l.length).toBe(40);
    // status line contains the name and Lv. token
    expect(lines[1]).toContain("Test");
    expect(lines[1]).toContain("Lv.1");
  });

  it("renders speech when present", () => {
    const state = makeState({ speech: "hello there" });
    const lines = buildRegionLines({ state, width: 40, height: 6 });
    expect(lines.some((l) => l.includes("hello there"))).toBe(true);
  });

  it("shows a blank speech row when speech is null", () => {
    const state = makeState({ speech: null });
    const lines = buildRegionLines({ state, width: 40, height: 6 });
    // Third row (index 2) is the speech slot; should not contain the box char when no speech.
    expect(lines[2].trim().length).toBe(0);
  });
});

describe("overlay-renderer / diffLines", () => {
  it("returns no writes when next equals prev", () => {
    const lines = ["a   ", "b   ", "c   "];
    expect(diffLines(lines, lines, 10)).toEqual([]);
  });

  it("emits only changed rows with absolute positions", () => {
    const prev = ["aaa", "bbb", "ccc"];
    const next = ["aaa", "bXb", "ccc"];
    const writes = diffLines(prev, next, 5);
    expect(writes).toEqual([{ row: 6, col: 1, text: "bXb" }]);
  });

  it("treats null prev as all-dirty", () => {
    const next = ["x", "y"];
    const writes = diffLines(null, next, 1);
    expect(writes).toHaveLength(2);
    expect(writes[0]).toEqual({ row: 1, col: 1, text: "x" });
    expect(writes[1]).toEqual({ row: 2, col: 1, text: "y" });
  });
});

describe("overlay-renderer / ANSI helpers", () => {
  it("renderInit includes scroll-region setup, absolute moves, and cursor save/restore", () => {
    const region = computeRegion({ termRows: 30, termCols: 40, anchor: "bottom", height: 5 });
    const out = renderInit(region, ["a", "b", "c", "d", "e"]);
    expect(out).toContain(ANSI.SAVE_CURSOR);
    expect(out).toContain(ANSI.setScrollRegion(region.scrollTop, region.scrollBottom));
    expect(out).toContain(ANSI.moveTo(region.top, 1));
    // Should move the cursor back into the scroll area at the end
    expect(out.endsWith(ANSI.moveTo(region.scrollBottom, 1)) || out.endsWith(ANSI.moveTo(region.scrollTop, 1))).toBe(true);
  });

  it("renderWrites is empty when there are no changes", () => {
    expect(renderWrites([])).toBe("");
  });

  it("renderWrites wraps writes with save/restore cursor", () => {
    const out = renderWrites([{ row: 2, col: 1, text: "hi" }]);
    expect(out.startsWith(ANSI.SAVE_CURSOR)).toBe(true);
    expect(out.endsWith(ANSI.RESTORE_CURSOR)).toBe(true);
    expect(out).toContain("hi");
  });

  it("renderTeardown clears rows, resets scroll region, and shows the cursor", () => {
    const region = computeRegion({ termRows: 30, termCols: 20, anchor: "bottom", height: 4 });
    const out = renderTeardown(region);
    expect(out).toContain(ANSI.RESET_SCROLL_REGION);
    expect(out).toContain(ANSI.SHOW_CURSOR);
    expect(out).toContain(ANSI.moveTo(region.top, 1));
  });
});
