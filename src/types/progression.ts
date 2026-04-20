export interface BuddyProgress {
  xp: number;
  level: number;
  unlockedAnimations: string[];
  unlockedDialogue: Record<string, string[]>;
  equippedCosmetics: string[];
  totalSessions: number;
  totalCommands: number;
}

export interface PersistedState {
  version: number;
  activeBuddyId: string;
  buddyStates: Record<string, BuddyProgress>;
  streakDays: number;
  lastSessionDate: string;
}

export const DEFAULT_BUDDY_PROGRESS: BuddyProgress = {
  xp: 0,
  level: 1,
  unlockedAnimations: [],
  unlockedDialogue: {},
  equippedCosmetics: [],
  totalSessions: 0,
  totalCommands: 0,
};
