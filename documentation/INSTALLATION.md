# devBuddy Installation Guide

## Requirements

- Node.js 18 or later
- npm

## Quick Start

```bash
npm install -g devbuddy
devbuddy setup
```

The `setup` wizard will:

1. Detect your shell (bash, zsh, fish, PowerShell)
2. Install a lightweight shell hook into your shell config
3. Select a buddy
4. Start the background daemon
5. Open the buddy in its own floating OS terminal window so your working
   terminals stay untouched

You can keep using `npm run start`, `claude`, `gh copilot`, and any other CLI
you normally run in those working terminals — devBuddy only observes events
through the installed hooks. If the floating window cannot be opened (no
Windows Terminal / Terminal.app / gnome-terminal on the system), the wizard
falls back to overlay mode and prints:

```bash
devbuddy ui --mode overlay
```

## Manual Installation

### 1. Install the package

```bash
npm install -g devbuddy
```

### 2. Install the shell hook

```bash
devbuddy hook install
```

Or manually add one of these lines to your shell config:

**bash** (`~/.bashrc`):
```bash
eval "$(devbuddy hook init bash)" # devbuddy-managed
```

**zsh** (`~/.zshrc`):
```bash
eval "$(devbuddy hook init zsh)" # devbuddy-managed
```

**fish** (`~/.config/fish/config.fish`):
```fish
devbuddy hook init fish | source # devbuddy-managed
```

**PowerShell** (`$PROFILE`):
```powershell
Invoke-Expression (& devbuddy hook init powershell | Out-String) # devbuddy-managed
```

### 3. Start the daemon

```bash
devbuddy daemon start
```

### 4. Launch the TUI

In a separate terminal pane:

```bash
devbuddy ui
```

## Display Modes

devBuddy ships four ways to interact with your buddy. Pick the one that suits
your workflow:

```bash
devbuddy ui --mode floating             # Spawns a dedicated OS terminal window (default)
devbuddy ui --mode overlay --anchor bottom   # Reserved region in your current shell
devbuddy ui --mode overlay --anchor top
devbuddy ui --mode pane                 # Ink TUI in its own terminal pane
devbuddy chat                           # Chat-first REPL in the current terminal
```

Your last `ui` choice is saved in `config.yaml`, so subsequent `devbuddy ui`
invocations without flags will use the same mode. Out of the box the default
is `floating` so that the buddy never takes over a terminal you're actively
using for `npm`, Claude CLI, or other tools.

- **floating** (default) -- Opens a dedicated OS window so your working
  terminals stay untouched:
  - Windows: `wt.exe` (Windows Terminal) with PowerShell fallback
  - macOS: `Terminal.app` via `osascript`
  - Linux: `gnome-terminal`, `konsole`, or `xterm`
- **overlay** -- Runs in the same terminal as your shell. Uses an ANSI scroll
  region to reserve the top or bottom N rows for the buddy while the shell
  scrolls in the remaining area. Requires a VT100-capable terminal (any
  modern terminal emulator on macOS/Linux, and Windows Terminal/PowerShell 7+
  on Windows). Press `q`, `Esc`, or `Ctrl+C` to exit and restore the
  terminal.
- **pane** -- Open a second terminal pane and run `devbuddy ui --mode pane`.
  Best for tmux splits, VS Code integrated terminals, and Windows Terminal
  panes.
- **chat** -- Single-terminal, chat-first REPL modeled on Claude CLI and
  Copilot CLI. Takes over the current terminal with a tiny buddy header,
  scrollable conversation log, and an always-focused input line. While in
  chat mode the terminal is not a shell; `Esc` or `Ctrl+C` exits cleanly and
  returns your shell prompt. Hotkeys inside chat:
  - `Enter` -- send message
  - `Esc` / `Ctrl+C` -- quit
  - `Ctrl+L` -- clear conversation
  - `Ctrl+S` -- toggle the buddy sprite (more room for history)
  - `PgUp` / `PgDn` -- scroll the conversation log

## AI Agent Hooks

Wire devBuddy into your AI coding tools so it reacts when an agent submits a
prompt, uses a tool, edits a file, or finishes a turn.

```bash
devbuddy agent install --tool claude         # ~/.claude/settings.json
devbuddy agent install --tool cursor         # ./.cursor/hooks.json
devbuddy agent install --tool cursor --global  # ~/.cursor/hooks.json
devbuddy agent status                        # show install state per tool
devbuddy agent uninstall --tool claude
```

**Claude Code** -- Merges into `~/.claude/settings.json`. Installs hooks for
`UserPromptSubmit`, `PreToolUse`, `PostToolUse` (Edit/Write/MultiEdit), and
`Stop`. Uninstall only removes devBuddy's entries; any other hooks you
configured are preserved.

**Cursor** -- Merges into `.cursor/hooks.json` (project-local by default, or
`~/.cursor/hooks.json` with `--global`). Installs hooks for
`beforeSubmitPrompt`, `beforeShellExecution`, `afterFileEdit`, and `stop`.

**GitHub Copilot CLI** -- `gh copilot` does not expose native hooks. Instead
run Copilot through the devBuddy wrapper:

```bash
devbuddy copilot suggest "write a bash loop"
devbuddy copilot explain "ls -lah"
```

The wrapper sends `prompt_submit` on start and `complete`/`error` on exit,
tagged with `source: "copilot"`.

## CLI Reference

```
devbuddy setup                 # Interactive first-time setup
devbuddy start [--mode ...]    # Start daemon + launch display
devbuddy ui [--mode ...]       # Launch display (pane | overlay | floating)
devbuddy chat                  # Open the single-terminal chat REPL

devbuddy daemon start          # Start background daemon
devbuddy daemon stop           # Stop daemon
devbuddy daemon status         # Show daemon info
devbuddy daemon restart        # Restart daemon

devbuddy hook init <shell>     # Output hook script (for eval)
devbuddy hook install          # Auto-install hook to shell config
devbuddy hook uninstall        # Remove hook from shell config

devbuddy agent install --tool <claude|cursor|copilot> [--global]
devbuddy agent uninstall --tool <claude|cursor|copilot> [--global]
devbuddy agent status          # Show which agent hooks are installed
devbuddy agent-event --source ... --kind ...  # Used by hooks (one-shot)
devbuddy copilot <args>        # Run `gh copilot <args>` under devBuddy

devbuddy list                  # List available buddies
devbuddy choose <name>         # Select a buddy
devbuddy status                # Show buddy stats and progression
devbuddy doctor [--watch N]    # Verify shell hook + daemon + agent wiring
```

## Verify Your Setup

`devbuddy doctor` is the single place to confirm that everything is wired up.
It checks the shell hook, daemon, and agent hooks, and can tail live events so
you can run a command in another terminal and see it arrive.

```bash
devbuddy doctor
devbuddy doctor --watch 15     # stream events for 15 seconds
```

The command reports:

1. Whether the shell hook is installed for your current shell, and the config
   file it is injected into.
2. Whether the daemon is running, including uptime and connected clients.
3. Per-tool installation status for Claude, Cursor, and Copilot agent hooks.
4. The last ~20 events the daemon has observed (commands, matched output
   lines, and agent events).

While `--watch` is active, each new `cmd` or `agent_event` is printed as it
arrives. Run `npm run start`, `claude`, or `devbuddy copilot help` in another
terminal and you will see those lines appear, confirming the whole pipeline
is intact.

## Uninstall

```bash
devbuddy hook uninstall
devbuddy daemon stop
npm uninstall -g devbuddy
```

To also remove persisted data (XP, buddy progress):

```bash
rm -rf ~/.devbuddy
```

## Troubleshooting

### Daemon not starting

Check if another instance is already running:

```bash
devbuddy daemon status
```

If the daemon is stuck, clean up manually:

```bash
rm ~/.devbuddy/devbuddy.pid
rm ~/.devbuddy/devbuddy.sock
devbuddy daemon start
```

### TUI shows "Connecting..."

Ensure the daemon is running:

```bash
devbuddy daemon start
```

### Hook not firing

Restart your shell after installing the hook, or source the config file:

```bash
source ~/.bashrc    # bash
source ~/.zshrc     # zsh
```

### Windows: Named pipe issues

The daemon uses `\\.\pipe\devbuddy` on Windows. If you have firewall or antivirus
software blocking named pipes, you may need to add an exception.
