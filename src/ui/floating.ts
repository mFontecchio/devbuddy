import { spawn } from "child_process";
import os from "os";

export interface FloatingOptions {
  title?: string;
  cols?: number;
  rows?: number;
  mode?: "pane" | "overlay";
}

/**
 * Launches a new OS terminal window running `devbuddy ui --mode <mode>`.
 * The child is detached so closing either side does not affect the other.
 * Returns a short description of how the window was launched.
 */
export function launchFloating(options: FloatingOptions = {}): string {
  const title = options.title || "devBuddy";
  const cols = options.cols || 40;
  const rows = options.rows || 14;
  const mode = options.mode || "pane";

  const platform = process.platform;
  const innerCmd = `devbuddy ui --mode ${mode}`;

  if (platform === "win32") {
    return spawnWindows(innerCmd, title, cols, rows);
  }
  if (platform === "darwin") {
    return spawnMac(innerCmd, title, cols, rows);
  }
  return spawnLinux(innerCmd, title, cols, rows);
}

function spawnDetached(cmd: string, args: string[]): void {
  const child = spawn(cmd, args, {
    detached: true,
    stdio: "ignore",
    shell: false,
    env: { ...process.env },
  });
  child.unref();
}

function spawnWindows(innerCmd: string, title: string, cols: number, rows: number): string {
  // Prefer Windows Terminal if available
  const wtArgs = [
    "-w", "0", "nt",
    "--title", title,
    "--size", `${cols},${rows}`,
    "pwsh", "-NoLogo", "-NoExit", "-Command", innerCmd,
  ];
  try {
    spawnDetached("wt.exe", wtArgs);
    return `Windows Terminal (wt.exe) — ${title}`;
  } catch {
    // Fall through to legacy console
  }

  try {
    spawnDetached("powershell.exe", ["-NoLogo", "-NoExit", "-Command", innerCmd]);
    return "PowerShell window";
  } catch {
    spawnDetached("cmd.exe", ["/c", "start", title, "cmd.exe", "/k", innerCmd]);
    return "cmd.exe window";
  }
}

function spawnMac(innerCmd: string, title: string, _cols: number, _rows: number): string {
  const script = `tell application "Terminal"
  activate
  do script "${innerCmd.replace(/"/g, "\\\"")}"
  set custom title of front window to "${title}"
end tell`;
  spawnDetached("osascript", ["-e", script]);
  return `macOS Terminal.app — ${title}`;
}

function spawnLinux(innerCmd: string, title: string, cols: number, rows: number): string {
  const candidates: Array<{ cmd: string; args: string[] }> = [
    { cmd: "gnome-terminal", args: [`--title=${title}`, `--geometry=${cols}x${rows}`, "--", "sh", "-c", innerCmd] },
    { cmd: "konsole", args: ["--new-tab", "-p", `tabtitle=${title}`, "-e", "sh", "-c", innerCmd] },
    { cmd: "xterm", args: ["-title", title, "-geometry", `${cols}x${rows}`, "-e", "sh", "-c", innerCmd] },
  ];

  for (const c of candidates) {
    try {
      spawnDetached(c.cmd, c.args);
      return `${c.cmd} — ${title}`;
    } catch {
      // Try next
    }
  }
  throw new Error(
    `No supported terminal emulator found on ${os.platform()}. ` +
      `Install gnome-terminal, konsole, or xterm, or use --mode pane/overlay.`,
  );
}
