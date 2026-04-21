import type { BuddyStateUpdate } from "../daemon/protocol.js";
import { ANSI } from "./overlay-renderer.js";

/**
 * The sprite layer owns the top N rows of the chat REPL and paints them with
 * pure ANSI — bypassing Ink's reconciler so the sprite can animate at full
 * daemon tick rate (~10 fps) with zero flicker. Ink renders the rest of the
 * chat (message log + input) below the scroll region.
 *
 * Rendering strategy:
 *   1. Build the desired full set of region lines as strings.
 *   2. Diff against the previously painted lines and emit only changed rows.
 *   3. Wrap the batch in DEC mode 2026 (synchronized output) when available
 *      so modern terminals repaint atomically.
 *   4. Save / restore the cursor around the batch so Ink's log-update never
 *      loses its position.
 */

export interface SpriteRegion {
  /** 1-based inclusive first row of the sprite region. Always 1. */
  top: number;
  /** 1-based inclusive last row of the sprite region. */
  bottom: number;
  /** Region width in cols (equal to term cols). */
  width: number;
  /** 1-based first row where Ink is allowed to render (= bottom + 1). */
  inkTop: number;
  /** 1-based last row of the terminal (for the scroll region bottom). */
  termRows: number;
}

export interface ComputeSpriteRegionInput {
  termRows: number;
  termCols: number;
  /** Requested total height of the sprite region. Clamped for small terms. */
  height: number;
}

export function computeSpriteRegion({
  termRows,
  termCols,
  height,
}: ComputeSpriteRegionInput): SpriteRegion {
  // Keep at least 6 rows for Ink (status + ~2 log rows + input box) and at
  // least 3 rows for the sprite region (status + separator + 1 sprite row).
  const minInkRows = 6;
  const minSpriteRows = 3;
  const maxSpriteRows = Math.max(minSpriteRows, termRows - minInkRows);
  const h = Math.max(minSpriteRows, Math.min(height, maxSpriteRows));

  return {
    top: 1,
    bottom: h,
    width: termCols,
    inkTop: h + 1,
    termRows,
  };
}

export interface BuildSpriteLinesInput {
  state: BuddyStateUpdate | null;
  connected: boolean;
  width: number;
  height: number;
  showSprite: boolean;
}

/**
 * Build the exact set of lines for the sprite region. Output length is
 * always exactly `height`; each line is exactly `width` chars wide
 * (space-padded) so writes fully erase previous content at that row.
 *
 *   Row 0:         status line  (bold, colored)
 *   Row 1:         horizontal rule
 *   Rows 2..h-1:   sprite art, vertically centered inside the remaining box
 */
export function buildSpriteLines({
  state,
  connected,
  width,
  height,
  showSprite,
}: BuildSpriteLinesInput): string[] {
  const lines: string[] = [];

  // Row 0: status line. Using raw text (no ANSI color) keeps the diff/width
  // math simple; colorization happens in `renderSpriteWrites`.
  const name = state?.buddy.name ?? "buddy";
  const level = state?.progress.level ?? 1;
  const xpPct = state ? Math.floor(state.xpProgress * 100) : 0;
  const connText = connected ? "connected" : "reconnecting";
  const status = `devBuddy chat  ${name}  Lv.${level}  XP ${xpPct}%  ${connText}`;
  lines.push(padTruncate(status, width));

  // Row 1: horizontal rule.
  lines.push("\u2500".repeat(width));

  const spriteRows = height - lines.length;
  if (spriteRows <= 0) return lines.slice(0, height);

  if (!showSprite || !state) {
    for (let i = 0; i < spriteRows; i++) lines.push(" ".repeat(width));
    return lines.slice(0, height);
  }

  // Center the sprite frame vertically and horizontally inside the remaining
  // rows. Clip to `spriteRows` from the top if the frame is taller.
  const frame = state.animation.frameLines.map((l) => (l ?? "").replace(/\s+$/u, ""));
  const padTop = Math.max(0, Math.floor((spriteRows - frame.length) / 2));
  for (let i = 0; i < spriteRows; i++) {
    const fIdx = i - padTop;
    const raw = fIdx >= 0 && fIdx < frame.length ? frame[fIdx] : "";
    lines.push(padTruncate(center(raw, width), width));
  }

  return lines.slice(0, height);
}

function padTruncate(s: string, width: number): string {
  if (s.length >= width) return s.slice(0, width);
  return s + " ".repeat(width - s.length);
}

function center(s: string, width: number): string {
  if (s.length >= width) return s.slice(0, width);
  const pad = Math.floor((width - s.length) / 2);
  return " ".repeat(pad) + s;
}

export interface SpriteDiffWrite {
  /** 1-based absolute terminal row. */
  row: number;
  /** Raw text for the row. Already padded to `width`. */
  text: string;
  /** Which logical row inside the region this is (0-based). */
  regionIndex: number;
}

export function diffSpriteLines(
  prev: string[] | null,
  next: string[],
  regionTop: number,
): SpriteDiffWrite[] {
  const writes: SpriteDiffWrite[] = [];
  for (let i = 0; i < next.length; i++) {
    if (prev?.[i] !== next[i]) {
      writes.push({ row: regionTop + i, text: next[i], regionIndex: i });
    }
  }
  return writes;
}

// --- Synchronized output (DEC mode 2026) ---
// Supported by Windows Terminal, iTerm2, Kitty, WezTerm, Alacritty, foot, etc.
// Harmless on older terminals (they ignore unknown private modes).
const SYNC_BEGIN = "\u001b[?2026h";
const SYNC_END = "\u001b[?2026l";

/**
 * Produce the ANSI byte-string for a batch of diff writes.
 *
 *   - Wraps the batch in DEC 2026 (sync output) so the terminal commits
 *     atomically; prevents tearing even during rapid re-paints.
 *   - Uses \u001b7 / \u001b8 (DECSC / DECRC) to save and restore the cursor
 *     so Ink's log-update position is not disturbed.
 *   - Applies status-line coloring (bold cyan) and rule coloring (dim gray)
 *     in-place at paint time.
 */
export function renderSpriteWrites(writes: SpriteDiffWrite[]): string {
  if (writes.length === 0) return "";
  let out = SYNC_BEGIN + ANSI.SAVE_CURSOR + ANSI.HIDE_CURSOR;
  for (const w of writes) {
    out += ANSI.moveTo(w.row, 1) + ANSI.CLEAR_LINE;
    if (w.regionIndex === 0) {
      // Status line: bold cyan
      out += "\u001b[1;36m" + w.text + "\u001b[0m";
    } else if (w.regionIndex === 1) {
      // Horizontal rule: dim
      out += "\u001b[2;37m" + w.text + "\u001b[0m";
    } else {
      out += w.text;
    }
  }
  out += ANSI.RESTORE_CURSOR + ANSI.SHOW_CURSOR + SYNC_END;
  return out;
}

/**
 * Initial paint. Sets the scroll region so Ink's writes below can never
 * scroll into the sprite area, then paints every row in the sprite region,
 * then parks the cursor at the top of the Ink region so Ink's first frame
 * lands there.
 */
export function renderSpriteInit(region: SpriteRegion, lines: string[]): string {
  let out = SYNC_BEGIN + ANSI.HIDE_CURSOR;
  // Set scroll region to the Ink half; Ink's cursor moves / line clears stay
  // inside these rows.
  out += ANSI.setScrollRegion(region.inkTop, region.termRows);
  for (let i = 0; i < lines.length; i++) {
    out += ANSI.moveTo(region.top + i, 1) + ANSI.CLEAR_LINE;
    if (i === 0) {
      out += "\u001b[1;36m" + lines[i] + "\u001b[0m";
    } else if (i === 1) {
      out += "\u001b[2;37m" + lines[i] + "\u001b[0m";
    } else {
      out += lines[i];
    }
  }
  // Park cursor at the first Ink row so render() writes land there.
  out += ANSI.moveTo(region.inkTop, 1);
  out += ANSI.SHOW_CURSOR + SYNC_END;
  return out;
}

export function renderSpriteTeardown(region: SpriteRegion): string {
  let out = "";
  for (let row = region.top; row <= region.bottom; row++) {
    out += ANSI.moveTo(row, 1) + ANSI.CLEAR_LINE;
  }
  out += ANSI.RESET_SCROLL_REGION;
  out += ANSI.SHOW_CURSOR;
  return out;
}

/**
 * Stateful painter that owns the top rows of the chat REPL terminal.
 * Created by `chat-repl-entry.tsx`, ticked on daemon `state` messages.
 */
export class ChatSpriteLayer {
  private region: SpriteRegion | null = null;
  private lastLines: string[] | null = null;
  private lastState: BuddyStateUpdate | null = null;
  private lastConnected = false;
  private lastShowSprite = true;
  private torndown = false;

  constructor(
    private stdout: NodeJS.WriteStream,
    private desiredHeight = 6,
  ) {}

  init(): void {
    if (this.torndown) return;
    const termRows = this.stdout.rows || 24;
    const termCols = this.stdout.columns || 80;
    this.region = computeSpriteRegion({
      termRows,
      termCols,
      height: this.desiredHeight,
    });
    const lines = buildSpriteLines({
      state: this.lastState,
      connected: this.lastConnected,
      width: this.region.width,
      height: this.region.bottom - this.region.top + 1,
      showSprite: this.lastShowSprite,
    });
    this.stdout.write(renderSpriteInit(this.region, lines));
    this.lastLines = lines;
  }

  /** Returns the 1-based first row where Ink should render. */
  get inkTop(): number {
    return this.region?.inkTop ?? 1;
  }

  /**
   * Returns the number of rows available to Ink below the sprite region.
   * Ink should be given a clamped stdout that reports this as its `rows`.
   */
  get inkRows(): number {
    if (!this.region) return (this.stdout.rows || 24) - this.desiredHeight;
    return this.region.termRows - this.region.inkTop + 1;
  }

  setState(state: BuddyStateUpdate | null): void {
    this.lastState = state;
    this.repaint();
  }

  setConnected(connected: boolean): void {
    if (this.lastConnected === connected) return;
    this.lastConnected = connected;
    this.repaint();
  }

  setShowSprite(show: boolean): void {
    if (this.lastShowSprite === show) return;
    this.lastShowSprite = show;
    this.repaint();
  }

  onResize(): void {
    if (this.torndown) return;
    // Tear down the existing region (clear rows, reset scroll region) and
    // re-init from the new terminal size.
    if (this.region) {
      this.stdout.write(renderSpriteTeardown(this.region));
    }
    this.region = null;
    this.lastLines = null;
    this.init();
  }

  teardown(): void {
    if (this.torndown) return;
    this.torndown = true;
    if (this.region) {
      this.stdout.write(renderSpriteTeardown(this.region));
    } else {
      this.stdout.write(ANSI.RESET_SCROLL_REGION + ANSI.SHOW_CURSOR);
    }
  }

  private repaint(): void {
    if (this.torndown || !this.region) return;
    const next = buildSpriteLines({
      state: this.lastState,
      connected: this.lastConnected,
      width: this.region.width,
      height: this.region.bottom - this.region.top + 1,
      showSprite: this.lastShowSprite,
    });
    const writes = diffSpriteLines(this.lastLines, next, this.region.top);
    if (writes.length > 0) {
      this.stdout.write(renderSpriteWrites(writes));
      this.lastLines = next;
    }
  }
}
