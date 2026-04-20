import os from "os";

export type Platform = "windows" | "macos" | "linux";

export function getPlatform(): Platform {
  switch (process.platform) {
    case "win32":
      return "windows";
    case "darwin":
      return "macos";
    default:
      return "linux";
  }
}

export function getDefaultShell(): string {
  if (process.platform === "win32") {
    return process.env.COMSPEC || "cmd.exe";
  }
  return process.env.SHELL || "/bin/bash";
}

export function getTerminalSize(): { cols: number; rows: number } {
  return {
    cols: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  };
}

export function getConfigDir(): string {
  if (process.platform === "win32") {
    return `${process.env.APPDATA || os.homedir()}/devbuddy`;
  }
  if (process.platform === "darwin") {
    return `${os.homedir()}/Library/Preferences/devbuddy`;
  }
  const xdgConfig = process.env.XDG_CONFIG_HOME || `${os.homedir()}/.config`;
  return `${xdgConfig}/devbuddy`;
}
