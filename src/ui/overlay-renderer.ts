import type { BuddyStateUpdate } from "../daemon/protocol.js";

export type OverlayAnchor = "top" | "bottom";

export interface OverlayRegion {
  /** 1-based inclusive row where the region starts. */
  top: number;
  /** 1-based inclusive row where the region ends. */
  bottom: number;
  /** Region width in cols. */
  width: number;
  /** 1-based row where the scrollable area for the shell starts. */
  scrollTop: number;
  /** 1-based row where the scrollable area for the shell ends. */
  scrollBottom: number;
  anchor: OverlayAnchor;
}

export interface ComputeRegionInput {
  termRows: number;
  termCols: number;
  anchor: OverlayAnchor;
  height: number;
}

export function computeRegion({
  termRows,
  termCols,
  anchor,
  height,
}: ComputeRegionInput): OverlayRegion {
  const h = Math.max(3, Math.min(height, Math.max(3, termRows - 4)));

  if (anchor === "top") {
    return {
      top: 1,
      bottom: h,
      width: termCols,
      scrollTop: h + 1,
      scrollBottom: termRows,
      anchor,
    };
  }
  // bottom
  return {
    top: termRows - h + 1,
    bottom: termRows,
    width: termCols,
    scrollTop: 1,
    scrollBottom: termRows - h,
    anchor,
  };
}

export interface BuildLinesInput {
  state: BuddyStateUpdate;
  width: number;
  height: number;
  showSpeech?: boolean;
}

/**
 * Build the region's visible lines from current buddy state.
 * Output length is always exactly `height`, each line is exactly `width` wide
 * (padded with spaces) so writes fully erase any previous content.
 */
export function buildRegionLines({ state, width, height, showSpeech = true }: BuildLinesInput): string[] {
  const spriteLines = state.animation.frameLines.map((l) => (l ?? "").replace(/\s+$/u, ""));
  const speech = showSpeech && state.speech ? state.speech : null;

  const lines: string[] = [];

  // Top border
  lines.push("\u2500".repeat(width));

  // Status line (name + level + xp)
  const name = state.buddy.name;
  const lvl = `Lv.${state.progress.level}`;
  const xpPct = Math.floor(state.xpProgress * 100);
  const xp = `XP ${xpPct}%`;
  const statusRaw = `${name}  ${lvl}  ${xp}`;
  lines.push(padTruncate(statusRaw, width));

  // Speech line (single row for overlay compactness)
  if (speech) {
    lines.push(padTruncate(`\u2502 ${speech}`, width));
  } else {
    lines.push(padTruncate("", width));
  }

  // Sprite rows (centered)
  const spriteRows = Math.max(0, height - lines.length);
  for (let i = 0; i < spriteRows; i++) {
    const raw = spriteLines[i] ?? "";
    lines.push(padTruncate(center(raw, width), width));
  }

  // Final normalize to exact height
  while (lines.length < height) lines.push(" ".repeat(width));
  return lines.slice(0, height).map((l) => padTruncate(l, width));
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

export interface DiffWrite {
  row: number;
  col: number;
  text: string;
}

/**
 * Diff two equal-length/width line arrays and emit only the rows that changed.
 * `regionTop` is the absolute 1-based row where line 0 lives.
 */
export function diffLines(
  prev: string[] | null,
  next: string[],
  regionTop: number,
): DiffWrite[] {
  const writes: DiffWrite[] = [];
  for (let i = 0; i < next.length; i++) {
    const p = prev?.[i];
    const n = next[i];
    if (p !== n) {
      writes.push({ row: regionTop + i, col: 1, text: n });
    }
  }
  return writes;
}

// --- ANSI helpers ---

export const ANSI = {
  SAVE_CURSOR: "\u001b7",
  RESTORE_CURSOR: "\u001b8",
  RESET_SCROLL_REGION: "\u001b[r",
  HIDE_CURSOR: "\u001b[?25l",
  SHOW_CURSOR: "\u001b[?25h",
  CLEAR_LINE: "\u001b[2K",
  setScrollRegion(top: number, bottom: number): string {
    return `\u001b[${top};${bottom}r`;
  },
  moveTo(row: number, col: number): string {
    return `\u001b[${row};${col}H`;
  },
};

export function renderWrites(writes: DiffWrite[]): string {
  if (writes.length === 0) return "";
  let out = ANSI.SAVE_CURSOR;
  for (const w of writes) {
    out += ANSI.moveTo(w.row, w.col) + ANSI.CLEAR_LINE + w.text;
  }
  out += ANSI.RESTORE_CURSOR;
  return out;
}

export function renderInit(region: OverlayRegion, lines: string[]): string {
  let out = ANSI.SAVE_CURSOR;
  out += ANSI.setScrollRegion(region.scrollTop, region.scrollBottom);
  for (let i = 0; i < lines.length; i++) {
    out += ANSI.moveTo(region.top + i, 1) + ANSI.CLEAR_LINE + lines[i];
  }
  // Return cursor to the shell's scroll area so user input lands there.
  if (region.anchor === "bottom") {
    out += ANSI.moveTo(region.scrollBottom, 1);
  } else {
    out += ANSI.moveTo(region.scrollTop, 1);
  }
  return out;
}

export function renderTeardown(region: OverlayRegion): string {
  let out = "";
  // Clear the overlay rows so they don't linger
  for (let row = region.top; row <= region.bottom; row++) {
    out += ANSI.moveTo(row, 1) + ANSI.CLEAR_LINE;
  }
  out += ANSI.RESET_SCROLL_REGION;
  out += ANSI.SHOW_CURSOR;
  return out;
}
