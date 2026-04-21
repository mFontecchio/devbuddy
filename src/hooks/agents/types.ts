export type AgentTool = "claude" | "cursor" | "copilot";

export interface AgentHookWriter {
  tool: AgentTool;
  configPath(): string;
  isInstalled(): boolean;
  install(): string;
  uninstall(): string;
}

export const DEVBUDDY_MARKER = "devbuddy-managed";
