import readline from "readline";
import { DaemonClient } from "../daemon/client.js";
import type { BuddyStateUpdate, OutboundMessage } from "../daemon/protocol.js";
import {
  ANSI,
  buildRegionLines,
  computeRegion,
  diffLines,
  renderInit,
  renderTeardown,
  renderWrites,
  type OverlayAnchor,
  type OverlayRegion,
} from "./overlay-renderer.js";

export interface OverlayOptions {
  anchor?: OverlayAnchor;
  height?: number;
}

export async function launchOverlay(options: OverlayOptions = {}): Promise<void> {
  const anchorRaw = (options.anchor || "bottom") as OverlayAnchor;
  const anchor: OverlayAnchor = anchorRaw === "top" ? "top" : "bottom";

  const stdout = process.stdout;
  const stdin = process.stdin;

  if (!stdout.isTTY) {
    console.error("devbuddy overlay requires a TTY. Use `devbuddy ui --mode pane` instead.");
    process.exit(1);
  }

  const client = new DaemonClient();
  try {
    await client.connect(true);
  } catch {
    // reconnect loop will retry
  }

  let region: OverlayRegion | null = null;
  let lastLines: string[] | null = null;
  let lastState: BuddyStateUpdate | null = null;
  let torndown = false;

  const termSize = () => ({
    cols: stdout.columns || 80,
    rows: stdout.rows || 24,
  });

  const paintInit = () => {
    const { cols, rows } = termSize();
    const height = Math.max(3, Math.min(options.height ?? 8, Math.max(3, rows - 4)));
    const r = computeRegion({ termRows: rows, termCols: cols, anchor, height });
    region = r;
    lastLines = null;
    if (lastState) {
      const lines = buildRegionLines({
        state: lastState,
        width: r.width,
        height: r.bottom - r.top + 1,
      });
      stdout.write(renderInit(r, lines));
      lastLines = lines;
    } else {
      const placeholder = Array.from({ length: r.bottom - r.top + 1 }, (_, i) =>
        i === 0 ? "\u2500".repeat(r.width) : " ".repeat(r.width),
      );
      stdout.write(renderInit(r, placeholder));
      lastLines = placeholder;
    }
  };

  const repaint = () => {
    if (!region || !lastState || torndown) return;
    const lines = buildRegionLines({
      state: lastState,
      width: region.width,
      height: region.bottom - region.top + 1,
    });
    const writes = diffLines(lastLines, lines, region.top);
    if (writes.length > 0) {
      stdout.write(renderWrites(writes));
      lastLines = lines;
    }
  };

  const teardown = () => {
    if (torndown) return;
    torndown = true;
    if (region) {
      stdout.write(renderTeardown(region));
    } else {
      stdout.write(ANSI.RESET_SCROLL_REGION + ANSI.SHOW_CURSOR);
    }
    try { client.disconnect(); } catch { /* ignore */ }
  };

  client.on("message", (msg: OutboundMessage) => {
    if (msg.type === "state") {
      lastState = msg;
      if (!region) paintInit();
      repaint();
    }
  });

  client.on("connected", () => {
    client.subscribe();
  });

  // Trigger initial paint even if state hasn't arrived yet
  paintInit();
  if (client.connected) client.subscribe();

  // Resize handling
  const onResize = () => {
    if (torndown) return;
    // Clear old region and rebuild. This is cheap and avoids stale rows.
    if (region) stdout.write(renderTeardown(region));
    region = null;
    lastLines = null;
    paintInit();
    repaint();
  };
  stdout.on("resize", onResize);

  // Keyboard: Esc / Ctrl+C / q to quit without breaking terminal
  if (stdin.isTTY) {
    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("keypress", (_ch, key) => {
      if (!key) return;
      if (key.name === "escape" || key.name === "q" || (key.ctrl && key.name === "c")) {
        teardown();
        process.nextTick(() => process.exit(0));
      }
    });
  }

  const cleanupExit = () => {
    teardown();
    process.exit(0);
  };
  process.on("SIGINT", cleanupExit);
  process.on("SIGTERM", cleanupExit);
  process.on("exit", teardown);

  // Never resolve — overlay is a long-running foreground process.
  await new Promise<void>(() => { /* hold */ });
}
