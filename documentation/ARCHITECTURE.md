# devBuddy Architecture

## Overview

devBuddy uses a client-server architecture with three decoupled layers:

1. **Daemon** -- Background process that manages all buddy state
2. **Shell Hooks** -- Lightweight shell functions that send events to the daemon
3. **TUI Display** -- Ink-based terminal UI that renders the buddy in a dedicated pane

This design ensures devBuddy never interferes with the user's terminal or any CLI tool.

## System Diagram

```
User's Terminal              Daemon Process              Display Terminal
+---------------------+     +---------------------+     +---------------------+
| Shell / Claude CLI  |     |                     |     |                     |
| / Copilot / vim     |     |   Orchestrator      |     |   Ink TUI App       |
|                     |     |   - Tick loop (4fps) |     |   - BuddyPanel      |
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
| `output` | `line` | Log watcher (future) |
| `chat` | `text` | TUI chat input |
| `subscribe` | -- | TUI on connect |
| `choose_buddy` | `buddyId` | CLI / TUI |
| `ping` | -- | CLI status check |
| `stop` | -- | CLI daemon stop |

**Outbound (daemon -> display clients):**

| Type | Fields | Frequency |
|------|--------|-----------|
| `state` | buddy, animation, speech, progress | Every tick (250ms) |
| `chat_response` | `text` | On chat |
| `event` | `event`, `detail` | On pattern match |
| `pong` | `uptime`, `clients` | On ping |
| `error` | `message` | On error |
| `buddy_list` | `buddies[]` | On subscribe |

### Orchestrator (`orchestrator.ts`)

Replaces the old `Engine` class. Responsibilities:

- Tick loop at 250ms (4fps) advancing buddy animation
- Pattern matching incoming command/output events
- Triggering buddy reactions (animation + dialogue + XP)
- Broadcasting state to subscribed display clients
- Idle/sleep timers (30s idle quip, 5min sleep animation)
- Auto-shutdown after 3 hours of inactivity
- Autosave every 60 seconds

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

## TUI Display (`src/ui/`)

Ink (React for terminals) application with components:

- `App` -- Root component, manages daemon connection and state
- `BuddyPanel` -- Renders ASCII animation frames
- `SpeechBubble` -- Word-wrapped dialogue with Unicode box drawing
- `XpBar` -- Visual progress bar with level/XP display
- `StatusBar` -- Connection status and buddy info header
- `EventLog` -- Scrolling list of recent pattern match events
- `ChatInput` -- Text input for conversation (uses `ink-text-input`)

## Existing Subsystems (Unchanged)

- **Buddy System** (`src/buddy/`) -- YAML definitions, Zod validation, registry, instance, animator
- **Pattern Matcher** (`src/monitor/`) -- Regex rules with cooldowns
- **Progression** (`src/progression/`) -- XP, levels, persistence via `conf`
- **Conversation** (`src/conversation/`) -- Keyword classification, personality-weighted selection
- **Event Bus** (`src/core/events.ts`) -- Typed event emitter connecting subsystems
