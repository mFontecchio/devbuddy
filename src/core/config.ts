import fs from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";
import { getConfigDir } from "../utils/platform.js";
import { DEFAULT_CONFIG, type DevBuddyConfig } from "../types/config.js";

const CONFIG_FILE = "config.yaml";

export function loadConfig(overrides?: Partial<DevBuddyConfig>): DevBuddyConfig {
  const configPath = path.join(getConfigDir(), CONFIG_FILE);
  let fileConfig: Partial<DevBuddyConfig> = {};

  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, "utf-8");
      fileConfig = parseYaml(raw) || {};
    } catch {
      // Ignore malformed config, use defaults
    }
  }

  return {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    ...overrides,
  };
}
