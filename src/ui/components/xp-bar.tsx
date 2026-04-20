import React from "react";
import { Box, Text } from "ink";

interface XpBarProps {
  xp: number;
  level: number;
  progress: number;
  xpToNext: number;
}

export function XpBar({ xp, level, progress, xpToNext }: XpBarProps) {
  const barWidth = 20;
  const filled = Math.round(progress * barWidth);
  const empty = barWidth - filled;
  const pct = Math.round(progress * 100);

  return (
    <Box flexDirection="column" marginY={1} alignItems="center">
      <Text>
        <Text color="yellow" bold>Lv.{level}</Text>
        <Text dimColor> {xp} XP</Text>
      </Text>
      <Text>
        <Text color="green">{"\u2588".repeat(filled)}</Text>
        <Text color="gray">{"\u2591".repeat(empty)}</Text>
        <Text dimColor> {pct}% ({xpToNext} to next)</Text>
      </Text>
    </Box>
  );
}
