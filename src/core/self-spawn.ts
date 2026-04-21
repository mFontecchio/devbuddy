import fs from "fs";
import path from "path";
import { spawn, type ChildProcess, type SpawnOptions } from "child_process";

export interface SelfInvocation {
  command: string;
  args: string[];
  needsShell: boolean;
}

export interface ResolveOptions {
  /** Override `process.argv[1]` (mostly for tests). */
  script?: string;
  /** Override `process.execPath` (mostly for tests). */
  execPath?: string;
  /** Override `process.platform` (mostly for tests). */
  platform?: NodeJS.Platform;
  /** Override `fs.existsSync` (mostly for tests). */
  exists?: (p: string) => boolean;
}

/**
 * Figure out how to re-invoke the devBuddy CLI given the current runtime.
 * Pure (no spawn) so it can be unit-tested without touching real processes.
 *
 *   1. Script ends in `.js/.cjs/.mjs` (installed / built) -> `node <script>`.
 *   2. Script ends in `.ts` (dev via tsx) -> `npx tsx <script>` (uses
 *      `npx.cmd` on Windows, which must run with `shell: true`). This
 *      intentionally does NOT fall back to a pre-built `dist/devbuddy.js`
 *      even when one exists: in dev the user is iterating on source,
 *      and preferring a potentially stale `dist/` causes child processes
 *      (setup's floating window, auto-spawned daemon, `ui` popup) to
 *      run an older CLI than the parent. That caused "unknown option"
 *      errors and silently stale behavior whenever `dist/` was not
 *      rebuilt between code changes.
 *   3. Anything else -> `node <script>` as a best effort.
 */
export function resolveSelfInvocation(opts: ResolveOptions = {}): SelfInvocation {
  const script = opts.script ?? process.argv[1] ?? "";
  const execPath = opts.execPath ?? process.execPath;
  const platform = opts.platform ?? process.platform;
  // `exists` retained for signature compatibility with callers/tests;
  // no longer consulted now that we always defer to tsx in dev.
  void (opts.exists ?? fs.existsSync);

  if (!script.endsWith(".ts")) {
    return { command: execPath, args: [script], needsShell: false };
  }

  const npxCmd = platform === "win32" ? "npx.cmd" : "npx";
  return {
    command: npxCmd,
    args: ["tsx", script],
    needsShell: platform === "win32",
  };
}

/**
 * Spawn a new devbuddy subprocess that replays the current CLI entry point
 * with the supplied subcommand args. See {@link resolveSelfInvocation} for
 * the resolution rules.
 */
export function spawnSelf(subArgs: string[], opts: SpawnOptions = {}): ChildProcess {
  const { command, args, needsShell } = resolveSelfInvocation();
  return spawn(command, [...args, ...subArgs], {
    detached: true,
    stdio: "ignore",
    shell: needsShell,
    ...opts,
  });
}

