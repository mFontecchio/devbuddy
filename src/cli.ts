import { Command } from "commander";
import { spawn, type ChildProcess } from "child_process";
import { BuddyRegistry } from "./buddy/registry.js";
import { BuddyInstance } from "./buddy/instance.js";
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
        // Spawn detached daemon process
        const args = [
          process.argv[1],
          "daemon",
          "start",
          "--foreground",
        ];
        if (opts.debug) args.push("--debug");
        if (opts.buddy) args.push("--buddy", opts.buddy);

        const child = spawn(process.execPath, args, {
          detached: true,
          stdio: "ignore",
          env: { ...process.env },
        });
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

      // Start
      const args = [process.argv[1], "daemon", "start", "--foreground"];
      const child = spawn(process.execPath, args, {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      console.log(`Daemon restarted (PID: ${child.pid})`);
    });

  // --- ui command ---
  program
    .command("ui")
    .description("Launch the buddy display TUI")
    .action(async () => {
      // Auto-start daemon if not running
      if (!DaemonServer.isDaemonRunning()) {
        console.log("Starting daemon...");
        const args = [process.argv[1], "daemon", "start", "--foreground"];
        const child = spawn(process.execPath, args, {
          detached: true,
          stdio: "ignore",
        });
        child.unref();
        // Give daemon time to start
        await new Promise((r) => setTimeout(r, 1500));
      }

      const { launchUI } = await import("./ui/index.js");
      await launchUI();
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

      // 4. Start daemon
      console.log();
      if (DaemonServer.isDaemonRunning()) {
        console.log("  4. Daemon: already running\n");
      } else {
        const args = [process.argv[1], "daemon", "start", "--foreground"];
        const child = spawn(process.execPath, args, {
          detached: true,
          stdio: "ignore",
        });
        child.unref();
        console.log(`  4. Daemon started (PID: ${child.pid})\n`);
      }

      // 5. Instructions
      console.log("  5. Setup complete!");
      console.log();
      console.log("     Open a second terminal pane and run:");
      console.log("       devbuddy ui");
      console.log();
      console.log("     Restart your shell to activate the hook.");
      console.log("     Then use your terminal normally.\n");
    });

  // --- start (legacy / convenience) ---
  program
    .command("start")
    .description("Start daemon and launch the TUI")
    .option("-b, --buddy <name>", "Choose a specific buddy by name")
    .option("--debug", "Enable debug logging")
    .action(async (opts) => {
      // Start daemon if not running
      if (!DaemonServer.isDaemonRunning()) {
        const args = [process.argv[1], "daemon", "start", "--foreground"];
        if (opts.debug) args.push("--debug");
        if (opts.buddy) args.push("--buddy", opts.buddy);

        const child = spawn(process.execPath, args, {
          detached: true,
          stdio: "ignore",
        });
        child.unref();
        console.log(`Daemon started (PID: ${child.pid})`);
        await new Promise((r) => setTimeout(r, 1500));
      }

      const { launchUI } = await import("./ui/index.js");
      await launchUI();
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
