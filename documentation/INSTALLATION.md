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

## CLI Reference

```
devbuddy setup                 # Interactive first-time setup
devbuddy start                 # Start daemon + launch TUI
devbuddy ui                    # Launch TUI display client

devbuddy daemon start          # Start background daemon
devbuddy daemon stop           # Stop daemon
devbuddy daemon status         # Show daemon info
devbuddy daemon restart        # Restart daemon

devbuddy hook init <shell>     # Output hook script (for eval)
devbuddy hook install          # Auto-install hook to shell config
devbuddy hook uninstall        # Remove hook from shell config

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
