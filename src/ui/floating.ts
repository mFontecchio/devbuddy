import { spawn } from "child_process";
import { execFileSync } from "child_process";
import os from "os";
import { resolveSelfInvocation } from "../core/self-spawn.js";

export interface FloatingOptions {
  title?: string;
  cols?: number;
  rows?: number;
  mode?: "pane" | "overlay";
  /**
   * When true, the spawned UI will subscribe to the daemon with
   * `primary: true`. The daemon treats the primary client's
   * disconnect as a user-requested shutdown and stops itself,
   * so closing the floating window cleans up the background
   * daemon process.
   */
  primary?: boolean;
}

/**
 * Resolve how to re-invoke devBuddy (dev/built/global) and return
 * the executable + args separately so each platform can format them
 * correctly for its own shell syntax.
 */
function resolveSelfArgs(subArgs: string[]): { command: string; args: string[] } {
  const { command, args } = resolveSelfInvocation();
  return { command, args: [...args, ...subArgs] };
}

/**
 * Build a PowerShell -EncodedCommand argument (base64 UTF-16LE) that
 * invokes `command` with `args` using the call-operator. Using the
 * encoded form sidesteps the brutal quoting required to pass an
 * executable with spaces in its path (e.g. `C:\Program Files\nodejs\node.exe`)
 * through `wt.exe` + `powershell -Command`. PowerShell single-quoted
 * strings treat contents literally; only `'` needs escaping as `''`.
 */
function buildPsEncodedCommand(command: string, args: string[]): string {
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const script = `& ${q(command)} ${args.map(q).join(" ")}`.trimEnd();
  return Buffer.from(script, "utf16le").toString("base64");
}

/**
 * Build a POSIX sh -c style command string (Linux/macOS).
 */
function buildShCommand(command: string, args: string[]): string {
  const quoteIfNeeded = (s: string) => (/[\s"']/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);
  return [command, ...args].map(quoteIfNeeded).join(" ");
}

/**
 * Detect whether a given executable is reachable on PATH.
 * Returns the first resolved path, or null if not found.
 */
function which(exe: string): string | null {
  try {
    const result = execFileSync(
      process.platform === "win32" ? "where.exe" : "which",
      [exe],
      { encoding: "utf8", timeout: 1000, stdio: ["ignore", "pipe", "ignore"] },
    );
    return result.trim().split(/\r?\n/)[0] || null;
  } catch {
    return null;
  }
}

/**
 * Launches a new OS terminal window running `devbuddy ui --mode <mode>`.
 * The child is detached so closing either side does not affect the other.
 * Returns a short description of how the window was launched.
 *
 * Works in dev mode (npm run dev / tsx), built dist, and global install.
 */
export function launchFloating(options: FloatingOptions = {}): string {
  const title = options.title || "devBuddy";
  const cols = options.cols || 40;
  const rows = options.rows || 14;
  const mode = options.mode || "pane";
  const primary = options.primary !== false; // default true

  const uiArgs = ["ui", "--mode", mode];
  if (primary) uiArgs.push("--primary");
  const { command, args } = resolveSelfArgs(uiArgs);

  const platform = process.platform;

  if (platform === "win32") {
    return spawnWindows(command, args, title, cols, rows);
  }
  if (platform === "darwin") {
    return spawnMac(buildShCommand(command, args), title);
  }
  return spawnLinux(buildShCommand(command, args), title, cols, rows);
}

function spawnDetached(cmd: string, args: string[], useShell = false): void {
  const child = spawn(cmd, args, {
    detached: true,
    stdio: "ignore",
    shell: useShell,
    env: { ...process.env },
  });
  child.unref();
}

function spawnWindows(
  command: string,
  args: string[],
  title: string,
  _cols: number,
  _rows: number,
): string {
  // Pick the best available PowerShell: prefer pwsh (7+), fall back to powershell.exe (5).
  const psExe = which("pwsh") ? "pwsh" : "powershell.exe";
  // Encode the command as base64 UTF-16LE so wt.exe/powershell don't have
  // to deal with escaping quotes, spaces, or special characters.
  const encoded = buildPsEncodedCommand(command, args);

  // Prefer Windows Terminal if available.
  //
  // Note: wt.exe's `nt` (new-tab) subcommand does NOT accept `--size`;
  // that flag only exists on the top-level `wt.exe` invocation in
  // recent Terminal builds. Passing `--size 40,14` after `nt` caused
  // wt to strip the unknown flag and treat `40,14` as the executable
  // to launch, producing `0x80070002 (file not found)`. The default
  // window size is taken from the user's Windows Terminal profile.
  const wtPath = which("wt") || which("wt.exe");
  if (wtPath) {
    const wtArgs = [
      "-w", "0", "nt",
      "--title", title,
      psExe, "-NoLogo", "-NoExit", "-EncodedCommand", encoded,
    ];
    try {
      spawnDetached(wtPath, wtArgs);
      return `Windows Terminal (wt.exe) — ${title}`;
    } catch {
      // Fall through to direct PowerShell window
    }
  }

  // Direct PowerShell window (no wt.exe).
  try {
    spawnDetached(psExe, ["-NoLogo", "-NoExit", "-EncodedCommand", encoded]);
    return `${psExe} window — ${title}`;
  } catch {
    // Last-resort: legacy cmd — wrap in a cmd /k call.
    // cmd.exe's quoting is simpler; `start "" "exe with spaces" args`.
    const quoted = [command, ...args]
      .map((t) => (/\s/.test(t) ? `"${t}"` : t))
      .join(" ");
    spawnDetached("cmd.exe", ["/c", "start", title, "cmd.exe", "/k", quoted]);
    return `cmd.exe window — ${title}`;
  }
}

function spawnMac(innerCmd: string, title: string): string {
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
