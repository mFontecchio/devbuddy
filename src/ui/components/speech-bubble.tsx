import React from "react";
import { Box, Text } from "ink";

interface SpeechBubbleProps {
  text: string | null;
  maxWidth?: number;
  reservedLines?: number;
}

export function SpeechBubble({ text, maxWidth = 40, reservedLines = 4 }: SpeechBubbleProps) {
  if (!text) {
    const emptyLines = [];
    for (let i = 0; i < reservedLines; i++) {
      emptyLines.push(<Text key={i}> </Text>);
    }
    return (
      <Box flexDirection="column" alignItems="center">
        {emptyLines}
      </Box>
    );
  }

  const innerWidth = maxWidth - 4;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (current.length + word.length + 1 > innerWidth && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = current.length > 0 ? `${current} ${word}` : word;
    }
  }
  if (current.length > 0) lines.push(current);

  const widest = Math.max(...lines.map((l) => l.length), 1);
  const top = "\u250C" + "\u2500".repeat(widest + 2) + "\u2510";
  const bottom = "\u2514" + "\u2500".repeat(widest + 2) + "\u2518";

  const rendered: React.ReactElement[] = [];
  rendered.push(<Text key="top" color="cyan">{top}</Text>);
  for (let i = 0; i < lines.length; i++) {
    rendered.push(
      <Text key={`l${i}`} color="cyan">
        {"\u2502"} {lines[i].padEnd(widest)} {"\u2502"}
      </Text>
    );
  }
  rendered.push(<Text key="bot" color="cyan">{bottom}</Text>);
  rendered.push(<Text key="tail" color="cyan">{"  \u2572"}</Text>);

  // Pad to reserved height so layout stays stable
  const totalLines = rendered.length;
  for (let i = totalLines; i < reservedLines; i++) {
    rendered.push(<Text key={`pad${i}`}> </Text>);
  }

  return (
    <Box flexDirection="column" alignItems="center">
      {rendered}
    </Box>
  );
}
