import fs from "fs";
import path from "path";
import os from "os";

let logStream: fs.WriteStream | null = null;
let enabled = false;

function getLogPath(): string {
  const platform = process.platform;
  if (platform === "win32") {
    return path.join(process.env.APPDATA || os.homedir(), "devbuddy", "debug.log");
  }
  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Logs", "devbuddy", "debug.log");
  }
  return path.join(
    process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"),
    "devbuddy",
    "debug.log",
  );
}

export function initLogger(enable: boolean): void {
  enabled = enable;
  if (!enabled) return;

  const logPath = getLogPath();
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  logStream = fs.createWriteStream(logPath, { flags: "a" });
  log("info", "Logger initialized");
}

export function log(level: "debug" | "info" | "warn" | "error", message: string, data?: unknown): void {
  if (!enabled || !logStream) return;

  const timestamp = new Date().toISOString();
  const line = data
    ? `[${timestamp}] [${level.toUpperCase()}] ${message} ${JSON.stringify(data)}\n`
    : `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;

  logStream.write(line);
}

export function closeLogger(): void {
  if (logStream) {
    logStream.end();
    logStream = null;
  }
}
