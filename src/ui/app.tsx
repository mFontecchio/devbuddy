import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { DaemonClient } from "../daemon/client.js";
import type {
  BuddyStateUpdate,
  EventNotification,
  OutboundMessage,
} from "../daemon/protocol.js";
import { BuddyPanel } from "./components/buddy-panel.js";
import { SpeechBubble } from "./components/speech-bubble.js";
import { XpBar } from "./components/xp-bar.js";
import { StatusBar } from "./components/status-bar.js";
import { ChatInput } from "./components/chat-input.js";
import { EventLog } from "./components/event-log.js";

interface AppProps {
  client: DaemonClient;
}

// Hard floors so the layout can never collapse into itself.
const MIN_SPRITE_HEIGHT = 4;
const MIN_SPEECH_HEIGHT = 3;
const MIN_TERM_COLS = 20;
const MIN_TERM_ROWS = 10;

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

export function App({ client }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [state, setState] = useState<BuddyStateUpdate | null>(null);
  const [connected, setConnected] = useState(client.connected);
  const [chatMode, setChatMode] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  const [showEvents, setShowEvents] = useState(false);

  const { cols: termCols, rows: termRows } = useTerminalSize(stdout);

  useEffect(() => {
    const onMessage = (msg: OutboundMessage) => {
      switch (msg.type) {
        case "state":
          setState(msg);
          break;
        case "event":
          setEvents((prev) => [...prev.slice(-9), (msg as EventNotification).event]);
          break;
        case "chat_response":
          break;
      }
    };

    const onConnected = () => setConnected(true);
    const onDisconnected = () => setConnected(false);

    client.on("message", onMessage);
    client.on("connected", onConnected);
    client.on("disconnected", onDisconnected);

    client.subscribe();

    return () => {
      client.off("message", onMessage);
      client.off("connected", onConnected);
      client.off("disconnected", onDisconnected);
    };
  }, [client]);

  useInput((input, key) => {
    if (key.escape) {
      if (chatMode) {
        setChatMode(false);
      } else {
        client.disconnect();
        exit();
      }
    }

    if (!chatMode && input === "c") {
      setChatMode(true);
    }

    if (!chatMode && input === "e") {
      setShowEvents((prev) => !prev);
    }
  });

  const handleChatSubmit = useCallback(
    (text: string) => {
      if (text.trim()) {
        client.sendChat(text.trim());
      }
      setChatMode(false);
    },
    [client],
  );

  if (!connected) {
    return (
      <Box flexDirection="column" padding={1} width={termCols}>
        <Text color="yellow">Connecting to devBuddy daemon...</Text>
        <Text dimColor>Make sure the daemon is running: devbuddy daemon start</Text>
      </Box>
    );
  }

  if (!state) {
    return (
      <Box flexDirection="column" padding={1} width={termCols}>
        <Text color="cyan">Waiting for buddy state...</Text>
      </Box>
    );
  }

  // Compute layout bounds so nothing overflows or overlaps when the user resizes.
  // Budget: status(1) + sprite(h) + speech(h) + xp(1) + chat(3) + margins(~2) must
  // fit in termRows; width must fit in termCols with some horizontal padding.
  const contentWidth = Math.max(termCols - 4, 24);

  const spriteHeightFromFrame = state.animation.frameLines.length || MIN_SPRITE_HEIGHT;
  const spriteHeight = Math.min(
    Math.max(spriteHeightFromFrame, MIN_SPRITE_HEIGHT),
    Math.max(Math.floor(termRows * 0.35), MIN_SPRITE_HEIGHT),
  );

  // Speech gets the remaining vertical budget (after status/sprite/xp/chat), clamped.
  const reservedForOther = 1 /* status */ + spriteHeight + 1 /* xp */ + 3 /* chat */ + 2 /* margins */;
  const speechHeight = Math.max(
    MIN_SPEECH_HEIGHT,
    Math.min(6, termRows - reservedForOther),
  );

  const speechWidth = Math.min(contentWidth, 60);

  return (
    <Box flexDirection="column" width={termCols} height={termRows}>
      <StatusBar
        buddyName={state.buddy.name}
        level={state.progress.level}
        connected={connected}
      />

      <Box flexDirection="column" alignItems="center" paddingX={1} width={termCols}>
        <BuddyPanel
          frameLines={state.animation.frameLines}
          height={spriteHeight}
          maxWidth={contentWidth}
        />

        <SpeechBubble
          text={state.speech}
          maxWidth={speechWidth}
          reservedLines={speechHeight}
        />

        <XpBar
          xp={state.progress.xp}
          level={state.progress.level}
          progress={state.xpProgress}
          xpToNext={state.xpToNext}
        />
      </Box>

      {showEvents && events.length > 0 && (
        <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginX={1}>
          <Text bold dimColor>Recent Events</Text>
          <EventLog events={events} />
        </Box>
      )}

      <Box borderStyle="round" borderColor={chatMode ? "cyan" : "gray"} paddingX={1} marginX={1}>
        {chatMode ? (
          <ChatInput onSubmit={handleChatSubmit} />
        ) : (
          <Text dimColor>[c] chat  [e] events  [Esc] quit</Text>
        )}
      </Box>
    </Box>
  );
}
