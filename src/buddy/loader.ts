import fs from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";
import { buddyDefinitionSchema } from "./schema.js";
import type { BuddyDefinition } from "../types/buddy.js";
import { log } from "../utils/logger.js";

export function loadBuddyFile(filePath: string): BuddyDefinition {
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = parseYaml(raw);
  const result = buddyDefinitionSchema.parse(parsed);

  // Convert the validated Zod output to our BuddyDefinition type
  // The levelUnlocks keys come as string from YAML but we need number keys
  const levelUnlocks: Record<number, BuddyDefinition["levelUnlocks"][number]> = {};
  for (const [key, value] of Object.entries(result.levelUnlocks)) {
    levelUnlocks[parseInt(key, 10)] = value as BuddyDefinition["levelUnlocks"][number];
  }

  return {
    ...result,
    levelUnlocks,
  } as BuddyDefinition;
}

export function loadBuddiesFromDir(dirPath: string): BuddyDefinition[] {
  if (!fs.existsSync(dirPath)) return [];

  const buddies: BuddyDefinition[] = [];
  const files = fs.readdirSync(dirPath).filter(
    (f) => (f.endsWith(".yaml") || f.endsWith(".yml")) && !f.startsWith("_"),
  );

  for (const file of files) {
    try {
      const buddy = loadBuddyFile(path.join(dirPath, file));
      buddies.push(buddy);
      log("info", `Loaded buddy: ${buddy.name} (${buddy.id})`, { file });
    } catch (err) {
      log("warn", `Failed to load buddy from ${file}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return buddies;
}
