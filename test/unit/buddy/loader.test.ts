import { describe, it, expect } from "vitest";
import path from "path";
import { loadBuddyFile, loadBuddiesFromDir } from "../../../src/buddy/loader.js";

const buddiesDir = path.resolve(__dirname, "../../../buddies");

describe("loadBuddyFile", () => {
  it("loads pixel.yaml successfully", () => {
    const buddy = loadBuddyFile(path.join(buddiesDir, "pixel.yaml"));
    expect(buddy.id).toBe("pixel");
    expect(buddy.name).toBe("Pixel");
    expect(buddy.animations.idle.frames.length).toBeGreaterThan(0);
    expect(buddy.dialogue.greetings.length).toBeGreaterThan(0);
  });

  it("loads sage.yaml successfully", () => {
    const buddy = loadBuddyFile(path.join(buddiesDir, "sage.yaml"));
    expect(buddy.id).toBe("sage");
    expect(buddy.name).toBe("Sage");
    expect(buddy.stats.wisdom).toBe(9);
  });
});

describe("loadBuddiesFromDir", () => {
  it("loads all buddies from the buddies directory", () => {
    const buddies = loadBuddiesFromDir(buddiesDir);
    expect(buddies.length).toBe(4); // pixel, sage, glitch, spark (_template is skipped)
    const ids = buddies.map((b) => b.id);
    expect(ids).toContain("pixel");
    expect(ids).toContain("sage");
    expect(ids).toContain("glitch");
    expect(ids).toContain("spark");
  });

  it("returns empty array for nonexistent directory", () => {
    const buddies = loadBuddiesFromDir("/nonexistent/path");
    expect(buddies).toEqual([]);
  });
});
