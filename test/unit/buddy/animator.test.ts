import { describe, it, expect } from "vitest";
import { Animator } from "../../../src/buddy/animator.js";
import type { AnimationDef } from "../../../src/types/buddy.js";

const testAnimations: Record<string, AnimationDef> = {
  idle: {
    frameDuration: 500,
    loop: true,
    frames: ["frame-idle-0", "frame-idle-1", "frame-idle-2"],
  },
  happy: {
    frameDuration: 300,
    loop: false,
    returnTo: "idle",
    frames: ["frame-happy-0", "frame-happy-1"],
  },
  sad: {
    frameDuration: 600,
    loop: false,
    frames: ["frame-sad-0", "frame-sad-1"],
  },
};

describe("Animator", () => {
  it("starts in the initial state", () => {
    const animator = new Animator(testAnimations, "idle");
    expect(animator.state).toBe("idle");
    expect(animator.frameIndex).toBe(0);
    expect(animator.getCurrentFrame()).toBe("frame-idle-0");
  });

  it("advances frames based on elapsed time", () => {
    const animator = new Animator(testAnimations, "idle");

    // Not enough time to advance
    animator.tick(400);
    expect(animator.frameIndex).toBe(0);

    // Enough to advance one frame
    animator.tick(100);
    expect(animator.frameIndex).toBe(1);

    // Advance to frame 2
    animator.tick(500);
    expect(animator.frameIndex).toBe(2);
  });

  it("loops back to frame 0 when loop is true", () => {
    const animator = new Animator(testAnimations, "idle");

    // Advance through all 3 frames
    animator.tick(500); // -> frame 1
    animator.tick(500); // -> frame 2
    animator.tick(500); // -> frame 0 (loop)
    expect(animator.frameIndex).toBe(0);
    expect(animator.state).toBe("idle");
  });

  it("returns to specified state when play-once completes", () => {
    const animator = new Animator(testAnimations, "idle");
    animator.setState("happy");
    expect(animator.state).toBe("happy");

    // Advance through 2 happy frames
    animator.tick(300); // -> frame 1
    animator.tick(300); // -> done, returnTo idle
    expect(animator.state).toBe("idle");
    expect(animator.frameIndex).toBe(0);
  });

  it("stays on last frame when play-once has no returnTo", () => {
    const animator = new Animator(testAnimations, "idle");
    animator.setState("sad");

    animator.tick(600); // -> frame 1
    animator.tick(600); // -> done, no returnTo
    expect(animator.state).toBe("sad");
    expect(animator.frameIndex).toBe(1); // stays on last frame
  });

  it("ignores setState for unknown animations", () => {
    const animator = new Animator(testAnimations, "idle");
    animator.setState("nonexistent");
    expect(animator.state).toBe("idle");
  });

  it("can switch states", () => {
    const animator = new Animator(testAnimations, "idle");
    animator.tick(500); // advance to frame 1
    expect(animator.frameIndex).toBe(1);

    animator.setState("happy");
    expect(animator.state).toBe("happy");
    expect(animator.frameIndex).toBe(0); // reset to 0
  });

  it("splits frame into lines", () => {
    const multiLineAnims: Record<string, AnimationDef> = {
      idle: {
        frameDuration: 500,
        loop: true,
        frames: ["line1\nline2\nline3"],
      },
    };
    const animator = new Animator(multiLineAnims);
    expect(animator.getCurrentFrameLines()).toEqual(["line1", "line2", "line3"]);
  });

  it("can add animations dynamically", () => {
    const animator = new Animator(testAnimations, "idle");
    expect(animator.hasAnimation("dancing")).toBe(false);

    animator.addAnimation("dancing", {
      frameDuration: 300,
      loop: true,
      frames: ["dance-0", "dance-1"],
    });

    expect(animator.hasAnimation("dancing")).toBe(true);
    animator.setState("dancing");
    expect(animator.state).toBe("dancing");
  });
});
