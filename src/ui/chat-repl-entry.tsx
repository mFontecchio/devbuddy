import React from "react";
import { render } from "ink";
import { ChatRepl } from "./chat-repl.js";
import { ChatSpriteLayer } from "./chat-sprite-layer.js";
import { DaemonClient } from "../daemon/client.js";
import type {
  BuddyStateUpdate,
  OutboundMessage,
} from "../daemon/protocol.js";
import { ANSI } from "./overlay-renderer.js";

/**
 * Launches the hybrid chat REPL:
 *
 *   - The top N rows of the terminal are owned by `ChatSpriteLayer`, a pure
 *     ANSI renderer that animates the buddy sprite at full daemon tick rate
 *     with diff-based writes and DEC 2026 synchronized output. No React
 *     involvement, so there is no flicker from reconciliation.
 *
 *   - A scroll region locks Ink's output to the rows below the sprite. Ink
 *     renders only the message log and input box inside that region. The
 *     stdout it receives is proxied so `.rows` reports the clamped Ink area;
 *     Ink's layout never overflows into the sprite zone.
 */

const SPRITE_HEIGHT = 6; // rows reserved for status + rule + sprite

/**
 * Wrap `process.stdout` so Ink sees only the rows available below the
 * sprite region. `columns`, `write`, `on`, `isTTY`, etc. forward to the real
 * stream; only `rows` is overridden.
 */
function makeClampedStdout(
  real: NodeJS.WriteStream,
  getRows: () => number,
): NodeJS.WriteStream {
  return new Proxy(real, {
    get(target, prop) {
      if (prop === "rows") return getRows();
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as NodeJS.WriteStream;
}

export async function launchChatRepl(): Promise<void> {
  const stdout = process.stdout;

  if (!stdout.isTTY) {
    console.error(
      "devbuddy chat requires a TTY. Pipe or redirect detected; aborting.",
    );
    process.exit(1);
  }

  const client = new DaemonClient();
  try {
    await client.connect(true);
  } catch {
    // Auto-reconnect will keep trying; sprite layer will show "reconnecting".
  }

  const sprite = new ChatSpriteLayer(stdout, SPRITE_HEIGHT);

  let torndown = false;
  let lastState: BuddyStateUpdate | null = null;
  let showSprite = true;

  const teardown = () => {
    if (torndown) return;
    torndown = true;
    sprite.teardown();
    try {
      client.disconnect();
    } catch {
      /* ignore */
    }
    // Leave the shell prompt on a clean fresh line.
    stdout.write("\n");
  };

  // --- Initial screen prep ---
  // Clear the screen so there's no leftover shell content behind the layout,
  // then init the sprite layer (which sets the scroll region + paints rows
  // and parks the cursor at the first Ink row).
  stdout.write("\u001b[2J" + ANSI.moveTo(1, 1));
  sprite.setConnected(client.connected);
  sprite.init();

  // --- Daemon subscription drives the sprite layer directly ---
  const onMessage = (msg: OutboundMessage) => {
    if (msg.type === "state") {
      lastState = msg;
      sprite.setState(msg);
    }
  };
  const onConnected = () => sprite.setConnected(true);
  const onDisconnected = () => sprite.setConnected(false);

  client.on("message", onMessage);
  client.on("connected", onConnected);
  client.on("disconnected", onDisconnected);
  if (client.connected) client.subscribe();

  // --- Resize handling for the sprite layer ---
  // Ink handles its own resize via its stdout's 'resize' event (forwarded
  // through the proxy). We separately re-init the sprite layer so the scroll
  // region and row math stay accurate.
  const onResize = () => {
    if (torndown) return;
    sprite.onResize();
    // Re-paint current state after the re-init so the new region isn't
    // blank until the next daemon tick.
    if (lastState) sprite.setState(lastState);
  };
  stdout.on("resize", onResize);

  // --- Render Ink into the clamped region ---
  const clampedStdout = makeClampedStdout(stdout, () => sprite.inkRows);

  // The active buddy name is resolved from the first `state` broadcast; until
  // then, "buddy" is a reasonable placeholder. Ink rerender on prop change
  // picks up the real name as soon as it arrives.
  const buildElement = (name: string) =>
    React.createElement(ChatRepl, {
      client,
      buddyName: name,
      onToggleSprite: () => {
        showSprite = !showSprite;
        sprite.setShowSprite(showSprite);
      },
    });

  const { waitUntilExit, rerender } = render(buildElement("buddy"), {
    stdout: clampedStdout,
    exitOnCtrlC: false,
  });

  // When we get the first real buddy name, rerender Ink so message prefixes
  // pick it up. This only happens once (or on buddy switch); no flicker.
  let currentName = "buddy";
  const onBuddyName = (msg: OutboundMessage) => {
    if (msg.type === "state" && msg.buddy.name !== currentName) {
      currentName = msg.buddy.name;
      rerender(buildElement(currentName));
    }
  };
  client.on("message", onBuddyName);

  const sigintHandler = () => {
    teardown();
    process.exit(0);
  };
  process.on("SIGINT", sigintHandler);
  process.on("SIGTERM", sigintHandler);

  try {
    await waitUntilExit();
  } finally {
    stdout.off("resize", onResize);
    client.off("message", onMessage);
    client.off("message", onBuddyName);
    client.off("connected", onConnected);
    client.off("disconnected", onDisconnected);
    process.off("SIGINT", sigintHandler);
    process.off("SIGTERM", sigintHandler);
    teardown();
  }
}
