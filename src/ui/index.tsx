import React from "react";
import { render } from "ink";
import { App } from "./app.js";
import { DaemonClient } from "../daemon/client.js";

export interface LaunchUIOptions {
  /**
   * When true, the client subscribes as the primary UI. The daemon
   * treats this client's disconnect as a user-initiated shutdown and
   * stops itself so no orphan background process survives when the
   * floating buddy window is closed.
   */
  primary?: boolean;
}

export async function launchUI(options: LaunchUIOptions = {}): Promise<void> {
  const client = new DaemonClient();

  if (options.primary) client.setPrimary(true);

  try {
    await client.connect(true);
  } catch {
    // Connection will retry automatically via auto-reconnect
  }

  const { waitUntilExit } = render(
    React.createElement(App, { client }),
    { exitOnCtrlC: false },
  );

  await waitUntilExit();
  client.disconnect();
}
