# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `devbuddy doctor` command that verifies end-to-end wiring of the shell hook, daemon, and agent hooks. Reports the detected shell and its config path, daemon uptime/client count, per-tool agent hook install status (Claude/Cursor/Copilot), and the last 20 events the daemon has observed. Supports `--watch <seconds>` which subscribes to the daemon and streams each new `cmd` / `agent_event` as it arrives so users can run `npm run start`, `claude`, or `devbuddy copilot help` in another terminal and confirm the event reaches the buddy. Powered by a new fixed-size (20-entry) recent-events ring buffer on the orchestrator plus two new IPC messages: inbound `get_recent_events` and outbound `recent_events` (snapshot) / `recent_event` (live notification). Unit-tested in `test/unit/daemon/orchestrator-events.test.ts` and `test/unit/daemon/protocol.test.ts`.
- Single-terminal chat REPL (`devbuddy chat`) modeled on Claude CLI and Copilot CLI:
  - Hybrid two-layer renderer: the top 6 rows of the terminal are owned by a pure-ANSI sprite/status painter (`src/ui/chat-sprite-layer.ts`) that animates the buddy at full daemon tick rate with diff-based row writes, DEC mode 2026 synchronized output, and cursor save/restore so the batch commits atomically and never fights Ink for the cursor; below that, Ink renders only the conversation log and input box inside a scroll region (`CSI inkTop;termRows r`). The Ink app receives a proxied stdout whose `.rows` reports only the clamped Ink area so its layout never overflows into the sprite zone.
  - Chat-first Ink layout (`src/ui/chat-repl.tsx`) with scrollable conversation log (per-line soft-wrap via `wrapLine`, tail-of-history via `layoutMessages`) and always-focused input box
  - New CLI subcommand that auto-starts the daemon if needed (10 s soft timeout — warns and launches anyway so the REPL's built-in reconnect loop can catch up) and applies `--buddy <name>` by sending `choose_buddy` before rendering; Esc / Ctrl+C tears down the scroll region, clears the sprite rows, and writes a trailing newline so the shell prompt returns cleanly
  - Hotkeys inside chat: Enter to send, Esc/Ctrl+C to quit, Ctrl+L to clear history, Ctrl+S to toggle the sprite layer, PgUp/PgDn to scroll
  - Refuses to launch when stdin/stdout is not a TTY (piped or redirected), mirroring overlay mode's behavior
  - Pure helpers unit-tested: `wrapLine` and `layoutMessages` in `test/unit/ui/chat-repl.test.ts` (10 cases), and `computeSpriteRegion`, `buildSpriteLines`, `diffSpriteLines`, `renderSpriteInit`, `renderSpriteWrites`, `renderSpriteTeardown` in `test/unit/ui/chat-sprite-layer.test.ts` (18 cases)
- Pane mode (`src/ui/app.tsx`) now consumes `chat_response` IPC messages and renders a last-5-messages chat history panel below the sprite/XP stack; previously these responses were silently discarded
- Three display modes selectable via `devbuddy ui --mode <pane|overlay|floating>` (persisted in `config.yaml` at `displayMode`):
  - **Pane mode** — hardened Ink TUI that clamps sprite and speech widths against terminal columns and reserves fixed rows so layout never overlaps user typing on resize
  - **Overlay mode** — renders into a reserved top/bottom region of the current shell using a DEC scroll region (`CSI top;bottom r`) plus diffed per-row repainting and `SIGWINCH` handling; teardown restores the scroll region, clears the region rows, and shows the cursor
  - **Floating mode** — spawns a detached OS terminal window (Windows Terminal/PowerShell/cmd, macOS `Terminal.app`, or Linux `gnome-terminal`/`konsole`/`xterm`) running pane mode against the shared daemon
- `--anchor <top|bottom>` and `--height <rows>` flags for overlay mode
- AI agent awareness via native hooks:
  - New `agent_event` IPC message type with `source` (`claude`/`cursor`/`copilot`), `kind` (`prompt_submit`/`tool_use`/`file_edit`/`complete`/`error`/`stop`), plus optional `tool`, `file`, `summary`, `exit`
  - `devbuddy agent install/uninstall/status --tool <claude|cursor|copilot>` commands; Claude writer merges into `~/.claude/settings.json`, Cursor writer merges into `.cursor/hooks.json` (project) or `~/.cursor/hooks.json` (`--global`), all idempotent and preserving existing non-devBuddy entries
  - `devbuddy agent-event` one-shot command used by hook scripts; fails silently so missing daemon never breaks the host tool
  - `devbuddy copilot <args>` wrapper for GitHub Copilot CLI (which has no native hooks) — emits `prompt_submit` on start and `complete`/`error` on exit tagged as `source: "copilot"`
  - New `agent:*` pattern-match reactions wired to default `agentPrompt`/`agentTool`/`agentEdit`/`agentComplete`/`agentError` dialogue categories
- Optional `appearance.overlay.{preferredAnchor, padding}` hints in buddy YAML for overlay mode
- Sample `agentPrompt`/`agentTool`/`agentEdit`/`agentComplete`/`agentError` dialogue for sage, pixel, spark, and glitch buddies
- `documentation/BUDDIES.md` authoring guide (schema, layout rules, dialogue categories including agent ones, contributor checklist)
- Unit tests for overlay renderer ANSI output and region math, Claude/Cursor hook writers (idempotency + preservation), agent-event protocol round-trip, schema overlay/agent-category validation, and `agent:*` reaction mappings
- `devbuddy watch <command>` wraps any command, streams its stdout/stderr line-by-line to the daemon as `output` events, and sends the final exit code; enables the buddy to react to actual test results, build errors, and runtime output in real time
- Command-name pattern rules in `PatternMatcher` for common CLI commands: `npm test`, `git commit`, `npm run build`, `git push`, `docker`, and more
- Generic success reaction (`generic:success`) so the buddy responds to every command, not just pattern-matched ones
- Exit-code-aware command handling: recognized commands that fail trigger error reactions instead of the command-specific reaction
- All command paths (pattern-matched, fallback success, fallback error) now emit `event` messages for the TUI event log

### Changed
- Default display mode is now `floating` (was `pane`). On first run the `setup` wizard opens the buddy in its own dedicated OS terminal window (Windows Terminal / Terminal.app / gnome-terminal) so the user's working terminals are never taken over by the TUI. Commands like `npm run start`, `claude`, and `devbuddy copilot` continue to run normally in any shell that has the devBuddy hook installed; only the display surface moves to the floating window. `devbuddy ui` and `devbuddy start` fall back to `floating` when no mode is specified and no prior choice is persisted in `config.yaml`. Users who want the buddy inline with their shell can still run `devbuddy ui --mode overlay`, and the chat REPL (`devbuddy chat`) is unchanged. If no supported OS terminal emulator is available the wizard gracefully falls back to overlay mode and prints the exact command to run.
- Orchestrator tick interval reduced from 250 ms (~4 fps) to 100 ms (~10 fps) for smoother ASCII animation; autosave/idle/sleep/shutdown timers remain decoupled from the tick and the "broadcast only on frame or speech change" guard keeps IPC traffic low
- `appearance` in `BuddyDefinition` now accepts an optional `overlay` object (`preferredAnchor`, `padding`); existing buddies remain valid
- Buddy definition schema now accepts any dialogue categories (including `agentPrompt`/`agentTool`/`agentEdit`/`agentComplete`/`agentError`); only `greetings` remains required
- `SpeechBubble` breaks words longer than the inner width instead of overflowing; clamps `maxWidth` to safe bounds
- `BuddyPanel` truncates frame lines to `maxWidth` so wide art never wraps into an adjacent row
- Pane mode (`App`) now listens to `stdout.resize` and recomputes sprite/speech/chat layout bounds against current terminal columns and rows
- TUI layout changed from horizontal (buddy + side event panel) to vertical stacked layout for better appearance in narrow split terminals
- Recent Events panel is now toggled with `[e]` key instead of always visible, eliminating dead space
- Daemon only broadcasts state to TUI clients when animation frame, animation state, or speech actually changes (was: every tick at 4fps regardless of changes), reducing flicker and unnecessary redraws
- Event log includes icons and colors for all `cmd:*` events and `generic:success`/`generic:error`
- Speech bubble width adapts to terminal width for narrow panels
- BuddyPanel renders to a fixed height (6 lines) regardless of animation frame content, preventing layout jumps on frame changes
- SpeechBubble reserves a fixed vertical space (5 lines) whether text is shown or not, eliminating layout shifts when speech appears/disappears

### Fixed
- Auto-spawn of the daemon from `devbuddy start`, `devbuddy ui`, `devbuddy setup`, and `devbuddy daemon restart` was broken in dev (`npm run dev -- ...`) because `spawn(node, process.argv[1])` tried to run a `.ts` file directly. Added `src/core/self-spawn.ts` which detects the invocation style and uses `node dist/devbuddy.js` when a build is present or falls back to `npx tsx <script>` otherwise; production installs (`node dist/devbuddy.js`, global npm install, `npm link`) are unaffected
- Replaced the fixed 1500 ms post-spawn sleep with `waitForDaemon()` that polls `DaemonServer.isDaemonRunning()` for up to 5 s, so `ui`/`start` do not hand off to the display before the daemon is actually listening, and report a clear error on timeout
- CLI bin path in `package.json` pointed to non-existent `dist/bin/devbuddy.js`; corrected to `dist/devbuddy.js` to match tsup output
- Duplicate shebang in built CLI entry point caused `SyntaxError` on Node.js ESM; removed shebang from source `bin/devbuddy.ts` so only tsup banner injects it
- `BuddyRegistry.loadBuiltIn()` resolved `../../buddies` relative to `import.meta.url`, which pointed to the wrong directory after tsup flattens output into `dist/`; now tries `../buddies` first (bundled) with `../../buddies` fallback (source)
- Buddy never reacted to shell hook events because hooks send command names but pattern matcher only had output-line patterns; hooks now trigger reactions via command-name matching and exit-code fallbacks
- PowerShell hook only installed to PowerShell Core (7+) profile, not Windows PowerShell 5.x profile; hook installer now writes to both `Documents\PowerShell` and `Documents\WindowsPowerShell` profiles
- `devbuddy choose` did not update the TUI because the broadcast optimization skipped sending state when the new buddy had the same animation state/frame as the old one; `switchBuddy` now forces an immediate broadcast
- `devbuddy choose` CLI action was not async and relied on `isDaemonRunning()` PID file check; the process could exit before the daemon notification was sent; now connects directly to the pipe with proper `await`
- TUI stopped receiving updates after a transient socket disconnect because `DaemonClient` auto-reconnect did not re-send the `subscribe` message; daemon treated reconnected client as unsubscribed
- `cmd:test` pattern did not match `npm run test` (only matched `npm test`); broadened all command patterns to accept `npm run <script>` variants

## [0.2.0] - 2026-04-02

### Added
- Client-server daemon architecture (`src/daemon/`) replacing PTY-wrapping overlay
- IPC socket server supporting Unix domain sockets and Windows named pipes
- Daemon orchestrator with tick loop, pattern matching, state broadcast, and auto-shutdown after 3 hours of inactivity
- Daemon client library (`DaemonClient`) for connecting to the daemon from any process
- Ink-based TUI display client (`src/ui/`) with buddy animation panel, speech bubble, XP bar, event log, and chat input
- Shell hooks for bash, zsh, fish, and PowerShell (`src/hooks/`)
- Hook installer/uninstaller with auto-detection of user shell
- `devbuddy setup` interactive wizard for first-time onboarding
- `devbuddy daemon start|stop|status|restart` subcommands
- `devbuddy ui` command to launch the TUI display client
- `devbuddy hook init|install|uninstall` subcommands
- JSON-over-newline IPC protocol (`src/daemon/protocol.ts`)
- New tests for daemon protocol, IPC server, and hook initialization

### Changed
- `devbuddy start` now starts the daemon in background and launches the TUI (was: PTY-wrapping overlay)
- `devbuddy status` now includes daemon running status
- `devbuddy choose` now notifies a running daemon to switch buddies
- Build configuration updated for TSX (Ink components) and hook file copying

### Removed
- `node-pty` dependency (eliminates native C++ compilation requirement)
- PTY wrapper (`src/monitor/pty-wrapper.ts`)
- ANSI overlay renderer (`src/renderer/overlay.ts`, `ansi.ts`, `compositor.ts`, `terminal-detector.ts`)
- Old speech bubble renderer (`src/renderer/speech-bubble.ts`) replaced by Ink component
- Stdin input handler (`src/conversation/input-handler.ts`) replaced by TUI chat input
- Engine class (`src/core/engine.ts`) replaced by daemon Orchestrator

## [0.1.0] - 2026-03-01

### Added
- Initial release with PTY-wrapping ANSI overlay architecture
- Buddy system with YAML definitions, animations, and dialogue
- Pattern matching for terminal output (tests, builds, git, errors)
- XP/level progression with persistent storage
- Conversation system with keyword-based dialogue classification
- CLI with start, list, choose, and status commands
