export interface DevBuddyConfig {
  position: "right" | "bottom";
  panelWidth: number;
  animationSpeed: number;
  speechBubbleDuration: number;
  buddiesDir: string[];
  activeBuddyId?: string;
  debugLog: boolean;
}

export const DEFAULT_CONFIG: DevBuddyConfig = {
  position: "right",
  panelWidth: 24,
  animationSpeed: 1.0,
  speechBubbleDuration: 4000,
  buddiesDir: [],
  debugLog: false,
};
