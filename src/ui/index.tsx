import React from "react";
import { render } from "ink";
import { App } from "./app.js";
import { DaemonClient } from "../daemon/client.js";

export async function launchUI(): Promise<void> {
  const client = new DaemonClient();

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
