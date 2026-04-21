import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { DaemonClient } from "../daemon/client.js";
import type {
  ChatResponseMessage,
  OutboundMessage,
} from "../daemon/protocol.js";
import { ChatInput } from "./components/chat-input.js";

/**
 * Chat-first REPL. Ink is responsible only for the message log and input
 * box — the buddy sprite and status line are painted by `ChatSpriteLayer`
 * at the top of the terminal via pure ANSI, bypassing the React tree so
 * animation ticks do not force Ink re-renders.
 *
 * Layout (after the sprite layer reserves its rows at the top):
 *
 *   [rows 1..spriteBottom      owned by ChatSpriteLayer]
 *   [inkTop..termRows-3        conversation log        ]
 *   [termRows-2..termRows      ChatInput (bordered)    ]
 */

export interface ChatMessage {
  role: "user" | "buddy" | "system";
  text: string;
  ts: number;
}

const MIN_TERM_COLS = 20;
const MIN_TERM_ROWS = 6;
const MIN_LOG_ROWS = 3;
const INPUT_BOX_ROWS = 3;

function useTerminalSize(stdout: NodeJS.WriteStream | undefined) {
  const [size, setSize] = useState({
    cols: Math.max(stdout?.columns || 80, MIN_TERM_COLS),
    rows: Math.max(stdout?.rows || 24, MIN_TERM_ROWS),
  });

  useEffect(() => {
    if (!stdout) return;
    const onResize = () => {
      setSize({
        cols: Math.max(stdout.columns || 80, MIN_TERM_COLS),
        rows: Math.max(stdout.rows || 24, MIN_TERM_ROWS),
      });
    };
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);

  return size;
}

/**
 * Wrap a single text string into lines bounded by `width`. Long words are
 * broken rather than overflowing the column. Returned lines never exceed
 * `width` characters.
 */
export function wrapLine(text: string, width: number): string[] {
  const safeWidth = Math.max(1, width);
  if (!text) return [""];
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";

  for (const rawWord of words) {
    let word = rawWord;
    while (word.length > safeWidth) {
      if (current.length > 0) {
        lines.push(current);
        current = "";
      }
      lines.push(word.slice(0, safeWidth));
      word = word.slice(safeWidth);
    }
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= safeWidth) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

export interface RenderedChatLine {
  role: ChatMessage["role"];
  text: string;
  isContinuation: boolean;
}

/**
 * Given a list of chat messages, produce the visible tail that fits within
 * `availableRows`, respecting `width` for per-line wrapping and applying
 * `scrollOffset` (rows scrolled up from the bottom).
 */
export function layoutMessages(
  messages: ChatMessage[],
  buddyName: string,
  width: number,
  availableRows: number,
  scrollOffset: number,
): { lines: RenderedChatLine[]; maxScroll: number } {
  const all: RenderedChatLine[] = [];
  for (const msg of messages) {
    const prefix =
      msg.role === "user"
        ? "you: "
        : msg.role === "buddy"
          ? `${buddyName}: `
          : "";
    const first = `${prefix}${msg.text}`;
    const wrapped = wrapLine(first, width);
    for (let i = 0; i < wrapped.length; i++) {
      all.push({ role: msg.role, text: wrapped[i], isContinuation: i > 0 });
    }
  }

  const maxScroll = Math.max(0, all.length - availableRows);
  const clampedOffset = Math.max(0, Math.min(scrollOffset, maxScroll));
  const end = all.length - clampedOffset;
  const start = Math.max(0, end - availableRows);
  return { lines: all.slice(start, end), maxScroll };
}

export interface ChatReplProps {
  client: DaemonClient;
  /** Name of the active buddy, used as the "<name>:" prefix. */
  buddyName: string;
  /**
   * Optional callback fired when the user toggles sprite visibility via
   * Ctrl+S. Wired by the entry module to call into the sprite layer.
   */
  onToggleSprite?: () => void;
}

export function ChatRepl({ client, buddyName, onToggleSprite }: ChatReplProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const { cols, rows } = useTerminalSize(stdout);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [scrollOffset, setScrollOffset] = useState(0);

  useEffect(() => {
    const onMessage = (msg: OutboundMessage) => {
      if (msg.type === "chat_response") {
        const text = (msg as ChatResponseMessage).text;
        setMessages((prev) => [
          ...prev,
          { role: "buddy", text, ts: Date.now() },
        ]);
        setScrollOffset(0);
      }
    };
    client.on("message", onMessage);
    client.subscribe();
    return () => {
      client.off("message", onMessage);
    };
  }, [client]);

  const handleSubmit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setMessages((prev) => [
        ...prev,
        { role: "user", text: trimmed, ts: Date.now() },
      ]);
      setScrollOffset(0);
      client.sendChat(trimmed);
    },
    [client],
  );

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === "c")) {
      client.disconnect();
      exit();
      return;
    }
    if (key.ctrl && input === "l") {
      setMessages([]);
      setScrollOffset(0);
      return;
    }
    if (key.ctrl && input === "s") {
      onToggleSprite?.();
      return;
    }
    if (key.pageUp) {
      setScrollOffset((prev) => prev + 5);
      return;
    }
    if (key.pageDown) {
      setScrollOffset((prev) => Math.max(0, prev - 5));
      return;
    }
  });

  const contentWidth = Math.max(cols - 4, 24);
  const logRows = Math.max(MIN_LOG_ROWS, rows - INPUT_BOX_ROWS);

  const { lines: visibleLines, maxScroll } = layoutMessages(
    messages,
    buddyName,
    contentWidth,
    logRows,
    scrollOffset,
  );

  return (
    <Box flexDirection="column" width={cols} height={rows}>
      <Box flexDirection="column" paddingX={1} height={logRows}>
        {messages.length === 0 ? (
          <Text dimColor>
            Chat with {buddyName}. Type a message and press Enter. [Esc] quit
            {"  "}[Ctrl+L] clear{"  "}[Ctrl+S] toggle sprite{"  "}[PgUp/PgDn] scroll
          </Text>
        ) : (
          visibleLines.map((line, i) => (
            <Text
              key={i}
              color={
                line.role === "user"
                  ? "white"
                  : line.role === "buddy"
                    ? "cyan"
                    : "yellow"
              }
              dimColor={line.role === "user" || line.isContinuation}
            >
              {line.text || " "}
            </Text>
          ))
        )}
        {maxScroll > 0 && scrollOffset > 0 && (
          <Text dimColor>-- scrolled up {scrollOffset} row(s) --</Text>
        )}
      </Box>

      <Box borderStyle="round" borderColor="cyan" paddingX={1}>
        <ChatInput onSubmit={handleSubmit} />
      </Box>
    </Box>
  );
}
