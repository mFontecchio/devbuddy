import type { BuddyDefinition } from "../types/buddy.js";
import type { BuddyProgress } from "../types/progression.js";
import { DEFAULT_BUDDY_PROGRESS } from "../types/progression.js";
import { Animator } from "./animator.js";

export class BuddyInstance {
  readonly definition: BuddyDefinition;
  readonly animator: Animator;
  progress: BuddyProgress;
  private activeDialogue: Record<string, string[]>;

  constructor(definition: BuddyDefinition, progress?: BuddyProgress) {
    this.definition = definition;
    this.progress = progress || { ...DEFAULT_BUDDY_PROGRESS };
    this.animator = new Animator(definition.animations);

    // Build active dialogue by merging base + unlocked
    this.activeDialogue = { ...definition.dialogue };
    this.applyUnlockedDialogue();
  }

  get id(): string {
    return this.definition.id;
  }

  get name(): string {
    return this.definition.name;
  }

  get level(): number {
    return this.progress.level;
  }

  get xp(): number {
    return this.progress.xp;
  }

  getDialogue(category: string): string | undefined {
    const pool = this.activeDialogue[category];
    if (!pool || pool.length === 0) return undefined;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  getDialoguePool(category: string): string[] {
    return this.activeDialogue[category] || [];
  }

  tick(deltaMs: number): void {
    this.animator.tick(deltaMs);
  }

  setAnimation(state: string): void {
    this.animator.setState(state);
  }

  getCurrentFrameLines(): string[] {
    return this.animator.getCurrentFrameLines();
  }

  private applyUnlockedDialogue(): void {
    for (const [category, entries] of Object.entries(this.progress.unlockedDialogue)) {
      if (this.activeDialogue[category]) {
        this.activeDialogue[category] = [
          ...this.activeDialogue[category],
          ...entries,
        ];
      } else {
        this.activeDialogue[category] = entries;
      }
    }
  }

  applyLevelUnlocks(level: number): string[] {
    const unlocks = this.definition.levelUnlocks[level];
    if (!unlocks) return [];

    const descriptions: string[] = [];

    for (const unlock of unlocks) {
      switch (unlock.type) {
        case "dialogue":
          if (!this.progress.unlockedDialogue[unlock.category]) {
            this.progress.unlockedDialogue[unlock.category] = [];
          }
          this.progress.unlockedDialogue[unlock.category].push(...unlock.entries);
          if (this.activeDialogue[unlock.category]) {
            this.activeDialogue[unlock.category].push(...unlock.entries);
          } else {
            this.activeDialogue[unlock.category] = [...unlock.entries];
          }
          descriptions.push(`New ${unlock.category} dialogue!`);
          break;

        case "animation":
          this.animator.addAnimation(unlock.name, unlock.definition);
          this.progress.unlockedAnimations.push(unlock.name);
          descriptions.push(`New animation: ${unlock.name}!`);
          break;

        case "cosmetic":
          this.progress.equippedCosmetics.push(unlock.name);
          descriptions.push(`New cosmetic: ${unlock.name}!`);
          break;
      }
    }

    return descriptions;
  }
}
