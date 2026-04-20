/** Calculate XP needed to reach a given level (cumulative from level 1) */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.floor(100 * Math.pow(1.5, level - 2));
}

/** Calculate cumulative XP for a level */
export function cumulativeXpForLevel(level: number): number {
  let total = 0;
  for (let i = 2; i <= level; i++) {
    total += xpForLevel(i);
  }
  return total;
}

/** Calculate level from total XP */
export function levelFromXp(totalXp: number): number {
  let level = 1;
  let xpUsed = 0;
  while (true) {
    const needed = xpForLevel(level + 1);
    if (xpUsed + needed > totalXp) break;
    xpUsed += needed;
    level++;
  }
  return level;
}

/** Get XP progress within current level (0..1) */
export function levelProgress(totalXp: number): number {
  const level = levelFromXp(totalXp);
  const currentLevelStart = cumulativeXpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  if (nextLevelXp === 0) return 0;
  return (totalXp - currentLevelStart) / nextLevelXp;
}

/** Get XP remaining until next level */
export function xpToNextLevel(totalXp: number): number {
  const level = levelFromXp(totalXp);
  const currentLevelStart = cumulativeXpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  return nextLevelXp - (totalXp - currentLevelStart);
}
