import fs from "fs";
import path from "path";
import os from "os";
import type { AgentHookWriter } from "./types.js";

const DEVBUDDY_CMD = "devbuddy";

interface CursorHookCommand {
  command: string;
  _devbuddy?: true;
}

interface CursorHooksFile {
  version?: number;
  hooks?: Record<string, CursorHookCommand[]>;
  [key: string]: unknown;
}

export function cursorHooksPath(global: boolean): string {
  if (global) {
    return path.join(os.homedir(), ".cursor", "hooks.json");
  }
  return path.join(process.cwd(), ".cursor", "hooks.json");
}

function readHooks(global: boolean): CursorHooksFile {
  const p = cursorHooksPath(global);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as CursorHooksFile;
  } catch {
    return {};
  }
}

function writeHooks(file: CursorHooksFile, global: boolean): void {
  const p = cursorHooksPath(global);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  if (file.version === undefined) file.version = 1;
  fs.writeFileSync(p, JSON.stringify(file, null, 2) + "\n", "utf-8");
}

function devbuddyCmd(kind: string): string {
  return `${DEVBUDDY_CMD} agent-event --source cursor --kind ${kind}`;
}

function buildDevbuddyHooks(): Record<string, CursorHookCommand[]> {
  return {
    beforeSubmitPrompt: [{ command: devbuddyCmd("prompt_submit"), _devbuddy: true }],
    beforeShellExecution: [{ command: devbuddyCmd("tool_use"), _devbuddy: true }],
    afterFileEdit: [{ command: devbuddyCmd("file_edit"), _devbuddy: true }],
    stop: [{ command: devbuddyCmd("complete"), _devbuddy: true }],
  };
}

function stripDevbuddy(file: CursorHooksFile): CursorHooksFile {
  if (!file.hooks) return file;
  const cleaned: Record<string, CursorHookCommand[]> = {};
  for (const [event, entries] of Object.entries(file.hooks)) {
    const kept = entries.filter(
      (h) => !h._devbuddy && !h.command?.includes("devbuddy agent-event"),
    );
    if (kept.length > 0) cleaned[event] = kept;
  }
  file.hooks = cleaned;
  if (Object.keys(cleaned).length === 0) delete file.hooks;
  return file;
}

function hasDevbuddyHooks(file: CursorHooksFile): boolean {
  if (!file.hooks) return false;
  for (const entries of Object.values(file.hooks)) {
    if (entries.some((h) => h._devbuddy || h.command?.includes("devbuddy agent-event"))) {
      return true;
    }
  }
  return false;
}

export function makeCursorWriter(global: boolean): AgentHookWriter {
  return {
    tool: "cursor",
    configPath(): string {
      return cursorHooksPath(global);
    },
    isInstalled(): boolean {
      return hasDevbuddyHooks(readHooks(global));
    },
    install(): string {
      const file = readHooks(global);
      const cleaned = stripDevbuddy(file);
      const devbuddyHooks = buildDevbuddyHooks();
      const merged: Record<string, CursorHookCommand[]> = { ...(cleaned.hooks || {}) };
      for (const [event, entries] of Object.entries(devbuddyHooks)) {
        merged[event] = [...(merged[event] || []), ...entries];
      }
      cleaned.hooks = merged;
      writeHooks(cleaned, global);
      return cursorHooksPath(global);
    },
    uninstall(): string {
      const p = cursorHooksPath(global);
      if (!fs.existsSync(p)) return p;
      const file = readHooks(global);
      writeHooks(stripDevbuddy(file), global);
      return p;
    },
  };
}

export const cursorWriter: AgentHookWriter = makeCursorWriter(false);
export const cursorGlobalWriter: AgentHookWriter = makeCursorWriter(true);
