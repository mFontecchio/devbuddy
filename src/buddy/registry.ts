import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { BuddyDefinition } from "../types/buddy.js";
import { loadBuddiesFromDir } from "./loader.js";
import { log } from "../utils/logger.js";

export class BuddyRegistry {
  private buddies = new Map<string, BuddyDefinition>();

  loadBuiltIn(): void {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    // In bundled dist/, __dirname is the dist folder itself (flat output).
    // In source, __dirname is src/buddy/. Try ../buddies first (dist), fall back to ../../buddies (source).
    let builtInDir = path.resolve(__dirname, "../buddies");
    if (!fs.existsSync(builtInDir)) {
      builtInDir = path.resolve(__dirname, "../../buddies");
    }
    const loaded = loadBuddiesFromDir(builtInDir);
    for (const buddy of loaded) {
      this.buddies.set(buddy.id, buddy);
    }
    log("info", `Loaded ${loaded.length} built-in buddies`);
  }

  loadFromDir(dirPath: string): void {
    const loaded = loadBuddiesFromDir(dirPath);
    for (const buddy of loaded) {
      this.buddies.set(buddy.id, buddy);
    }
    log("info", `Loaded ${loaded.length} custom buddies from ${dirPath}`);
  }

  get(id: string): BuddyDefinition | undefined {
    return this.buddies.get(id);
  }

  getAll(): BuddyDefinition[] {
    return Array.from(this.buddies.values());
  }

  getRandom(): BuddyDefinition {
    const all = this.getAll();
    if (all.length === 0) {
      throw new Error("No buddies available in registry");
    }
    return all[Math.floor(Math.random() * all.length)];
  }

  getByName(name: string): BuddyDefinition | undefined {
    return this.getAll().find(
      (b) => b.name.toLowerCase() === name.toLowerCase() || b.id === name.toLowerCase(),
    );
  }

  get size(): number {
    return this.buddies.size;
  }
}
