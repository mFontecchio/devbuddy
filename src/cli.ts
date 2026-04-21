import { Command } from "commander";
import { spawn, type ChildProcess } from "child_process";
import { BuddyRegistry } from "./buddy/registry.js";
import { BuddyInstance } from "./buddy/instance.js";
import { spawnSelf } from "./core/self-spawn.js";
import {
  getBuddyProgress,
  getActiveBuddyId,
  setActiveBuddyId,
  getStorePath,
} from "./progression/persistence.js";
import { xpToNextLevel, levelProgress } from "./progression/level-system.js";
import { DaemonServer } from "./daemon/server.js";
import { DaemonClient } from "./daemon/client.js";
import { Orchestrator } from "./daemon/orchestrator.js";
import {
  detectShell,
  getHookScript,
  getShellConfigPath,
  installHook,
  uninstallHook,
  isHookInstalled,
  type ShellType,
} from "./hooks/init.js";
import { AGENT_TOOLS, getAgentWriter, type AgentTool } from "./hooks/agents/index.js";
import type {
  AgentEventKind,
  AgentSource,
  RecentEventRecord,
} from "./daemon/protocol.js";

/**
 * Format a RecentEventRecord for compact one-line display in the
 * `devbuddy doctor` report.
 */
function formatEvent(ev: RecentEventRecord): string {
  const time = new Date(ev.ts).toISOString().slice(11, 19);
  if (ev.kind === "cmd") {
    const exit = ev.exit === 0 ? "exit 0" : `exit ${ev.exit}`;
    return `${time}  cmd          ${exit.padEnd(7)} ${ev.summary}`;
  }
  if (ev.kind === "agent_event") {
    const label = `${ev.source || "?"}/${ev.subKind || "?"}`;
    return `${time}  agent_event  ${label.padEnd(20)} ${ev.summary}`;
  }
  return `${time}  output       ${ev.summary}`;
}

/**
 * Poll the daemon's PID file / socket until it becomes available.
 * Returns true once the daemon is running, false on timeout. Much more
 * reliable than a fixed-delay sleep, especially on slow Windows spawns.
 */
async function waitForDaemon(timeoutMs = 5000, pollMs = 150): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (DaemonServer.isDaemonRunning()) return true;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return DaemonServer.isDaemonRunning();
}

export function createCli(): Command {
  const program = new Command();

  program
    .name("devbuddy")
    .description("An animated ASCII coding companion for your terminal")
    .version("0.2.0");

  // --- daemon subcommand group ---
  const daemon = program.command("daemon").description("Manage the devBuddy background daemon");

  daemon
    .command("start")
    .description("Start the devBuddy daemon in the background")
    .option("--foreground", "Run in the foreground (do not detach)")
    .option("--debug", "Enable debug logging")
    .option("-b, --buddy <name>", "Select a buddy")
    .action(async (opts) => {
      if (DaemonServer.isDaemonRunning()) {
        console.log("Daemon is already running.");
        return;
      }

      if (opts.foreground) {
        const config: Record<string, unknown> = {};
        if (opts.debug) config.debugLog = true;
        if (opts.buddy) config.activeBuddyId = opts.buddy;
        const orchestrator = new Orchestrator(config);
        await orchestrator.start();
        console.log("Daemon running in foreground. Press Ctrl+C to stop.");
      } else {
        const args = ["daemon", "start", "--foreground"];
        if (opts.debug) args.push("--debug");
        if (opts.buddy) args.push("--buddy", opts.buddy);

        const child = spawnSelf(args, { env: { ...process.env } });
        child.unref();
        console.log(`Daemon started (PID: ${child.pid})`);
      }
    });

  daemon
    .command("stop")
    .description("Stop the running daemon")
    .action(async () => {
      if (!DaemonServer.isDaemonRunning()) {
        console.log("Daemon is not running.");
        return;
      }

      try {
        const client = new DaemonClient();
        await client.connect(false);
        client.requestStop();
        // Give it a moment to shut down
        await new Promise((r) => setTimeout(r, 500));
        client.disconnect();
        console.log("Daemon stopped.");
      } catch {
        console.log("Could not connect to daemon. It may have already stopped.");
        // Force cleanup
        DaemonServer.cleanupSocket();
      }
    });

  daemon
    .command("status")
    .description("Show daemon status")
    .action(async () => {
      if (!DaemonServer.isDaemonRunning()) {
        console.log("Daemon is not running.");
        return;
      }

      try {
        const client = new DaemonClient();
        await client.connect(false);
        client.ping();

        const result = await new Promise<void>((resolve) => {
          client.on("pong", (msg: any) => {
            const uptime = Math.floor(msg.uptime / 1000);
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = uptime % 60;
            console.log("\n  Daemon Status: running");
            console.log(`  Uptime: ${hours}h ${minutes}m ${seconds}s`);
            console.log(`  Connected clients: ${msg.clients}`);
            console.log(`  Socket: ${DaemonServer.getSocketPath()}\n`);
            resolve();
          });

          setTimeout(() => {
            console.log("Daemon is running but did not respond to ping.");
            resolve();
          }, 3000);
        });

        client.disconnect();
      } catch {
        console.log("Daemon appears to be running but is not responding.");
      }
    });

  daemon
    .command("restart")
    .description("Restart the daemon")
    .action(async () => {
      // Stop first
      if (DaemonServer.isDaemonRunning()) {
        try {
          const client = new DaemonClient();
          await client.connect(false);
          client.requestStop();
          await new Promise((r) => setTimeout(r, 1000));
          client.disconnect();
        } catch { /* ignore */ }
      }

      const child = spawnSelf(["daemon", "start", "--foreground"]);
      child.unref();
      console.log(`Daemon restarted (PID: ${child.pid})`);
    });

  // --- ui command ---
  program
    .command("ui")
    .description("Launch the buddy display (pane | overlay | floating)")
    .option("-m, --mode <mode>", "Display mode: pane | overlay | floating")
    .option("-a, --anchor <anchor>", "Overlay anchor: top | bottom")
    .option("--height <rows>", "Overlay height in rows")
    .option(
      "--primary",
      "Mark this UI as the primary buddy window. When it closes, the background daemon also shuts down so no orphan process is left behind. Set automatically by the floating window launcher.",
    )
    .action(async (opts) => {
      const { loadConfig, saveConfigPatch } = await import("./core/config.js");
      const cfg = loadConfig();
      const rawMode = (opts.mode || cfg.displayMode || "floating").toLowerCase();
      const validModes = ["pane", "overlay", "floating"] as const;
      type ModeT = (typeof validModes)[number];
      const mode: ModeT = (validModes as readonly string[]).includes(rawMode)
        ? (rawMode as ModeT)
        : "pane";
      const rawAnchor = (opts.anchor || cfg.overlayAnchor || "bottom").toLowerCase();
      const anchor: "top" | "bottom" = rawAnchor === "top" ? "top" : "bottom";
      const overlayHeight = opts.height ? parseInt(opts.height, 10) : cfg.overlayHeight;

      // Persist user's selection for next time
      const patch: Record<string, unknown> = { displayMode: mode };
      if (mode === "overlay") {
        patch.overlayAnchor = anchor;
        if (overlayHeight) patch.overlayHeight = overlayHeight;
      }
      saveConfigPatch(patch);

      if (!DaemonServer.isDaemonRunning()) {
        console.log("Starting daemon...");
        const child = spawnSelf(["daemon", "start", "--foreground"]);
        child.unref();
        await waitForDaemon(5000);
      }

      if (mode === "overlay") {
        const { launchOverlay } = await import("./ui/overlay.js");
        await launchOverlay({ anchor, height: overlayHeight });
        return;
      }

      if (mode === "floating") {
        const { launchFloating } = await import("./ui/floating.js");
        const desc = launchFloating({ mode: "pane" });
        console.log(`Opened floating window via ${desc}.`);
        return;
      }

      const { launchUI } = await import("./ui/index.js");
      await launchUI({ primary: !!opts.primary });
    });

  // --- hook subcommand group ---
  const hook = program.command("hook").description("Manage shell hooks");

  hook
    .command("init <shell>")
    .description("Output shell hook script for eval (bash, zsh, fish, powershell)")
    .action((shell: string) => {
      const validShells: ShellType[] = ["bash", "zsh", "fish", "powershell"];
      if (!validShells.includes(shell as ShellType)) {
        console.error(`Unknown shell: ${shell}. Valid options: ${validShells.join(", ")}`);
        process.exit(1);
      }
      const script = getHookScript(shell as ShellType);
      process.stdout.write(script);
    });

  hook
    .command("install")
    .description("Install the shell hook into your shell config")
    .option("-s, --shell <type>", "Shell type (auto-detected if omitted)")
    .action((opts) => {
      const shell: ShellType = opts.shell || detectShell();
      console.log(`\n  Detected shell: ${shell}`);

      if (isHookInstalled(shell)) {
        console.log(`  Hook is already installed in ${getShellConfigPath(shell)}`);
        return;
      }

      const configPath = installHook(shell);
      console.log(`  Hook installed in ${configPath}`);
      console.log("  Restart your shell or source the config file to activate.\n");
    });

  hook
    .command("uninstall")
    .description("Remove the shell hook from your shell config")
    .option("-s, --shell <type>", "Shell type (auto-detected if omitted)")
    .action((opts) => {
      const shell: ShellType = opts.shell || detectShell();
      console.log(`\n  Detected shell: ${shell}`);

      if (!isHookInstalled(shell)) {
        console.log("  No hook found to remove.");
        return;
      }

      const configPath = uninstallHook(shell);
      console.log(`  Hook removed from ${configPath}\n`);
    });

  // --- agent subcommand group ---
  const agent = program
    .command("agent")
    .description("Manage AI agent hooks (Claude, Cursor, Copilot)");

  agent
    .command("install")
    .description("Install agent hooks for the given tool")
    .requiredOption("-t, --tool <tool>", "Tool: claude | cursor | copilot")
    .option("--global", "Cursor: install globally instead of in the current project")
    .action((opts) => {
      const tool = opts.tool as AgentTool;
      if (!AGENT_TOOLS.includes(tool)) {
        console.error(`Unknown tool: ${tool}. Valid: ${AGENT_TOOLS.join(", ")}`);
        process.exit(1);
      }
      const writer = getAgentWriter(tool, { global: !!opts.global });
      if (writer.isInstalled()) {
        console.log(`  ${tool} hooks already installed at ${writer.configPath()}`);
        return;
      }
      const result = writer.install();
      console.log(`  ${tool} hooks installed: ${result}`);
    });

  agent
    .command("uninstall")
    .description("Remove agent hooks for the given tool")
    .requiredOption("-t, --tool <tool>", "Tool: claude | cursor | copilot")
    .option("--global", "Cursor: uninstall from global config")
    .action((opts) => {
      const tool = opts.tool as AgentTool;
      if (!AGENT_TOOLS.includes(tool)) {
        console.error(`Unknown tool: ${tool}. Valid: ${AGENT_TOOLS.join(", ")}`);
        process.exit(1);
      }
      const writer = getAgentWriter(tool, { global: !!opts.global });
      const result = writer.uninstall();
      console.log(`  ${tool} hooks uninstalled: ${result}`);
    });

  agent
    .command("status")
    .description("Show which agent hooks are currently installed")
    .action(() => {
      console.log("\n  Agent hook status:\n");
      for (const tool of AGENT_TOOLS) {
        const writer = getAgentWriter(tool);
        const installed = writer.isInstalled();
        console.log(`  ${tool.padEnd(10)} ${installed ? "installed" : "not installed"}  (${writer.configPath()})`);
      }
      console.log();
    });

  // --- agent-event (one-shot event sender, called by hooks) ---
  program
    .command("agent-event")
    .description("Send an AI agent event to the daemon (used by hooks)")
    .requiredOption("-s, --source <source>", "Agent source: claude | cursor | copilot")
    .requiredOption("-k, --kind <kind>", "Event kind: prompt_submit | tool_use | file_edit | complete | error | stop")
    .option("--tool <tool>", "Tool name (e.g., Edit, Bash)")
    .option("--file <file>", "File path related to the event")
    .option("--summary <summary>", "Short summary of the event")
    .option("--exit <code>", "Exit code (numeric)")
    .option("--timeout <ms>", "Connection timeout in ms", "500")
    .action(async (opts) => {
      const source = opts.source as AgentSource;
      const kind = opts.kind as AgentEventKind;
      const validSources: AgentSource[] = ["claude", "cursor", "copilot"];
      const validKinds: AgentEventKind[] = [
        "prompt_submit", "tool_use", "file_edit", "complete", "error", "stop",
      ];
      if (!validSources.includes(source)) {
        // Silent failure so hooks never break the host tool
        process.exit(0);
      }
      if (!validKinds.includes(kind)) {
        process.exit(0);
      }
      if (!DaemonServer.isDaemonRunning()) {
        process.exit(0);
      }
      const client = new DaemonClient();
      try {
        const connectPromise = client.connect(false);
        const timeoutMs = parseInt(opts.timeout, 10) || 500;
        await Promise.race([
          connectPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
        ]);
        client.sendAgentEvent({
          source,
          kind,
          tool: opts.tool,
          file: opts.file,
          summary: opts.summary,
          exit: opts.exit !== undefined ? parseInt(opts.exit, 10) : undefined,
        });
        await new Promise((r) => setTimeout(r, 100));
      } catch {
        // Fail silently so hooks don't disturb agent tools
      } finally {
        try { client.disconnect(); } catch { /* ignore */ }
        process.exit(0);
      }
    });

  // --- copilot wrapper command ---
  program
    .command("copilot")
    .description("Run GitHub Copilot CLI under devBuddy (tags events as source=copilot)")
    .allowUnknownOption(true)
    .argument("[args...]", "Arguments to pass to `gh copilot`")
    .action(async (args: string[] = []) => {
      const cmdArgs = ["gh", "copilot", ...args];
      let client: DaemonClient | null = null;

      if (DaemonServer.isDaemonRunning()) {
        try {
          client = new DaemonClient();
          await client.connect(false);
          client.sendAgentEvent({ source: "copilot", kind: "prompt_submit", summary: args.join(" ") });
        } catch {
          client = null;
        }
      }

      const child: ChildProcess = spawn(cmdArgs[0], cmdArgs.slice(1), {
        stdio: "inherit",
        shell: true,
        env: { ...process.env },
      });

      const exitCode = await new Promise<number>((resolve) => {
        child.on("close", (code) => resolve(code ?? 1));
      });

      if (client?.connected) {
        client.sendAgentEvent({
          source: "copilot",
          kind: exitCode === 0 ? "complete" : "error",
          exit: exitCode,
        });
        await new Promise((r) => setTimeout(r, 200));
        client.disconnect();
      }

      process.exit(exitCode);
    });

  // --- setup wizard ---
  program
    .command("setup")
    .description("Interactive first-time setup wizard")
    .action(async () => {
      console.log("\n  devBuddy Setup");
      console.log("  " + "\u2500".repeat(14) + "\n");

      // 1. Detect shell
      const shell = detectShell();
      const configPath = getShellConfigPath(shell);
      console.log(`  1. Detected shell: ${shell} (${configPath})\n`);

      // 2. Install hook
      if (isHookInstalled(shell)) {
        console.log("  2. Shell hook: already installed\n");
      } else {
        const result = installHook(shell);
        console.log(`  2. Shell hook: installed in ${result}\n`);
      }

      // 3. Show buddies and let user choose
      const registry = new BuddyRegistry();
      registry.loadBuiltIn();
      const buddies = registry.getAll();
      const currentActive = getActiveBuddyId();

      console.log("  3. Available buddies:");
      buddies.forEach((b, i) => {
        const active = b.id === currentActive ? " (active)" : "";
        console.log(`     ${i + 1}. ${b.name}${active} - ${b.description}`);
      });

      if (!currentActive && buddies.length > 0) {
        setActiveBuddyId(buddies[0].id);
        console.log(`\n     Selected: ${buddies[0].name}`);
      } else {
        const activeDef = buddies.find((b) => b.id === currentActive);
        console.log(`\n     Current: ${activeDef?.name || currentActive}`);
      }

      console.log();
      if (DaemonServer.isDaemonRunning()) {
        console.log("  4. Daemon: already running\n");
      } else {
        const child = spawnSelf(["daemon", "start", "--foreground"]);
        child.unref();
        // Give cold Node starts (tsx transform, module resolution, etc.)
        // enough headroom before declaring failure. 10s mirrors the
        // `devbuddy chat` auto-spawn budget.
        const ok = await waitForDaemon(10000);
        if (ok) {
          console.log(`  4. Daemon started (PID: ${child.pid})\n`);
        } else {
          console.log(
            "  4. Daemon failed to start within 10s; try `devbuddy daemon start --foreground` to see errors.\n",
          );
        }
      }

      // 5. Launch the buddy in a floating window (new default)
      let launchedFloating = false;
      try {
        const { launchFloating } = await import("./ui/floating.js");
        const desc = launchFloating({ mode: "pane" });
        console.log(`  5. Buddy window opened via ${desc}\n`);
        launchedFloating = true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`  5. Could not open a floating window: ${message}`);
        console.log("     Falling back to in-shell overlay mode.\n");
      }

      // 6. Instructions
      console.log("  6. Setup complete!");
      console.log();
      if (launchedFloating) {
        console.log("     The buddy is now running in its own window.");
        console.log("     Your working terminals stay untouched — just use them normally.");
      } else {
        console.log("     Run the buddy inside your current terminal:");
        console.log("       devbuddy ui --mode overlay");
      }
      console.log();
      console.log("     Prefer the buddy inside the shell you're working in?");
      console.log("       devbuddy ui --mode overlay");
      console.log();
      console.log("     Restart your shell to activate the command hook.\n");
    });

  // --- start (legacy / convenience) ---
  program
    .command("start")
    .description("Start daemon and launch the display")
    .option("-b, --buddy <name>", "Choose a specific buddy by name")
    .option("-m, --mode <mode>", "Display mode: pane | overlay | floating")
    .option("-a, --anchor <anchor>", "Overlay anchor: top | bottom")
    .option("--debug", "Enable debug logging")
    .action(async (opts) => {
      if (!DaemonServer.isDaemonRunning()) {
        const args = ["daemon", "start", "--foreground"];
        if (opts.debug) args.push("--debug");
        if (opts.buddy) args.push("--buddy", opts.buddy);

        const child = spawnSelf(args);
        child.unref();
        const ok = await waitForDaemon(5000);
        if (ok) {
          console.log(`Daemon started (PID: ${child.pid})`);
        } else {
          console.error("Daemon failed to start within 5s. Try `devbuddy daemon start --foreground` to see errors.");
          process.exit(1);
        }
      }

      const { loadConfig } = await import("./core/config.js");
      const cfg = loadConfig();
      const mode = (opts.mode || cfg.displayMode || "floating").toLowerCase();
      if (mode === "overlay") {
        const { launchOverlay } = await import("./ui/overlay.js");
        const anchor = opts.anchor === "top" ? "top" : "bottom";
        await launchOverlay({ anchor });
        return;
      }
      if (mode === "floating") {
        const { launchFloating } = await import("./ui/floating.js");
        const desc = launchFloating({ mode: "pane" });
        console.log(`Opened floating window via ${desc}.`);
        return;
      }

      const { launchUI } = await import("./ui/index.js");
      await launchUI();
    });

  // --- chat (single-terminal chat-first REPL, Claude CLI-style) ---
  program
    .command("chat")
    .description("Open a single-terminal chat REPL with your buddy")
    .option("-b, --buddy <name>", "Choose a specific buddy by name")
    .option("--debug", "Enable debug logging on the daemon")
    .action(async (opts) => {
      if (!DaemonServer.isDaemonRunning()) {
        console.log("Starting daemon...");
        const args = ["daemon", "start", "--foreground"];
        if (opts.debug) args.push("--debug");
        if (opts.buddy) args.push("--buddy", opts.buddy);

        const child = spawnSelf(args);
        child.unref();
        const ok = await waitForDaemon(10000);
        if (!ok) {
          console.warn(
            "Daemon did not come up within 10s; launching chat anyway. " +
              "The REPL will reconnect automatically once the daemon is ready.",
          );
          console.warn(
            "If it never connects, run `devbuddy daemon start --foreground` " +
              "in another terminal to see startup errors.",
          );
        }
      }

      if (opts.buddy && DaemonServer.isDaemonRunning()) {
        try {
          const client = new DaemonClient();
          await client.connect(false);
          client.chooseBuddy(opts.buddy);
          await new Promise((r) => setTimeout(r, 100));
          client.disconnect();
        } catch {
          // Non-fatal; the REPL will still launch with the active buddy.
        }
      }

      const { launchChatRepl } = await import("./ui/chat-repl-entry.js");
      await launchChatRepl();
    });

  // --- watch (run a command and stream output to daemon) ---
  program
    .command("watch")
    .description("Run a command and stream its output to the buddy daemon")
    .argument("<command...>", "Command and arguments to run")
    .action(async (args: string[]) => {
      const cmdStr = args.join(" ");
      let client: DaemonClient | null = null;

      try {
        client = new DaemonClient();
        await client.connect(false);
      } catch {
        // Daemon not available — run command without forwarding
        client = null;
      }

      // Send command-start event
      if (client) {
        client.send({ type: "cmd", cmd: cmdStr, exit: -1, cwd: process.cwd().replace(/\\/g, "/") });
      }

      const child: ChildProcess = spawn(args[0], args.slice(1), {
        stdio: ["inherit", "pipe", "pipe"],
        shell: true,
        cwd: process.cwd(),
        env: { ...process.env, FORCE_COLOR: "1" },
      });

      const forwardLine = (line: string) => {
        if (client?.connected && line.trim().length > 0) {
          client.send({ type: "output", line });
        }
      };

      let stdoutBuf = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        process.stdout.write(text);
        stdoutBuf += text;
        let idx: number;
        while ((idx = stdoutBuf.indexOf("\n")) !== -1) {
          forwardLine(stdoutBuf.slice(0, idx));
          stdoutBuf = stdoutBuf.slice(idx + 1);
        }
      });

      let stderrBuf = "";
      child.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        process.stderr.write(text);
        stderrBuf += text;
        let idx: number;
        while ((idx = stderrBuf.indexOf("\n")) !== -1) {
          forwardLine(stderrBuf.slice(0, idx));
          stderrBuf = stderrBuf.slice(idx + 1);
        }
      });

      const exitCode = await new Promise<number>((resolve) => {
        child.on("close", (code) => resolve(code ?? 1));
      });

      // Flush remaining buffered output
      if (stdoutBuf.trim()) forwardLine(stdoutBuf);
      if (stderrBuf.trim()) forwardLine(stderrBuf);

      // Send command-complete event with real exit code
      if (client?.connected) {
        client.send({ type: "cmd", cmd: cmdStr, exit: exitCode, cwd: process.cwd().replace(/\\/g, "/") });
        await new Promise((r) => setTimeout(r, 300));
        client.disconnect();
      }

      process.exit(exitCode);
    });

  // --- list ---
  program
    .command("list")
    .description("List all available buddies")
    .action(() => {
      const registry = new BuddyRegistry();
      registry.loadBuiltIn();

      const buddies = registry.getAll();
      const activeId = getActiveBuddyId();

      console.log("\n  Available Buddies:\n");
      for (const def of buddies) {
        const active = def.id === activeId ? " (active)" : "";
        const progress = getBuddyProgress(def.id);

        console.log(`  ${def.name}${active}`);
        console.log(`    ${def.description}`);
        console.log(`    Stats: WIS:${def.stats.wisdom} ENR:${def.stats.energy} HUM:${def.stats.humor} DBG:${def.stats.debugSkill} PAT:${def.stats.patience}`);
        console.log(`    Level: ${progress.level} | XP: ${progress.xp}`);

        const idleFrames = def.animations.idle?.frames;
        if (idleFrames && idleFrames[0]) {
          const previewLines = idleFrames[0].split("\n").filter((l) => l.length > 0).slice(0, 4);
          for (const line of previewLines) {
            console.log(`      ${line}`);
          }
        }
        console.log();
      }
    });

  // --- choose ---
  program
    .command("choose <name>")
    .description("Choose a buddy by name or id")
    .action(async (name: string) => {
      const registry = new BuddyRegistry();
      registry.loadBuiltIn();

      const buddy = registry.getByName(name);
      if (!buddy) {
        console.error(`Buddy "${name}" not found. Run 'devbuddy list' to see available buddies.`);
        process.exit(1);
      }

      setActiveBuddyId(buddy.id);
      console.log(`\n  Selected ${buddy.name}!`);
      console.log(`  "${buddy.personality.catchphrase}"\n`);

      // Notify running daemon directly via pipe (skip PID file check)
      try {
        const client = new DaemonClient();
        await client.connect(false);
        client.chooseBuddy(buddy.id);
        await new Promise((r) => setTimeout(r, 500));
        client.disconnect();
      } catch {
        // Daemon not running — preference saved, will apply on next start
      }
    });

  // --- doctor (diagnostic + live event tap) ---
  program
    .command("doctor")
    .description("Verify shell hook, daemon, and agent hook wiring end-to-end")
    .option(
      "-w, --watch <seconds>",
      "After the report, stream live events for N seconds so you can verify in another terminal",
    )
    .action(async (opts) => {
      const shell = detectShell();
      const shellConfigPath = getShellConfigPath(shell);
      const hookInstalled = isHookInstalled(shell);

      console.log("\n  devBuddy Doctor");
      console.log("  " + "\u2500".repeat(15) + "\n");

      // --- 1. Shell hook ---
      const hookMark = hookInstalled ? "OK" : "MISSING";
      console.log(`  [${hookMark}] Shell hook  (${shell})`);
      console.log(`          config: ${shellConfigPath}`);
      if (!hookInstalled) {
        console.log("          fix: devbuddy hook install");
      }
      console.log();

      // --- 2. Daemon ---
      const daemonRunning = DaemonServer.isDaemonRunning();
      const daemonMark = daemonRunning ? "OK" : "STOPPED";
      console.log(`  [${daemonMark}] Daemon`);
      console.log(`          socket: ${DaemonServer.getSocketPath()}`);

      let daemonClient: DaemonClient | null = null;
      if (daemonRunning) {
        try {
          daemonClient = new DaemonClient();
          await daemonClient.connect(false);
          const pongPromise = new Promise<{ uptime: number; clients: number } | null>(
            (resolve) => {
              const timer = setTimeout(() => resolve(null), 2000);
              daemonClient!.once("pong", (msg: any) => {
                clearTimeout(timer);
                resolve({ uptime: msg.uptime, clients: msg.clients });
              });
            },
          );
          daemonClient.ping();
          const pong = await pongPromise;
          if (pong) {
            const seconds = Math.floor(pong.uptime / 1000);
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = seconds % 60;
            console.log(`          uptime: ${h}h ${m}m ${s}s`);
            console.log(`          connected clients: ${pong.clients}`);
          } else {
            console.log("          warning: daemon did not respond to ping within 2s");
          }
        } catch (err) {
          console.log(
            `          warning: could not reach daemon (${err instanceof Error ? err.message : String(err)})`,
          );
          try { daemonClient?.disconnect(); } catch { /* ignore */ }
          daemonClient = null;
        }
      } else {
        console.log("          fix: devbuddy daemon start");
      }
      console.log();

      // --- 3. Agent hooks ---
      console.log("  Agent hooks");
      for (const tool of AGENT_TOOLS) {
        const writer = getAgentWriter(tool);
        const installed = writer.isInstalled();
        const mark = installed ? "OK" : "NONE";
        console.log(`  [${mark}] ${tool.padEnd(8)} ${writer.configPath()}`);
      }
      console.log();

      // --- 4. Recent events (snapshot) ---
      if (daemonClient?.connected) {
        const eventsPromise = new Promise<RecentEventRecord[]>((resolve) => {
          const timer = setTimeout(() => resolve([]), 2000);
          daemonClient!.once("recent_events", (msg: any) => {
            clearTimeout(timer);
            resolve(msg.events || []);
          });
        });
        daemonClient.requestRecentEvents();
        const events = await eventsPromise;
        console.log("  Recent events");
        if (events.length === 0) {
          console.log("          (none yet — run a command or use an AI tool in another shell)");
        } else {
          for (const ev of events) {
            console.log(`          ${formatEvent(ev)}`);
          }
        }
        console.log();
      }

      // --- 5. Try-it hints ---
      console.log("  Try it from another terminal:");
      console.log("    npm run start          (shell hook -> cmd event)");
      console.log("    claude                 (Claude Code hooks -> agent_event)");
      console.log("    devbuddy copilot help  (Copilot wrapper -> agent_event)");
      console.log();

      // --- 6. Optional watch ---
      const watchSeconds = opts.watch ? parseInt(opts.watch, 10) : 0;
      if (watchSeconds > 0 && daemonClient?.connected) {
        console.log(`  Watching for events for ${watchSeconds}s... (Ctrl+C to stop)\n`);
        const onRecentEvent = (msg: any) => {
          if (msg?.type === "recent_event" && msg.event) {
            console.log(`  -> ${formatEvent(msg.event as RecentEventRecord)}`);
          }
        };
        daemonClient.on("message", onRecentEvent);
        // Subscribe so the daemon streams `recent_event` broadcasts to us
        daemonClient.subscribe();
        await new Promise((r) => setTimeout(r, watchSeconds * 1000));
        daemonClient.off("message", onRecentEvent);
        console.log("\n  Watch window ended.\n");
      }

      try { daemonClient?.disconnect(); } catch { /* ignore */ }
    });

  // --- status ---
  program
    .command("status")
    .description("Show your current buddy's stats and progression")
    .action(() => {
      const registry = new BuddyRegistry();
      registry.loadBuiltIn();

      const activeId = getActiveBuddyId();
      if (!activeId) {
        console.log("No buddy selected yet. Run 'devbuddy setup' to get started!");
        return;
      }

      const def = registry.get(activeId);
      if (!def) {
        console.log(`Buddy "${activeId}" not found in registry.`);
        return;
      }

      const progress = getBuddyProgress(activeId);
      const remaining = xpToNextLevel(progress.xp);
      const pct = Math.floor(levelProgress(progress.xp) * 100);

      console.log(`\n  ${def.name} \u2014 "${def.personality.catchphrase}"`);
      console.log(`  ${def.description}\n`);
      console.log(`  Level: ${progress.level}`);
      console.log(`  XP: ${progress.xp} (${pct}% to next level, ${remaining} XP needed)`);
      console.log(`  Sessions: ${progress.totalSessions}`);
      console.log(`  Commands: ${progress.totalCommands}`);
      console.log(`\n  Stats:`);
      console.log(`    Wisdom:     ${"\u2588".repeat(def.stats.wisdom)}${"\u2591".repeat(10 - def.stats.wisdom)} ${def.stats.wisdom}/10`);
      console.log(`    Energy:     ${"\u2588".repeat(def.stats.energy)}${"\u2591".repeat(10 - def.stats.energy)} ${def.stats.energy}/10`);
      console.log(`    Humor:      ${"\u2588".repeat(def.stats.humor)}${"\u2591".repeat(10 - def.stats.humor)} ${def.stats.humor}/10`);
      console.log(`    Debug Skill:${"\u2588".repeat(def.stats.debugSkill)}${"\u2591".repeat(10 - def.stats.debugSkill)} ${def.stats.debugSkill}/10`);
      console.log(`    Patience:   ${"\u2588".repeat(def.stats.patience)}${"\u2591".repeat(10 - def.stats.patience)} ${def.stats.patience}/10`);
      console.log(`\n  Traits: ${def.personality.traits.join(", ")}`);
      console.log(`  Daemon: ${DaemonServer.isDaemonRunning() ? "running" : "not running"}`);
      console.log(`  Store: ${getStorePath()}\n`);
    });

  return program;
}
