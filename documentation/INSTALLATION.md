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

After setup, open a second terminal pane and run:

```bash
devbuddy ui
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

devBuddy ships three ways to view your buddy. Pick the one that suits your
workflow:

```bash
devbuddy ui --mode pane                 # Ink TUI in its own terminal pane (default)
devbuddy ui --mode overlay --anchor bottom   # Reserved region in your current shell
devbuddy ui --mode overlay --anchor top
devbuddy ui --mode floating             # Spawns a new OS terminal window
```

Your last choice is saved in `config.yaml`, so subsequent `devbuddy ui`
invocations without flags will use the same mode.

- **pane** -- Open a second terminal pane and run `devbuddy ui --mode pane`.
  Best for tmux splits, VS Code integrated terminals, and Windows Terminal
  panes.
- **overlay** -- Runs in the same terminal as your shell. Uses an ANSI scroll
  region to reserve the top or bottom N rows for the buddy while the shell
  scrolls in the remaining area. Requires a VT100-capable terminal (any
  modern terminal emulator on macOS/Linux, and Windows Terminal/PowerShell 7+
  on Windows). Press `q`, `Esc`, or `Ctrl+C` to exit and restore the
  terminal.
- **floating** -- Opens a dedicated OS window:
  - Windows: `wt.exe` (Windows Terminal) with PowerShell fallback
  - macOS: `Terminal.app` via `osascript`
  - Linux: `gnome-terminal`, `konsole`, or `xterm`

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
```

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
