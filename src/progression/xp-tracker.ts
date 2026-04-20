import { eventBus } from "../core/events.js";
import { levelFromXp } from "./level-system.js";
import { log } from "../utils/logger.js";
import type { BuddyInstance } from "../buddy/instance.js";

const THROTTLE_WINDOW_MS = 10_000;
const THROTTLE_MAX_XP = 5;

export class XpTracker {
  private buddy: BuddyInstance;
  private throttleWindow: { xp: number; start: number } = { xp: 0, start: Date.now() };

  constructor(buddy: BuddyInstance) {
    this.buddy = buddy;
  }

  /** Award XP from a source. Returns true if a level-up occurred. */
  award(amount: number, source: string): boolean {
    // Throttle generic/low-value XP
    if (amount <= 2) {
      const now = Date.now();
      if (now - this.throttleWindow.start > THROTTLE_WINDOW_MS) {
        this.throttleWindow = { xp: 0, start: now };
      }
      if (this.throttleWindow.xp >= THROTTLE_MAX_XP) {
        return false;
      }
      this.throttleWindow.xp += amount;
    }

    const oldLevel = this.buddy.progress.level;
    this.buddy.progress.xp += amount;
    const newLevel = levelFromXp(this.buddy.progress.xp);

    eventBus.emit("xp:gained", { amount, source });
    log("debug", `XP gained: +${amount} from ${source}`, {
      totalXp: this.buddy.progress.xp,
      level: newLevel,
    });

    if (newLevel > oldLevel) {
      this.buddy.progress.level = newLevel;

      // Apply all level unlocks between old and new level
      const unlockDescriptions: string[] = [];
      for (let lvl = oldLevel + 1; lvl <= newLevel; lvl++) {
        unlockDescriptions.push(...this.buddy.applyLevelUnlocks(lvl));
      }

      eventBus.emit("level:up", {
        newLevel,
        unlocks: unlockDescriptions,
      });

      log("info", `Level up! ${oldLevel} -> ${newLevel}`, { unlocks: unlockDescriptions });
      return true;
    }

    return false;
  }

  /** Award session start XP */
  awardSessionStart(): void {
    this.buddy.progress.totalSessions++;
    this.award(10, "session-start");
  }

  /** Award streak bonus */
  awardStreakBonus(streakDays: number): void {
    if (streakDays > 1) {
      this.award(10 * streakDays, "streak-bonus");
    }
  }
}
