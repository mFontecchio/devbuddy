# Authoring Buddies

A devBuddy is defined by a single YAML file in `buddies/` (or any directory
listed in `config.yaml` under `buddiesDir`). Every buddy is validated at
load time against a Zod schema in `src/buddy/schema.ts`, so malformed files
fail fast with a clear error instead of crashing the daemon.

This guide documents every field the engine reads and the contract the
engine expects.

## File location

```
buddies/
  _template.yaml        # copy this to start a new buddy
  sage.yaml
  pixel.yaml
  spark.yaml
  glitch.yaml
  my-buddy.yaml         # your buddy
```

Place your YAML in `buddies/` (bundled) or in any directory in
`config.yaml > buddiesDir`. The file's name does not have to match the
buddy ID, but matching is conventional.

## Required top-level fields

```yaml
id: my-buddy           # lowercase letters, digits, hyphens only
name: My Buddy
description: "Short, human-readable description"
version: 1

appearance:
  width: 16            # 1-40 chars
  height: 7            # 1-20 rows

stats:                 # each 1-10
  wisdom: 5
  energy: 5
  humor: 5
  debugSkill: 5
  patience: 5

personality:
  traits: [friendly]   # at least one
  speechStyle: "How your buddy talks."
  catchphrase: "Something catchy!"

animations:
  idle:                # REQUIRED
    frameDuration: 600
    loop: true
    frames:
      - |
        ASCII frame 1
      - |
        ASCII frame 2

dialogue:
  greetings:           # REQUIRED
    - "Hello!"
```

### Schema rules enforced at load time

- `id` must match `/^[a-z0-9-]+$/`.
- `appearance.width` is in `[1, 40]`; `appearance.height` is in `[1, 20]`.
- Every stat is an integer in `[1, 10]`.
- `animations.idle` must exist; `dialogue.greetings` must exist and be
  non-empty.
- Any animation must have at least one frame; `frameDuration >= 50`.

## Animations

An animation is a list of frames rendered in order at `frameDuration`
milliseconds per frame.

```yaml
animations:
  idle:
    frameDuration: 600   # ms per frame (min 50)
    loop: true
    frames:
      - |
        frame 1
      - |
        frame 2

  happy:
    frameDuration: 300
    loop: false
    returnTo: idle       # after one pass, fall back here
    frames:
      - |
        woohoo!
```

### Frame layout rules

- Every frame is a plain YAML block scalar (`|`). Trailing whitespace on
  each line is preserved.
- Keep each line's visible width inside `appearance.width`. Anything wider
  is truncated by the renderer in pane mode and truncated/padded in overlay
  mode, so long lines will be cut, not wrapped.
- Keep the frame count close to `appearance.height` rows. Fewer is fine
  (the panel pads with blank rows). More will be clipped.
- All frames in one animation should have the same visible height. Mixed
  heights cause layout jitter when the tick advances.

### Animation names the engine uses automatically

Pattern-match reactions (see `src/monitor/reactions.ts`) reference these
state names. Add any or all as you like:

| State       | Triggered by                                                 |
|-------------|--------------------------------------------------------------|
| `idle`      | default / between events (REQUIRED)                          |
| `happy`     | test pass, file edit, agent complete, command success        |
| `sad`       | test fail, error, agent error                                |
| `thinking`  | agent prompt, agent tool use                                 |
| `celebrating` | level up                                                   |
| `sleeping`  | 5 minutes of inactivity                                      |

Missing animations fall back to `idle`, so you can ship a minimal buddy
with only `idle` and add more over time.

### `loop` and `returnTo`

- `loop: true` -- plays forever.
- `loop: false` -- plays once, then returns to `returnTo` (defaults to
  `idle` when omitted).

## Dialogue

Dialogue is a dictionary of `category -> string[]`. The engine picks a
random entry from the relevant category whenever it triggers that
category.

### Categories the engine references

Shell / terminal:

| Category      | Triggered by                                     |
|---------------|--------------------------------------------------|
| `greetings`   | session start (REQUIRED)                         |
| `farewell`    | daemon stop / shutdown                           |
| `idle`        | 30s idle quip                                    |
| `encouragement` | generic command success                        |
| `testPass`    | test-suite pass patterns                         |
| `testFail`    | test-suite failure patterns                      |
| `error`       | generic error exit code / error output           |
| `levelUp`     | XP crossed a level threshold                     |
| `gitCommit`   | `git commit` success                             |

AI agents (Claude, Cursor, Copilot):

| Category        | Triggered by (`agent_event.kind`)         |
|-----------------|-------------------------------------------|
| `agentPrompt`   | `prompt_submit`                           |
| `agentTool`     | `tool_use`                                |
| `agentEdit`     | `file_edit`                               |
| `agentComplete` | `complete` or `stop`                      |
| `agentError`    | `error`                                   |

Any category outside this list is accepted by the schema and is available
for level unlocks and chat responses, but the engine will not trigger it
automatically.

## Optional: overlay hints

When a buddy is rendered in overlay mode (`devbuddy ui --mode overlay`),
you can hint at where it should dock:

```yaml
appearance:
  width: 16
  height: 7
  overlay:
    preferredAnchor: bottom   # top | bottom
    padding: 1                # extra blank rows inside the overlay region
```

These are hints only; user-supplied `--anchor` flags still win.

## Level unlocks

Reward progression by unlocking new dialogue, animations, or cosmetics at
specific levels:

```yaml
levelUnlocks:
  2:
    - type: dialogue
      category: idle
      entries:
        - "New dialogue at level 2!"
  5:
    - type: animation
      name: dancing
      definition:
        frameDuration: 300
        loop: false
        returnTo: idle
        frames:
          - |
            \o/
          - |
            _o_
  10:
    - type: cosmetic
      name: crown
      overlay:
        row: 0
        col: 5
        art: "♛"
```

Unlock types:

- `dialogue` -- Appends entries to a dialogue category. Can reference a
  new category; the engine will pick it up for chat classification.
- `animation` -- Adds a new animation state you can reference from
  pattern-match reactions or chat responses.
- `cosmetic` -- Records an equippable cosmetic (rendered by the display
  client at the given offset).

## Contributor checklist

Before opening a PR with a new buddy:

- [ ] `id` is lowercase, hyphenated, matches the file name.
- [ ] `appearance.width`/`height` matches every frame.
- [ ] `animations.idle` exists and loops cleanly.
- [ ] `dialogue.greetings` is present and sounds in-character.
- [ ] Added at least one entry each for `testPass`, `testFail`, `error`,
      `encouragement`, `levelUp`, `farewell`, `gitCommit` so the buddy
      feels alive in everyday use.
- [ ] Added at least one entry each for `agentPrompt`, `agentTool`,
      `agentEdit`, `agentComplete`, `agentError` if you want the buddy to
      respond to Claude / Cursor / Copilot events.
- [ ] No frame exceeds `appearance.width` columns.
- [ ] `npm test` passes (the schema test catches malformed definitions).

## Testing your buddy locally

```bash
devbuddy list                # should list your buddy
devbuddy choose my-buddy     # tells the daemon to switch
devbuddy ui --mode pane      # watch the idle animation
```

To preview agent-aware dialogue without a real AI tool, send events
manually with the one-shot command:

```bash
devbuddy agent-event --source claude --kind prompt_submit --summary "test prompt"
devbuddy agent-event --source cursor --kind file_edit --file src/index.ts
devbuddy agent-event --source copilot --kind complete --exit 0
```

Each call connects to the daemon, sends a single `agent_event`, and exits
silently. Watch your display to see the buddy react.
