import type { AgentHookWriter } from "./types.js";

/**
 * GitHub Copilot CLI (`gh copilot`) does not expose native hooks at the time
 * of writing. The supported integration path is the `devbuddy copilot ...`
 * wrapper command (see src/cli.ts), which runs the Copilot CLI under
 * `devbuddy watch` and tags events with source=copilot.
 *
 * This writer is a no-op placeholder so the `devbuddy agent install/uninstall
 * --tool copilot` commands print a clear message instead of failing.
 */
export const copilotWriter: AgentHookWriter = {
  tool: "copilot",

  configPath(): string {
    return "(wrapper command: devbuddy copilot <args>)";
  },

  isInstalled(): boolean {
    return false;
  },

  install(): string {
    return "Copilot CLI does not support native hooks. Use the wrapper command: devbuddy copilot <args>";
  },

  uninstall(): string {
    return "Nothing to remove. Copilot integration is wrapper-based: devbuddy copilot <args>";
  },
};
