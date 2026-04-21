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
 *   2. Script ends in `.ts` (dev via tsx):
 *      a. If a built `dist/devbuddy.js` exists in the nearest package root,
 *         prefer that -> `node <dist>`.
 *      b. Otherwise fall back to `npx tsx <script>` (uses `npx.cmd` on
 *         Windows, which must run with `shell: true`).
 *   3. Anything else -> `node <script>` as a best effort.
 */
export function resolveSelfInvocation(opts: ResolveOptions = {}): SelfInvocation {
  const script = opts.script ?? process.argv[1] ?? "";
  const execPath = opts.execPath ?? process.execPath;
  const platform = opts.platform ?? process.platform;
  const exists = opts.exists ?? fs.existsSync;

  if (!script.endsWith(".ts")) {
    return { command: execPath, args: [script], needsShell: false };
  }

  const pkgRoot = findPackageRoot(script, exists);
  if (pkgRoot) {
    const distBin = path.join(pkgRoot, "dist", "devbuddy.js");
    if (exists(distBin)) {
      return { command: execPath, args: [distBin], needsShell: false };
    }
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

function findPackageRoot(startFile: string, exists: (p: string) => boolean): string | null {
  let dir = path.dirname(startFile);
  const root = path.parse(dir).root;
  while (dir && dir !== root) {
    if (exists(path.join(dir, "package.json"))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}
