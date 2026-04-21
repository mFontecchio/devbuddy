import { claudeWriter } from "./claude.js";
import { cursorWriter, cursorGlobalWriter } from "./cursor.js";
import { copilotWriter } from "./copilot.js";
import type { AgentHookWriter, AgentTool } from "./types.js";

export function getAgentWriter(tool: AgentTool, opts: { global?: boolean } = {}): AgentHookWriter {
  switch (tool) {
    case "claude":
      return claudeWriter;
    case "cursor":
      return opts.global ? cursorGlobalWriter : cursorWriter;
    case "copilot":
      return copilotWriter;
  }
}

export const AGENT_TOOLS: AgentTool[] = ["claude", "cursor", "copilot"];

export type { AgentHookWriter, AgentTool } from "./types.js";
