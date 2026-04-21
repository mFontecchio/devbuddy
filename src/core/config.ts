import fs from "fs";
import path from "path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { getConfigDir } from "../utils/platform.js";
import { DEFAULT_CONFIG, type DevBuddyConfig } from "../types/config.js";

const CONFIG_FILE = "config.yaml";

export function getConfigPath(): string {
  return path.join(getConfigDir(), CONFIG_FILE);
}

export function loadConfig(overrides?: Partial<DevBuddyConfig>): DevBuddyConfig {
  const configPath = getConfigPath();
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

export function saveConfigPatch(patch: Partial<DevBuddyConfig>): void {
  const configPath = getConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });

  let current: Partial<DevBuddyConfig> = {};
  if (fs.existsSync(configPath)) {
    try {
      current = parseYaml(fs.readFileSync(configPath, "utf-8")) || {};
    } catch {
      current = {};
    }
  }
  const next = { ...current, ...patch };
  fs.writeFileSync(configPath, stringifyYaml(next), "utf-8");
}
