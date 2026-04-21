import React from "react";
import { Box, Text } from "ink";

interface SpeechBubbleProps {
  text: string | null;
  maxWidth?: number;
  reservedLines?: number;
}

const MIN_WIDTH = 8;
const MAX_WIDTH = 120;

function wrapText(text: string, innerWidth: number): string[] {
  const safeWidth = Math.max(MIN_WIDTH, innerWidth);
  const words = text.split(/\s+/);
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

    if (current.length + word.length + 1 > safeWidth && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = current.length > 0 ? `${current} ${word}` : word;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

export function SpeechBubble({ text, maxWidth = 40, reservedLines = 4 }: SpeechBubbleProps) {
  const safeMax = Math.min(Math.max(maxWidth, MIN_WIDTH + 4), MAX_WIDTH);

  if (!text) {
    const emptyLines = [];
    for (let i = 0; i < reservedLines; i++) {
      emptyLines.push(<Text key={i}> </Text>);
    }
    return (
      <Box flexDirection="column" alignItems="center" height={reservedLines}>
        {emptyLines}
      </Box>
    );
  }

  const innerWidth = safeMax - 4;
  const wrapped = wrapText(text, innerWidth);
  const maxVisibleLines = Math.max(1, reservedLines - 2); // top+bottom borders
  const lines = wrapped.slice(0, maxVisibleLines);

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

  // Pad to reserved height so layout stays stable across renders/resize.
  const totalLines = rendered.length;
  for (let i = totalLines; i < reservedLines; i++) {
    rendered.push(<Text key={`pad${i}`}> </Text>);
  }

  return (
    <Box flexDirection="column" alignItems="center" height={reservedLines}>
      {rendered}
    </Box>
  );
}
