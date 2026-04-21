import React from "react";
import { Box, Text } from "ink";

interface BuddyPanelProps {
  frameLines: string[];
  height?: number;
  maxWidth?: number;
}

function clampLine(line: string, maxWidth?: number): string {
  if (!maxWidth || maxWidth <= 0) return line;
  if (line.length <= maxWidth) return line;
  return line.slice(0, maxWidth);
}

export function BuddyPanel({ frameLines, height, maxWidth }: BuddyPanelProps) {
  const targetHeight = height ?? frameLines.length;
  const lines: string[] = [];

  for (let i = 0; i < targetHeight; i++) {
    const raw = i < frameLines.length ? (frameLines[i] || " ") : " ";
    lines.push(clampLine(raw, maxWidth));
  }

  return (
    <Box flexDirection="column" alignItems="center" height={targetHeight}>
      {lines.map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
    </Box>
  );
}
