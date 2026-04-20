import type { AnimationDef } from "../types/buddy.js";

export class Animator {
  private animations: Record<string, AnimationDef>;
  private currentState: string;
  private currentFrameIndex = 0;
  private elapsedMs = 0;
  private playOnceComplete = false;

  constructor(animations: Record<string, AnimationDef>, initialState = "idle") {
    this.animations = animations;
    this.currentState = initialState;
  }

  get state(): string {
    return this.currentState;
  }

  get frameIndex(): number {
    return this.currentFrameIndex;
  }

  getCurrentFrame(): string {
    const anim = this.animations[this.currentState];
    if (!anim || anim.frames.length === 0) return "";
    return anim.frames[this.currentFrameIndex];
  }

  getCurrentFrameLines(): string[] {
    return this.getCurrentFrame().split("\n");
  }

  setState(state: string): void {
    if (!(state in this.animations)) return;
    if (state === this.currentState && !this.playOnceComplete) return;

    this.currentState = state;
    this.currentFrameIndex = 0;
    this.elapsedMs = 0;
    this.playOnceComplete = false;
  }

  tick(deltaMs: number): void {
    const anim = this.animations[this.currentState];
    if (!anim || anim.frames.length <= 1) return;

    this.elapsedMs += deltaMs;

    if (this.elapsedMs >= anim.frameDuration) {
      this.elapsedMs -= anim.frameDuration;
      this.advanceFrame(anim);
    }
  }

  private advanceFrame(anim: AnimationDef): void {
    const nextIndex = this.currentFrameIndex + 1;

    if (nextIndex >= anim.frames.length) {
      if (anim.loop) {
        this.currentFrameIndex = 0;
      } else {
        // Play-once animation complete
        this.playOnceComplete = true;
        if (anim.returnTo && anim.returnTo in this.animations) {
          this.setState(anim.returnTo);
        }
        // If no returnTo, stay on last frame
      }
    } else {
      this.currentFrameIndex = nextIndex;
    }
  }

  addAnimation(name: string, def: AnimationDef): void {
    this.animations[name] = def;
  }

  hasAnimation(name: string): boolean {
    return name in this.animations;
  }
}
