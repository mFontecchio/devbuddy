import React from "react";
import { Box, Text } from "ink";

interface StatusBarProps {
  buddyName: string;
  level: number;
  connected: boolean;
}

export function StatusBar({ buddyName, level, connected }: StatusBarProps) {
  return (
    <Box
      borderStyle="single"
      borderColor="blue"
      paddingX={1}
      justifyContent="space-between"
    >
      <Text bold color="cyan">
        devBuddy
      </Text>
      <Text>
        <Text bold>{buddyName}</Text>
        <Text dimColor> Lv.{level}</Text>
      </Text>
      <Text color={connected ? "green" : "red"}>
        {connected ? "connected" : "disconnected"}
      </Text>
    </Box>
  );
}
