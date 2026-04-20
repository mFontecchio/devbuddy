# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is devBuddy?

An animated ASCII coding companion that lives in your terminal. It runs as a background daemon that receives events from shell hooks, tracks XP/level progression, and pushes state to a dedicated TUI display client. The buddy reacts to terminal output (test results, build errors, git commits, etc.), has a conversation system, and tracks unlockable content.

## Commands

```bash
npm run build        # Build with tsup (two entry points: src/index.ts lib + bin/devbuddy.ts CLI)
npm run dev          # Run CLI directly via tsx (no build needed)
npm test             # Run all tests (vitest)
npx vitest run test/unit/daemon/protocol.test.ts  # Run a single test file
npm run typecheck    # tsc --noEmit
```

## Architecture

**Client-Server model.** Three decoupled layers replace the old PTY-wrapping overlay:

1. **Daemon** (`src/daemon/`) — Background Node.js process that owns all buddy state. Listens on a Unix socket (`~/.devbuddy/devbuddy.sock`) or Windows named pipe (`\\.\pipe\devbuddy`).
2. **Shell Hooks** (`src/hooks/`) — Lightweight shell functions (bash, zsh, fish, PowerShell) that send command/exit-code events to the daemon. Zero dependencies.
3. **TUI Display** (`src/ui/`) — Ink (React for CLI) app that runs in its own terminal pane. Connects to daemon, renders buddy animation, speech, XP bar, event log, and chat input.

```
User's Terminal          Daemon Process           Display Terminal
┌──────────────┐        ┌──────────────┐        ┌──────────────┐
│ Shell / CLI  │───IPC──│ Orchestrator │───IPC──│  Ink TUI     │
│ + hook       │        │ PatternMatch │        │  BuddyPanel  │
│              │        │ XP / Dialogue│        │  Chat / XP   │
└──────────────┘        └──────────────┘        └──────────────┘
```

**Orchestrator (`src/daemon/orchestrator.ts`)** is the central brain. It owns the tick loop (4fps), buddy instance, pattern matcher, XP tracker, dialogue engine, and state broadcasting. The lifecycle: receive IPC events -> match patterns -> trigger buddy reactions -> broadcast state to display clients.

**IPC Protocol (`src/daemon/protocol.ts`)** — JSON-over-newline messages. Inbound: `cmd`, `output`, `chat`, `subscribe`, `choose_buddy`, `ping`, `stop`. Outbound: `state`, `chat_response`, `event`, `pong`, `error`, `buddy_list`.

**DaemonServer (`src/daemon/server.ts`)** — `net.Server` on Unix socket or named pipe. Manages client connections, message parsing, and broadcasting.

**DaemonClient (`src/daemon/client.ts`)** — `net.Socket` wrapper with auto-reconnect, event emitter interface, and typed message helpers.

**Buddy System:**
- Buddies are defined as YAML files in `buddies/` (see `_template.yaml` for the schema). Validated at load time by Zod schema in `src/buddy/schema.ts`.
- `BuddyRegistry` loads and indexes definitions. `BuddyInstance` wraps a definition with runtime state (progress, animator).
- `Animator` manages frame-based animation state machines. Animations can loop or play-once with `returnTo` transitions.
- Required: `idle` animation and `greetings` dialogue category. Stats are 1-10 integers.

**TUI (`src/ui/`):**
- Built with Ink (React for terminals). `App` component subscribes to daemon state, renders `BuddyPanel`, `SpeechBubble`, `XpBar`, `StatusBar`, `EventLog`, and `ChatInput`.
- Chat happens in the TUI, not by intercepting the user's shell stdin.

**Monitor (`src/monitor/`):**
- `PatternMatcher` runs terminal output lines (received via IPC) against regex rules (test pass/fail, build errors, git commits, etc.) with 3-second cooldowns per event type.
- `reactions.ts` maps pattern events to buddy animations, dialogue categories, and XP awards.

**Progression (`src/progression/`):**
- XP/level system with `100 * 1.5^(level-2)` leveling curve. Level unlocks can add dialogue, animations, or cosmetics.
- `persistence.ts` uses the `conf` package for cross-platform persistent storage (buddy progress, streaks, active buddy ID).

**Conversation (`src/conversation/`):**
- `DialogueEngine` classifies user input via keyword matching into dialogue categories, then selects from the buddy's dialogue pool using personality-weighted randomization.

**Shell Hooks (`src/hooks/`):**
- `bash.sh`, `zsh.sh`, `fish.fish`, `powershell.ps1` — Pure shell scripts, ~15 lines each.
- `init.ts` — Generates hook scripts, detects shell, manages install/uninstall of eval lines in shell configs.

**CLI (`src/cli.ts`):** Commander-based with subcommands: `setup`, `start`, `daemon start|stop|status|restart`, `ui`, `hook init|install|uninstall`, `list`, `choose <name>`, `status`.

## Key conventions

- Path alias: `@/*` maps to `./src/*` (configured in tsconfig and vitest)
- All internal imports use `.js` extensions (ESM)
- Buddy IDs must be lowercase alphanumeric with hyphens (`/^[a-z0-9-]+$/`)
- Tests live in `test/unit/` mirroring the `src/` structure
- TSX components in `src/ui/` use React JSX (`jsx: "react-jsx"` in tsconfig)
- Shell hook scripts are copied to `dist/hooks/` during build
- No native dependencies — pure JavaScript, no compilation required
