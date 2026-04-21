import net from "net";
import { EventEmitter } from "events";
import { DaemonServer } from "./server.js";
import {
  serialize,
  type InboundMessage,
  type OutboundMessage,
  type AgentEvent,
} from "./protocol.js";

export class DaemonClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private buffer = "";
  private reconnecting = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connected = false;
  private _subscribed = false;
  private _primary = false;

  get connected(): boolean {
    return this._connected;
  }

  /**
   * Marks this client as the "primary" UI (the floating buddy window).
   * When a primary client disconnects, the daemon interprets that as
   * the user closing the buddy and shuts itself down. Must be called
   * before `subscribe()`; the flag is re-asserted on reconnect.
   */
  setPrimary(primary: boolean): void {
    this._primary = primary;
  }

  connect(autoReconnect = true): Promise<void> {
    return new Promise((resolve, reject) => {
      const socketPath = DaemonServer.getSocketPath();
      this.socket = net.createConnection(socketPath);

      this.socket.on("connect", () => {
        this._connected = true;
        this.reconnecting = false;
        if (this._subscribed) {
          this.send({
            type: "subscribe",
            ...(this._primary ? { primary: true } : {}),
          });
        }
        this.emit("connected");
        resolve();
      });

      this.socket.on("data", (data) => {
        this.buffer += data.toString();

        let newlineIdx: number;
        while ((newlineIdx = this.buffer.indexOf("\n")) !== -1) {
          const line = this.buffer.slice(0, newlineIdx);
          this.buffer = this.buffer.slice(newlineIdx + 1);

          if (line.trim().length === 0) continue;

          try {
            const msg = JSON.parse(line) as OutboundMessage;
            this.emit("message", msg);
            this.emit(msg.type, msg);
          } catch {
            // skip malformed
          }
        }
      });

      this.socket.on("close", () => {
        this._connected = false;
        this.emit("disconnected");
        if (autoReconnect && !this.reconnecting) {
          this.reconnecting = true;
          this.reconnectTimer = setTimeout(() => {
            this.reconnecting = false;
            this.connect(autoReconnect).catch(() => {
              // reconnect will keep retrying via the close handler
            });
          }, 2000);
        }
      });

      this.socket.on("error", (err) => {
        this._connected = false;
        if (!autoReconnect) {
          reject(err);
        }
      });
    });
  }

  send(msg: InboundMessage): void {
    if (this.socket?.writable) {
      this.socket.write(serialize(msg));
    }
  }

  subscribe(): void {
    this._subscribed = true;
    this.send({
      type: "subscribe",
      ...(this._primary ? { primary: true } : {}),
    });
  }

  sendChat(text: string): void {
    this.send({ type: "chat", text });
  }

  sendCommand(cmd: string, exitCode: number, cwd: string): void {
    this.send({ type: "cmd", cmd, exit: exitCode, cwd, timestamp: Date.now() });
  }

  sendAgentEvent(event: Omit<AgentEvent, "type" | "timestamp">): void {
    this.send({ type: "agent_event", timestamp: Date.now(), ...event });
  }

  chooseBuddy(buddyId: string): void {
    this.send({ type: "choose_buddy", buddyId });
  }

  ping(): void {
    this.send({ type: "ping" });
  }

  requestRecentEvents(): void {
    this.send({ type: "get_recent_events" });
  }

  requestStop(): void {
    this.send({ type: "stop" });
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnecting = false;
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this._connected = false;
  }
}
