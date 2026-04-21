import { describe, it, expect } from "vitest";
import {
  buildSpriteLines,
  computeSpriteRegion,
  diffSpriteLines,
  renderSpriteInit,
  renderSpriteTeardown,
  renderSpriteWrites,
} from "../../../src/ui/chat-sprite-layer.js";
import type { BuddyStateUpdate } from "../../../src/daemon/protocol.js";

function makeState(overrides: Partial<BuddyStateUpdate> = {}): BuddyStateUpdate {
  return {
    type: "state",
    buddy: {
      id: "pixel",
      name: "Pixel",
      stats: { wisdom: 5, energy: 5, humor: 5, debugSkill: 5, patience: 5 },
      personality: { traits: ["friendly"], speechStyle: "calm", catchphrase: "hi" },
    },
    animation: {
      state: "idle",
      frameIndex: 0,
      frameLines: ["o_o", "/|\\", "/ \\"],
    },
    speech: null,
    progress: { level: 3, xp: 120, streak: 0, lastActive: 0, totalChats: 0, totalCommands: 0, unlocks: [] as string[] } as unknown as BuddyStateUpdate["progress"],
    xpProgress: 0.25,
    xpToNext: 80,
    ...overrides,
  };
}

describe("computeSpriteRegion", () => {
  it("reserves the top N rows and pushes Ink below", () => {
    const r = computeSpriteRegion({ termRows: 30, termCols: 100, height: 6 });
    expect(r.top).toBe(1);
    expect(r.bottom).toBe(6);
    expect(r.width).toBe(100);
    expect(r.inkTop).toBe(7);
    expect(r.termRows).toBe(30);
  });

  it("clamps to leave enough space for the Ink half on small terms", () => {
    const r = computeSpriteRegion({ termRows: 10, termCols: 80, height: 8 });
    expect(r.bottom).toBeLessThanOrEqual(4);
    expect(r.inkTop).toBeGreaterThanOrEqual(5);
  });

  it("enforces a minimum sprite-region height", () => {
    const r = computeSpriteRegion({ termRows: 8, termCols: 80, height: 2 });
    expect(r.bottom - r.top + 1).toBeGreaterThanOrEqual(3);
  });
});

describe("buildSpriteLines", () => {
  it("produces exactly `height` lines, each exactly `width` wide", () => {
    const lines = buildSpriteLines({
      state: makeState(),
      connected: true,
      width: 60,
      height: 6,
      showSprite: true,
    });
    expect(lines).toHaveLength(6);
    for (const line of lines) expect(line.length).toBe(60);
  });

  it("row 0 is a status line containing name, level, xp percent, and connection", () => {
    const lines = buildSpriteLines({
      state: makeState({ xpProgress: 0.5 }),
      connected: true,
      width: 80,
      height: 6,
      showSprite: true,
    });
    expect(lines[0]).toContain("Pixel");
    expect(lines[0]).toContain("Lv.3");
    expect(lines[0]).toContain("50%");
    expect(lines[0]).toContain("connected");
  });

  it("shows 'reconnecting' when disconnected", () => {
    const lines = buildSpriteLines({
      state: makeState(),
      connected: false,
      width: 80,
      height: 6,
      showSprite: true,
    });
    expect(lines[0]).toContain("reconnecting");
  });

  it("row 1 is a full-width horizontal rule", () => {
    const lines = buildSpriteLines({
      state: makeState(),
      connected: true,
      width: 20,
      height: 6,
      showSprite: true,
    });
    expect(lines[1]).toBe("\u2500".repeat(20));
  });

  it("centers the sprite frame horizontally inside sprite rows", () => {
    const lines = buildSpriteLines({
      state: makeState({
        animation: { state: "idle", frameIndex: 0, frameLines: ["*"] },
      }),
      connected: true,
      width: 11,
      height: 6,
      showSprite: true,
    });
    const spriteRow = lines.find((l) => l.includes("*"));
    expect(spriteRow).toBeDefined();
    expect(spriteRow!.indexOf("*")).toBe(5);
  });

  it("emits blank sprite rows when showSprite is false", () => {
    const lines = buildSpriteLines({
      state: makeState(),
      connected: true,
      width: 20,
      height: 6,
      showSprite: false,
    });
    expect(lines.slice(2).every((l) => l === " ".repeat(20))).toBe(true);
  });

  it("handles a null state by rendering a sensible default status row", () => {
    const lines = buildSpriteLines({
      state: null,
      connected: false,
      width: 60,
      height: 6,
      showSprite: true,
    });
    expect(lines).toHaveLength(6);
    expect(lines[0]).toContain("buddy");
    expect(lines[0]).toContain("Lv.1");
  });
});

describe("diffSpriteLines", () => {
  it("returns no writes when nothing changed", () => {
    const next = ["aaa", "bbb", "ccc"];
    expect(diffSpriteLines(next, next, 1)).toEqual([]);
  });

  it("returns only the rows that changed, with absolute row numbers", () => {
    const prev = ["aaa", "bbb", "ccc"];
    const next = ["aaa", "BBB", "ccc"];
    const writes = diffSpriteLines(prev, next, 1);
    expect(writes).toEqual([{ row: 2, text: "BBB", regionIndex: 1 }]);
  });

  it("emits writes for every row when prev is null (first paint)", () => {
    const next = ["aaa", "bbb", "ccc"];
    const writes = diffSpriteLines(null, next, 1);
    expect(writes).toHaveLength(3);
    expect(writes.map((w) => w.row)).toEqual([1, 2, 3]);
  });
});

describe("renderSpriteWrites", () => {
  it("returns empty string for no writes", () => {
    expect(renderSpriteWrites([])).toBe("");
  });

  it("wraps the batch in DEC 2026 sync output and save/restore cursor", () => {
    const out = renderSpriteWrites([{ row: 3, text: "hi", regionIndex: 2 }]);
    expect(out.startsWith("\u001b[?2026h")).toBe(true);
    expect(out.endsWith("\u001b[?2026l")).toBe(true);
    expect(out).toContain("\u001b7"); // save cursor
    expect(out).toContain("\u001b8"); // restore cursor
    expect(out).toContain("\u001b[?25l"); // hide cursor
    expect(out).toContain("\u001b[?25h"); // show cursor
  });

  it("positions the cursor and clears the line for each write", () => {
    const out = renderSpriteWrites([
      { row: 1, text: "header", regionIndex: 0 },
      { row: 4, text: "sprite", regionIndex: 3 },
    ]);
    expect(out).toContain("\u001b[1;1H");
    expect(out).toContain("\u001b[4;1H");
    expect(out).toContain("\u001b[2K");
    expect(out).toContain("header");
    expect(out).toContain("sprite");
  });
});

describe("renderSpriteInit", () => {
  it("sets a scroll region starting at inkTop and parks cursor there", () => {
    const region = computeSpriteRegion({
      termRows: 30,
      termCols: 80,
      height: 6,
    });
    const out = renderSpriteInit(region, [
      "l0",
      "l1",
      "l2",
      "l3",
      "l4",
      "l5",
    ]);
    expect(out).toContain(`\u001b[${region.inkTop};${region.termRows}r`);
    expect(out).toContain(`\u001b[${region.inkTop};1H`);
  });
});

describe("renderSpriteTeardown", () => {
  it("clears each sprite row, resets the scroll region, and shows the cursor", () => {
    const region = computeSpriteRegion({
      termRows: 30,
      termCols: 80,
      height: 6,
    });
    const out = renderSpriteTeardown(region);
    for (let r = region.top; r <= region.bottom; r++) {
      expect(out).toContain(`\u001b[${r};1H`);
    }
    expect(out).toContain("\u001b[r");
    expect(out).toContain("\u001b[?25h");
  });
});
