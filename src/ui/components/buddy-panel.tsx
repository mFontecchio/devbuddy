import React from "react";
import { Box, Text } from "ink";

interface BuddyPanelProps {
  frameLines: string[];
  height?: number;
}

export function BuddyPanel({ frameLines, height }: BuddyPanelProps) {
  const targetHeight = height || frameLines.length;
  const lines: string[] = [];

  for (let i = 0; i < targetHeight; i++) {
    if (i < frameLines.length) {
      lines.push(frameLines[i] || " ");
    } else {
      lines.push(" ");
    }
  }

  return (
    <Box flexDirection="column" alignItems="center">
      {lines.map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
    </Box>
  );
}
