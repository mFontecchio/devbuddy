import net from "net";
import fs from "fs";
import path from "path";
import os from "os";
import {
  parseMessage,
  serialize,
  type InboundMessage,
  type OutboundMessage,
} from "./protocol.js";
import { log } from "../utils/logger.js";

export interface ClientConnection {
  id: number;
  socket: net.Socket;
  subscribed: boolean;
  buffer: string;
}

export type MessageHandler = (
  msg: InboundMessage,
  client: ClientConnection,
) => void;

export class DaemonServer {
  private server: net.Server | null = null;
  private clients = new Map<number, ClientConnection>();
  private nextClientId = 1;
  private onMessage: MessageHandler;
  private socketPath: string;

  constructor(onMessage: MessageHandler) {
    this.onMessage = onMessage;
    this.socketPath = DaemonServer.getSocketPath();
  }

  static getSocketPath(): string {
    if (process.platform === "win32") {
      return "\\\\.\\pipe\\devbuddy";
    }
    const dir = path.join(os.homedir(), ".devbuddy");
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, "devbuddy.sock");
  }

  static getPidPath(): string {
    const dir = path.join(os.homedir(), ".devbuddy");
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, "devbuddy.pid");
  }

  static isDaemonRunning(): boolean {
    const pidPath = DaemonServer.getPidPath();
    if (!fs.existsSync(pidPath)) return false;

    try {
      const pid = parseInt(fs.readFileSync(pidPath, "utf-8").trim(), 10);
      process.kill(pid, 0);
      return true;
    } catch {
      // PID file stale, clean up
      try {
        fs.unlinkSync(pidPath);
      } catch { /* ignore */ }
      return false;
    }
  }

  static cleanupSocket(): void {
    const socketPath = DaemonServer.getSocketPath();
    if (process.platform !== "win32" && fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath);
    }
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      DaemonServer.cleanupSocket();

      this.server = net.createServer((socket) => this.handleConnection(socket));

      this.server.on("error", (err) => {
        log("error", "Server error", { error: (err as Error).message });
        reject(err);
      });

      this.server.listen(this.socketPath, () => {
        // Write PID file
        const pidPath = DaemonServer.getPidPath();
        fs.writeFileSync(pidPath, String(process.pid));

        log("info", `Daemon listening on ${this.socketPath}`);
        resolve();
      });
    });
  }

  private handleConnection(socket: net.Socket): void {
    const client: ClientConnection = {
      id: this.nextClientId++,
      socket,
      subscribed: false,
      buffer: "",
    };

    this.clients.set(client.id, client);
    log("debug", `Client ${client.id} connected`);

    socket.on("data", (data) => {
      client.buffer += data.toString();

      let newlineIdx: number;
      while ((newlineIdx = client.buffer.indexOf("\n")) !== -1) {
        const line = client.buffer.slice(0, newlineIdx);
        client.buffer = client.buffer.slice(newlineIdx + 1);

        if (line.trim().length === 0) continue;

        const msg = parseMessage(line);
        if (msg) {
          this.onMessage(msg, client);
        }
      }
    });

    socket.on("close", () => {
      this.clients.delete(client.id);
      log("debug", `Client ${client.id} disconnected`);
    });

    socket.on("error", (err) => {
      log("debug", `Client ${client.id} error: ${(err as Error).message}`);
      this.clients.delete(client.id);
    });
  }

  send(client: ClientConnection, msg: OutboundMessage): void {
    if (!client.socket.writable) return;
    try {
      client.socket.write(serialize(msg));
    } catch {
      this.clients.delete(client.id);
    }
  }

  broadcast(msg: OutboundMessage): void {
    for (const client of this.clients.values()) {
      if (client.subscribed) {
        this.send(client, msg);
      }
    }
  }

  get subscriberCount(): number {
    let count = 0;
    for (const client of this.clients.values()) {
      if (client.subscribed) count++;
    }
    return count;
  }

  get clientCount(): number {
    return this.clients.size;
  }

  async stop(): Promise<void> {
    // Close all client connections
    for (const client of this.clients.values()) {
      client.socket.destroy();
    }
    this.clients.clear();

    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          DaemonServer.cleanupSocket();
          // Remove PID file
          try {
            fs.unlinkSync(DaemonServer.getPidPath());
          } catch { /* ignore */ }
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
