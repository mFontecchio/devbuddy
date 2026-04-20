import Conf from "conf";
import type { PersistedState, BuddyProgress } from "../types/progression.js";
import { DEFAULT_BUDDY_PROGRESS } from "../types/progression.js";
import { log } from "../utils/logger.js";

const STATE_VERSION = 1;

const store = new Conf<PersistedState>({
  projectName: "devbuddy",
  defaults: {
    version: STATE_VERSION,
    activeBuddyId: "",
    buddyStates: {},
    streakDays: 0,
    lastSessionDate: "",
  },
});

export function loadState(): PersistedState {
  const state = store.store;
  log("debug", "Loaded persisted state", {
    activeBuddy: state.activeBuddyId,
    buddyCount: Object.keys(state.buddyStates).length,
  });
  return state;
}

export function saveState(state: PersistedState): void {
  store.store = state;
  log("debug", "Saved persisted state");
}

export function getBuddyProgress(buddyId: string): BuddyProgress {
  const state = store.store;
  return state.buddyStates[buddyId] || { ...DEFAULT_BUDDY_PROGRESS };
}

export function saveBuddyProgress(buddyId: string, progress: BuddyProgress): void {
  const state = store.store;
  state.buddyStates[buddyId] = progress;
  store.store = state;
}

export function getActiveBuddyId(): string {
  return store.get("activeBuddyId");
}

export function setActiveBuddyId(id: string): void {
  store.set("activeBuddyId", id);
}

export function updateStreak(): number {
  const today = new Date().toISOString().split("T")[0];
  const lastDate = store.get("lastSessionDate");

  if (lastDate === today) {
    // Already logged today
    return store.get("streakDays");
  }

  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  if (lastDate === yesterday) {
    // Consecutive day
    const newStreak = store.get("streakDays") + 1;
    store.set("streakDays", newStreak);
    store.set("lastSessionDate", today);
    return newStreak;
  }

  // Streak broken
  store.set("streakDays", 1);
  store.set("lastSessionDate", today);
  return 1;
}

export function getStorePath(): string {
  return store.path;
}
