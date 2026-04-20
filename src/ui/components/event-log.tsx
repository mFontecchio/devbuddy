import React from "react";
import { Box, Text } from "ink";

interface EventLogProps {
  events: string[];
}

const EVENT_COLORS: Record<string, string> = {
  "test:pass": "green",
  "test:fail": "red",
  "build:success": "green",
  "build:fail": "red",
  "compile:error": "red",
  "runtime:error": "red",
  "git:commit": "yellow",
  "npm:install": "blue",
  "generic:error": "red",
  "generic:success": "green",
  "fs:error": "red",
  "cmd:test": "cyan",
  "cmd:build": "cyan",
  "cmd:git-commit": "yellow",
  "cmd:git-push": "yellow",
  "cmd:git-pull": "blue",
  "cmd:git-merge": "yellow",
  "cmd:install": "blue",
  "cmd:lint": "magenta",
  "cmd:run": "green",
  "cmd:devops": "cyan",
};

const EVENT_ICONS: Record<string, string> = {
  "test:pass": "+",
  "test:fail": "x",
  "build:success": "+",
  "build:fail": "x",
  "compile:error": "!",
  "runtime:error": "!",
  "git:commit": "*",
  "npm:install": "~",
  "generic:error": "x",
  "generic:success": ".",
  "cmd:test": ">",
  "cmd:build": ">",
  "cmd:git-commit": "*",
  "cmd:git-push": "^",
  "cmd:git-pull": "v",
  "cmd:git-merge": "=",
  "cmd:install": "~",
  "cmd:lint": ">",
  "cmd:run": ">",
  "cmd:devops": ">",
};

export function EventLog({ events }: EventLogProps) {
  if (events.length === 0) {
    return <Text dimColor>Waiting for events...</Text>;
  }

  return (
    <Box flexDirection="column">
      {events.map((event, i) => (
        <Text key={i} color={(EVENT_COLORS[event] as any) || "white"}>
          {EVENT_ICONS[event] || "-"} {event}
        </Text>
      ))}
    </Box>
  );
}
