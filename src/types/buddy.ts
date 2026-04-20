export interface AnimationDef {
  frameDuration: number;
  loop: boolean;
  returnTo?: string;
  frames: string[];
}

export interface CosmeticOverlay {
  row: number;
  col: number;
  art: string;
}

export type LevelUnlock =
  | { type: "dialogue"; category: string; entries: string[] }
  | { type: "animation"; name: string; definition: AnimationDef }
  | { type: "cosmetic"; name: string; overlay: CosmeticOverlay };

export interface BuddyStats {
  wisdom: number;
  energy: number;
  humor: number;
  debugSkill: number;
  patience: number;
}

export interface BuddyPersonality {
  traits: string[];
  speechStyle: string;
  catchphrase: string;
}

export interface BuddyDefinition {
  id: string;
  name: string;
  description: string;
  version: number;
  appearance: { width: number; height: number };
  stats: BuddyStats;
  personality: BuddyPersonality;
  animations: Record<string, AnimationDef>;
  dialogue: Record<string, string[]>;
  levelUnlocks: Record<number, LevelUnlock[]>;
}
