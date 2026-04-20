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

const SPRITE_HEIGHT = 6;
const SPEECH_HEIGHT = 5;

export function App({ client }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [state, setState] = useState<BuddyStateUpdate | null>(null);
  const [connected, setConnected] = useState(client.connected);
  const [chatMode, setChatMode] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  const [showEvents, setShowEvents] = useState(false);

  const termWidth = stdout?.columns || 80;
  const isNarrow = termWidth < 60;

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
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">Connecting to devBuddy daemon...</Text>
        <Text dimColor>Make sure the daemon is running: devbuddy daemon start</Text>
      </Box>
    );
  }

  if (!state) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">Waiting for buddy state...</Text>
      </Box>
    );
  }

  const speechWidth = isNarrow ? termWidth - 6 : 40;

  return (
    <Box flexDirection="column" width="100%">
      <StatusBar
        buddyName={state.buddy.name}
        level={state.progress.level}
        connected={connected}
      />

      <Box flexDirection="column" alignItems="center" paddingX={1}>
        <BuddyPanel frameLines={state.animation.frameLines} height={SPRITE_HEIGHT} />

        <SpeechBubble
          text={state.speech}
          maxWidth={speechWidth}
          reservedLines={SPEECH_HEIGHT}
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
