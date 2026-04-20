# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `devbuddy watch <command>` wraps any command, streams its stdout/stderr line-by-line to the daemon as `output` events, and sends the final exit code; enables the buddy to react to actual test results, build errors, and runtime output in real time
- Command-name pattern rules in `PatternMatcher` for common CLI commands: `npm test`, `git commit`, `npm run build`, `git push`, `docker`, and more
- Generic success reaction (`generic:success`) so the buddy responds to every command, not just pattern-matched ones
- Exit-code-aware command handling: recognized commands that fail trigger error reactions instead of the command-specific reaction
- All command paths (pattern-matched, fallback success, fallback error) now emit `event` messages for the TUI event log

### Changed
- TUI layout changed from horizontal (buddy + side event panel) to vertical stacked layout for better appearance in narrow split terminals
- Recent Events panel is now toggled with `[e]` key instead of always visible, eliminating dead space
- Daemon only broadcasts state to TUI clients when animation frame, animation state, or speech actually changes (was: every tick at 4fps regardless of changes), reducing flicker and unnecessary redraws
- Event log includes icons and colors for all `cmd:*` events and `generic:success`/`generic:error`
- Speech bubble width adapts to terminal width for narrow panels
- BuddyPanel renders to a fixed height (6 lines) regardless of animation frame content, preventing layout jumps on frame changes
- SpeechBubble reserves a fixed vertical space (5 lines) whether text is shown or not, eliminating layout shifts when speech appears/disappears

### Fixed
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
