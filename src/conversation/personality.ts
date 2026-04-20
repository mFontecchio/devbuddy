import type { BuddyStats } from "../types/buddy.js";

/** Weight response selection based on buddy personality stats */
export function weightedSelect(
  pool: string[],
  stats: BuddyStats,
  category: string,
): string {
  if (pool.length === 0) return "";
  if (pool.length === 1) return pool[0];

  // Use stats to influence which responses are more likely
  // Higher humor = prefer funnier (later entries tend to be funnier in our pools)
  // Higher wisdom = prefer more insightful
  // Higher energy = prefer more enthusiastic

  const weights = pool.map((_, i) => {
    let weight = 1;

    // Energy affects enthusiasm - energetic buddies prefer exclamation-heavy responses
    if (stats.energy > 6) {
      weight += pool[i].includes("!") ? 0.5 : 0;
    }

    // Humor affects preference for lighter responses (later entries in pool)
    if (stats.humor > 6) {
      weight += (i / pool.length) * 0.5;
    }

    // Wisdom affects preference for deeper responses (earlier entries tend to be more thoughtful)
    if (stats.wisdom > 6 && (category === "idle" || category === "encouragement")) {
      weight += ((pool.length - i) / pool.length) * 0.5;
    }

    return weight;
  });

  // Weighted random selection
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;

  for (let i = 0; i < pool.length; i++) {
    random -= weights[i];
    if (random <= 0) return pool[i];
  }

  return pool[pool.length - 1];
}
