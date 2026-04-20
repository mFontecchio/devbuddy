# devBuddy

An animated ASCII coding companion that lives in your terminal.

devBuddy runs as a background daemon that watches your shell activity — test results, build errors, git commits, and more — and reacts with animations, dialogue, and XP progression. Think Clippy, but for your terminal, and actually fun.

```
User's Terminal          Daemon Process           Display Terminal
┌──────────────┐        ┌──────────────┐        ┌──────────────┐
│ Shell / CLI  │───IPC──│ Orchestrator │───IPC──│  Ink TUI     │
│ + hook       │        │ PatternMatch │        │  BuddyPanel  │
│              │        │ XP / Dialogue│        │  Chat / XP   │
└──────────────┘        └──────────────┘        └──────────────┘
```

## Features

- **Animated ASCII buddies** — Frame-based animation state machines with idle, happy, sad, thinking, celebrating, and sleeping states
- **Shell-aware reactions** — Detects test passes/failures, build errors, git commits, and more via lightweight shell hooks
- **XP & leveling** — Earn experience from coding activity; unlock new dialogue, animations, and cosmetics as you level up
- **Conversation system** — Chat with your buddy in the TUI; personality-weighted responses based on each buddy's traits
- **Multiple buddies** — Choose from built-in buddies (Pixel, Spark, Sage, Glitch) or create your own with YAML definitions
- **Cross-platform** — Works on macOS, Linux, and Windows with bash, zsh, fish, and PowerShell support
- **Zero native dependencies** — Pure JavaScript, no compilation required

## Quick Start

```bash
npm install devbuddy

# Interactive setup — installs shell hooks and picks your first buddy
devbuddy setup

# Start the daemon and open the TUI
devbuddy start
```

After setup, your buddy reacts to everything you do in the terminal automatically.

## Requirements

- Node.js >= 18

## CLI Commands

```bash
devbuddy setup                  # First-time interactive setup
devbuddy start                  # Start daemon + launch TUI
devbuddy ui                     # Launch the TUI display client

devbuddy daemon start           # Start the background daemon
devbuddy daemon stop            # Stop the daemon
devbuddy daemon status          # Check if the daemon is running
devbuddy daemon restart         # Restart the daemon

devbuddy hook init              # Generate hook scripts
devbuddy hook install           # Install hooks into your shell config
devbuddy hook uninstall         # Remove hooks from your shell config

devbuddy list                   # List available buddies
devbuddy choose <name>          # Switch to a different buddy
devbuddy status                 # Show buddy stats and daemon status
```

## Creating Custom Buddies

Buddies are defined as YAML files. Copy `buddies/_template.yaml` to get started:

```yaml
id: my-buddy
name: My Buddy
description: "A brief description of your buddy"
version: 1

appearance:
  width: 16
  height: 7

stats:
  wisdom: 5
  energy: 5
  humor: 5
  debugSkill: 5
  patience: 5

personality:
  traits:
    - friendly
  speechStyle: "Describe how your buddy talks."
  catchphrase: "Something catchy!"

animations:
  idle:          # Required
    frames: [...]
    fps: 2
  happy:
    frames: [...]
    fps: 4

dialogue:
  greetings:     # Required
    - "Hello there!"
```

Place your YAML file in the `buddies/` directory and it will be automatically discovered.

**Requirements:** Every buddy must have an `idle` animation and a `greetings` dialogue category. Stats are integers from 1-10. IDs must be lowercase alphanumeric with hyphens.

## How It Works

**Three decoupled layers:**

1. **Shell Hooks** — Tiny shell functions (~15 lines) injected into your shell config. They send command names and exit codes to the daemon over IPC. Zero overhead on your shell.

2. **Daemon** — A background Node.js process that owns all buddy state. It runs a pattern matcher against incoming events, triggers buddy reactions (animation changes, dialogue, XP awards), and broadcasts state updates to connected display clients. Auto-shuts down after 3 hours of inactivity.

3. **TUI Display** — An Ink (React for CLI) app that runs in its own terminal pane. Renders your buddy's animation, speech bubbles, XP bar, event log, and chat input.

Communication uses a JSON-over-newline IPC protocol on Unix domain sockets or Windows named pipes.

## Development

```bash
git clone <repo-url>
cd devBuddy
npm install

npm run dev          # Run CLI directly via tsx (no build needed)
npm run build        # Build with tsup
npm test             # Run all tests (vitest)
npm run typecheck    # Type-check with tsc
```

## License

MIT
