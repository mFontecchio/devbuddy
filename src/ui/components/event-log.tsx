import React from "react";
import { Box, Text } from "ink";
import type { RecentEventRecord } from "../../daemon/protocol.js";

interface EventLogProps {
  events: RecentEventRecord[];
}

// Colors/icons for `cmd` events are driven by exit code, and for
// `agent_event` by the sub-kind. Keeping the maps small lets the log
// stay readable instead of turning into a legend the user has to memorize.
const AGENT_COLORS: Record<string, string> = {
  prompt_submit: "cyan",
  tool_use: "magenta",
  file_edit: "blue",
  complete: "green",
  error: "red",
  stop: "gray",
};

const AGENT_ICONS: Record<string, string> = {
  prompt_submit: ">",
  tool_use: "*",
  file_edit: "~",
  complete: "+",
  error: "x",
  stop: ".",
};

function formatTimestamp(ts: number): string {
  return new Date(ts).toTimeString().slice(0, 8);
}

function renderEvent(ev: RecentEventRecord): { color: string; icon: string; text: string } {
  const time = formatTimestamp(ev.ts);

  if (ev.kind === "cmd") {
    const failed = typeof ev.exit === "number" && ev.exit !== 0;
    const color = failed ? "red" : "green";
    const icon = failed ? "x" : ".";
    const exitLabel = failed ? ` (exit ${ev.exit})` : "";
    return { color, icon, text: `${time}  ${ev.summary}${exitLabel}` };
  }

  if (ev.kind === "agent_event") {
    const sub = ev.subKind || "?";
    const color = AGENT_COLORS[sub] || "white";
    const icon = AGENT_ICONS[sub] || "-";
    const src = ev.source ? `${ev.source}/${sub}` : sub;
    return { color, icon, text: `${time}  ${src}  ${ev.summary}` };
  }

  return { color: "yellow", icon: ">", text: `${time}  ${ev.summary}` };
}

export function EventLog({ events }: EventLogProps) {
  if (events.length === 0) {
    return <Text dimColor>Waiting for events...</Text>;
  }

  return (
    <Box flexDirection="column">
      {events.map((ev, i) => {
        const { color, icon, text } = renderEvent(ev);
        return (
          <Text key={i} color={color as any}>
            {icon} {text}
          </Text>
        );
      })}
    </Box>
  );
}
