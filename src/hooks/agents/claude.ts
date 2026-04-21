import fs from "fs";
import path from "path";
import os from "os";
import type { AgentHookWriter } from "./types.js";
import { DEVBUDDY_MARKER } from "./types.js";

const DEVBUDDY_CMD = "devbuddy";

interface ClaudeHookEntry {
  matcher?: string;
  hooks: Array<{
    type: "command";
    command: string;
    _devbuddy?: true;
  }>;
}

interface ClaudeSettings {
  hooks?: Record<string, ClaudeHookEntry[]>;
  [key: string]: unknown;
}

export function claudeSettingsPath(): string {
  return path.join(os.homedir(), ".claude", "settings.json");
}

function readSettings(): ClaudeSettings {
  const p = claudeSettingsPath();
  if (!fs.existsSync(p)) return {};
  try {
    const raw = fs.readFileSync(p, "utf-8");
    return JSON.parse(raw) as ClaudeSettings;
  } catch {
    return {};
  }
}

function writeSettings(settings: ClaudeSettings): void {
  const p = claudeSettingsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(settings, null, 2) + "\n", "utf-8");
}

function devbuddyCmd(kind: string, extras: string[] = []): string {
  // Shell-quote summary of args. Claude hooks run via bash/cmd
  const parts = [DEVBUDDY_CMD, "agent-event", "--source", "claude", "--kind", kind, ...extras];
  return parts.join(" ");
}

function buildDevbuddyHooks(): Record<string, ClaudeHookEntry[]> {
  return {
    UserPromptSubmit: [
      {
        hooks: [
          {
            type: "command",
            command: devbuddyCmd("prompt_submit"),
            _devbuddy: true,
          },
        ],
      },
    ],
    PreToolUse: [
      {
        matcher: ".*",
        hooks: [
          {
            type: "command",
            command: devbuddyCmd("tool_use"),
            _devbuddy: true,
          },
        ],
      },
    ],
    PostToolUse: [
      {
        matcher: "Edit|Write|MultiEdit",
        hooks: [
          {
            type: "command",
            command: devbuddyCmd("file_edit"),
            _devbuddy: true,
          },
        ],
      },
    ],
    Stop: [
      {
        hooks: [
          {
            type: "command",
            command: devbuddyCmd("complete"),
            _devbuddy: true,
          },
        ],
      },
    ],
  };
}

function stripDevbuddy(settings: ClaudeSettings): ClaudeSettings {
  if (!settings.hooks) return settings;
  const cleaned: Record<string, ClaudeHookEntry[]> = {};
  for (const [event, entries] of Object.entries(settings.hooks)) {
    const filteredEntries: ClaudeHookEntry[] = [];
    for (const entry of entries) {
      const keptHooks = entry.hooks.filter((h) => !h._devbuddy && !h.command?.includes(DEVBUDDY_MARKER));
      if (keptHooks.length > 0) {
        filteredEntries.push({ ...entry, hooks: keptHooks });
      }
    }
    if (filteredEntries.length > 0) cleaned[event] = filteredEntries;
  }
  settings.hooks = cleaned;
  if (Object.keys(cleaned).length === 0) delete settings.hooks;
  return settings;
}

function hasDevbuddyHooks(settings: ClaudeSettings): boolean {
  if (!settings.hooks) return false;
  for (const entries of Object.values(settings.hooks)) {
    for (const entry of entries) {
      if (entry.hooks.some((h) => h._devbuddy || h.command?.includes("devbuddy agent-event"))) {
        return true;
      }
    }
  }
  return false;
}

export const claudeWriter: AgentHookWriter = {
  tool: "claude",

  configPath(): string {
    return claudeSettingsPath();
  },

  isInstalled(): boolean {
    return hasDevbuddyHooks(readSettings());
  },

  install(): string {
    const settings = readSettings();
    const cleaned = stripDevbuddy(settings);
    const devbuddyHooks = buildDevbuddyHooks();
    const mergedHooks: Record<string, ClaudeHookEntry[]> = { ...(cleaned.hooks || {}) };
    for (const [event, entries] of Object.entries(devbuddyHooks)) {
      mergedHooks[event] = [...(mergedHooks[event] || []), ...entries];
    }
    cleaned.hooks = mergedHooks;
    writeSettings(cleaned);
    return claudeSettingsPath();
  },

  uninstall(): string {
    const p = claudeSettingsPath();
    if (!fs.existsSync(p)) return p;
    const settings = readSettings();
    const cleaned = stripDevbuddy(settings);
    writeSettings(cleaned);
    return p;
  },
};
