# devBuddy Architecture

## Overview

devBuddy uses a client-server architecture with three decoupled layers:

1. **Daemon** -- Background process that manages all buddy state
2. **Shell Hooks** -- Lightweight shell functions that send events to the daemon
3. **Display** -- Three interchangeable renderers (pane, overlay, floating window)

An optional fourth layer sends events from AI agent tools (Claude Code, Cursor,
GitHub Copilot CLI) into the daemon using each tool's native hook system.

This design ensures devBuddy never interferes with the user's terminal or any CLI tool.

## System Diagram

```
User's Terminal              Daemon Process              Display Terminal
+---------------------+     +---------------------+     +---------------------+
| Shell / Claude CLI  |     |                     |     |                     |
| / Copilot / vim     |     |   Orchestrator      |     |   Ink TUI App       |
|                     |     |   - Tick (~10 fps)  |     |   - BuddyPanel      |
| Shell Hook          |---->|   - PatternMatcher   |---->|   - SpeechBubble    |
| (precmd/preexec)    | IPC |   - XpTracker        | IPC |   - XpBar           |
|                     |     |   - DialogueEngine   |     |   - EventLog        |
|                     |     |   - Persistence      |     |   - ChatInput       |
+---------------------+     +---------------------+     +---------------------+
                              |                    |
                              |  Unix Socket       |
                              |  ~/.devbuddy/      |
                              |  devbuddy.sock     |
                              +--------------------+
```

## Daemon (`src/daemon/`)

### Server (`server.ts`)

- `net.Server` listening on Unix domain socket (`~/.devbuddy/devbuddy.sock`) or Windows named pipe (`\\.\pipe\devbuddy`)
- Manages client connections with newline-delimited JSON protocol
- Tracks subscribed display clients for state broadcasting
- Writes PID file for process management

### Protocol (`protocol.ts`)

JSON-over-newline messages in both directions:

**Inbound (hook/client -> daemon):**

| Type | Fields | Source |
|------|--------|--------|
| `cmd` | `cmd`, `exit`, `cwd` | Shell hook |
| `output` | `line` | `devbuddy watch` |
| `agent_event` | `source`, `kind`, `tool?`, `file?`, `summary?`, `exit?` | Claude/Cursor/Copilot hook |
| `chat` | `text` | TUI chat input |
| `subscribe` | -- | Display on connect |
| `choose_buddy` | `buddyId` | CLI / TUI |
| `ping` | -- | CLI status check |
| `get_recent_events` | -- | `devbuddy doctor` |
| `stop` | -- | CLI daemon stop |

**Outbound (daemon -> display clients):**

| Type | Fields | Frequency |
|------|--------|-----------|
| `state` | buddy, animation, speech, progress | On change (tick = 100 ms) |
| `chat_response` | `text` | On chat |
| `event` | `event`, `detail` | On pattern match |
| `pong` | `uptime`, `clients` | On ping |
| `error` | `message` | On error |
| `buddy_list` | `buddies[]` | On subscribe |
| `recent_events` | `events[]` (snapshot of ring buffer) | On `get_recent_events` |
| `recent_event` | `event` (single record) | Broadcast on every new `cmd` / `output` match / `agent_event` |

### Orchestrator (`orchestrator.ts`)

Replaces the old `Engine` class. Responsibilities:

- Tick loop at 100 ms (~10 fps) advancing buddy animation
- Pattern matching incoming command/output events
- Routing `agent_event` messages through `handlePatternMatch` using
  `agent:prompt | agent:tool | agent:edit | agent:complete | agent:error | agent:stop` keys
- Triggering buddy reactions (animation + dialogue + XP)
- Broadcasting state to subscribed display clients only when frame or speech changes
- Maintaining a fixed-size (20-entry) in-memory ring buffer of recent events
  (`cmd`, pattern-matched `output`, and `agent_event`) and broadcasting a
  `recent_event` notification on each push so `devbuddy doctor --watch` can
  tail live traffic. A snapshot of the buffer is returned on
  `get_recent_events`. Not persisted across daemon restarts.
- Idle/sleep timers (30s idle quip, 5min sleep animation)
- Auto-shutdown after 3 hours of inactivity
- Autosave every 60 seconds (independent of the tick)

### Client (`client.ts`)

Socket client with auto-reconnect for display clients and CLI tools.

## Shell Hooks (`src/hooks/`)

Minimal shell scripts (~15 lines each) that fire-and-forget IPC messages:

- **bash**: `PROMPT_COMMAND` + DEBUG trap for preexec
- **zsh**: `add-zsh-hook precmd/preexec`
- **fish**: `fish_postexec` event
- **PowerShell**: Prompt function override with named pipe client

Design principles:
- Zero latency impact (background send with `&`)
- Fail silently if daemon not running
- No Node.js dependency in the hook itself (pure shell)
- Append to existing hooks, never overwrite

## Display Modes (`src/ui/`)

Three interchangeable renderers consume the same `state` broadcast. Selected
via `devbuddy ui --mode <floating|overlay|pane>` (persisted in
`config.yaml` at `displayMode`). The shipped default is `floating` so the
buddy never takes over a terminal the user is actively working in; `pane`
and `overlay` remain fully supported opt-ins.

### Pane mode (`src/ui/app.tsx`)

Ink (React for terminals) application with components:

- `App` -- Root component, manages daemon connection and reactive resize
- `BuddyPanel` -- Renders ASCII animation frames, clamps each line to
  `min(termCols - 4, buddyWidth)` so nothing wraps into an adjacent row
- `SpeechBubble` -- Word-wrapped dialogue with fixed reserved height; breaks
  words longer than the inner width so overly wide speech never overflows
- `XpBar` -- Visual progress bar with level/XP display
- `StatusBar` -- Connection status and buddy info header
- `EventLog` -- Scrolling list of recent pattern match events
- `ChatInput` -- Text input for conversation (uses `ink-text-input`)

A `useTerminalSize` hook listens to `stdout.resize` and recomputes layout
bounds on the fly. Sprite height, speech height, and chat row are all
clamped against the terminal rows so a tiny terminal still lays out cleanly.

### Overlay mode (`src/ui/overlay.ts`, `src/ui/overlay-renderer.ts`)

Renders into a reserved region of the user's own terminal. Lifecycle:

1. **Init** -- Save cursor, set a DEC scroll region (`CSI top;bottom r`)
   covering the non-overlay rows so the shell only scrolls there. Paint the
   full region with absolute cursor positioning (`CSI row;col H`).
2. **Update** -- On each `state` message, diff the new lines against the last
   painted lines and write only the rows that changed, wrapped in cursor
   save/restore so user typing is never disturbed.
3. **Resize** (`stdout.on('resize')`) -- Tear down, recompute the region, set
   a new scroll region, repaint.
4. **Teardown** -- Reset the scroll region (`CSI r`), clear the reserved
   rows, restore cursor.

`overlay-renderer.ts` is a pure module: `computeRegion`, `buildRegionLines`,
`diffLines`, `renderInit`, `renderWrites`, `renderTeardown`. This makes the
ANSI output easy to unit-test without touching real TTYs.

Supported anchors: `top` and `bottom`. Left/right would require column-based
scroll regions which no ANSI standard provides.

### Floating mode (`src/ui/floating.ts`)

Spawns a new OS terminal window running `devbuddy ui --mode pane`. Child is
detached so closing either side does not kill the other.

- **Windows** -- `wt.exe` (Windows Terminal) with fallback to
  `powershell.exe` and then `cmd.exe /c start`.
- **macOS** -- `osascript -e 'tell application "Terminal" to do script ...'`.
- **Linux** -- Tries `gnome-terminal`, `konsole`, `xterm` in order.

## Agent Hooks (`src/hooks/agents/`)

Native hook integrations for AI coding assistants. Each writer is idempotent,
marker-commented, and preserves existing user entries on install/uninstall.

- **Claude Code** (`claude.ts`) -- Merges into `~/.claude/settings.json`:
  `UserPromptSubmit`, `PreToolUse`, `PostToolUse` (Edit/Write), and `Stop`
  hooks that run `devbuddy agent-event --source claude --kind ...`.
- **Cursor** (`cursor.ts`) -- Merges into `.cursor/hooks.json` (project) or
  `~/.cursor/hooks.json` (global) for `beforeSubmitPrompt`,
  `beforeShellExecution`, `afterFileEdit`, and `stop`.
- **GitHub Copilot** (`copilot.ts`) -- `gh copilot` exposes no native hooks;
  use the `devbuddy copilot <args>` wrapper command (a thin shim around
  `gh copilot` that emits start/complete `agent_event` messages).

The `devbuddy agent-event` one-shot subcommand connects to the daemon, sends
a single `agent_event`, then exits. It fails silently so a missing daemon
never breaks the host tool.

## Diagnostics (`devbuddy doctor`)

The `doctor` command is the single entry point for verifying that the whole
pipeline is wired up correctly. It touches every layer without mutating any
state:

1. **Shell hook** -- `detectShell()` + `isHookInstalled()` report whether the
   user's shell config contains the marker-commented `devbuddy hook init`
   line.
2. **Daemon** -- `DaemonServer.isDaemonRunning()` checks the PID file; if
   alive, a `ping` round-trip confirms the process is responsive and
   reports uptime and connected client count.
3. **Agent hooks** -- Iterates `AGENT_TOOLS` and calls each writer's
   `isInstalled()` + `configPath()` so the user can see per-tool state
   (Claude, Cursor, Copilot) in one place.
4. **Recent events** -- Requests `get_recent_events` to display the last
   ~20 `cmd` / `output` / `agent_event` records the daemon has observed.
5. **Live tap** -- With `--watch <seconds>`, subscribes to the daemon and
   prints each `recent_event` broadcast as it arrives, so running
   `npm run start`, `claude`, or `devbuddy copilot help` in another
   terminal produces visible output in the doctor session.

The ring buffer that backs `get_recent_events` and `recent_event` is
capped at 20 entries, in-memory only, and is populated from every `cmd`,
every pattern-matched `output` line, and every `agent_event` that the
orchestrator handles. It is never persisted to disk.

## Existing Subsystems (Unchanged)

- **Buddy System** (`src/buddy/`) -- YAML definitions, Zod validation, registry, instance, animator
- **Pattern Matcher** (`src/monitor/`) -- Regex rules with cooldowns
- **Progression** (`src/progression/`) -- XP, levels, persistence via `conf`
- **Conversation** (`src/conversation/`) -- Keyword classification, personality-weighted selection
- **Event Bus** (`src/core/events.ts`) -- Typed event emitter connecting subsystems
