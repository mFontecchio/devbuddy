import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import net from "net";
import fs from "fs";
import { DaemonServer } from "../../../src/daemon/server.js";

describe("DaemonServer", () => {
  let server: DaemonServer;
  let messageHandler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    messageHandler = vi.fn();
    server = new DaemonServer(messageHandler);
  });

  afterEach(async () => {
    try {
      await server.stop();
    } catch { /* ignore */ }
  });

  describe("getSocketPath", () => {
    it("returns a named pipe path on Windows", () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "win32" });
      const path = DaemonServer.getSocketPath();
      expect(path).toBe("\\\\.\\pipe\\devbuddy");
      Object.defineProperty(process, "platform", { value: originalPlatform });
    });

    it("returns a Unix socket path on Linux/Mac", () => {
      if (process.platform === "win32") {
        // Cannot reliably test Unix socket path on Windows
        return;
      }
      const socketPath = DaemonServer.getSocketPath();
      expect(socketPath).toContain("devbuddy.sock");
    });
  });

  describe("getPidPath", () => {
    it("returns a path ending with devbuddy.pid", () => {
      const pidPath = DaemonServer.getPidPath();
      expect(pidPath).toContain("devbuddy.pid");
    });
  });

  describe("lifecycle", () => {
    it("starts and accepts connections", async () => {
      await server.start();
      expect(server.clientCount).toBe(0);

      const socketPath = DaemonServer.getSocketPath();
      const client = net.createConnection(socketPath);

      await new Promise<void>((resolve) => {
        client.on("connect", () => {
          resolve();
        });
      });

      // Give the server time to register the connection
      await new Promise((r) => setTimeout(r, 50));
      expect(server.clientCount).toBe(1);

      client.destroy();
      await new Promise((r) => setTimeout(r, 50));
      expect(server.clientCount).toBe(0);
    });

    it("writes PID file on start", async () => {
      await server.start();
      const pidPath = DaemonServer.getPidPath();
      expect(fs.existsSync(pidPath)).toBe(true);
      const pid = parseInt(fs.readFileSync(pidPath, "utf-8").trim(), 10);
      expect(pid).toBe(process.pid);
    });

    it("cleans up PID file on stop", async () => {
      await server.start();
      await server.stop();
      expect(fs.existsSync(DaemonServer.getPidPath())).toBe(false);
    });

    it("handles JSON messages from clients", async () => {
      await server.start();
      const socketPath = DaemonServer.getSocketPath();
      const client = net.createConnection(socketPath);

      await new Promise<void>((resolve) => client.on("connect", resolve));

      client.write('{"type":"ping"}\n');
      await new Promise((r) => setTimeout(r, 100));

      expect(messageHandler).toHaveBeenCalledTimes(1);
      expect(messageHandler).toHaveBeenCalledWith(
        expect.objectContaining({ type: "ping" }),
        expect.objectContaining({ id: expect.any(Number) }),
      );

      client.destroy();
    });

    it("handles multiple messages in a single data chunk", async () => {
      await server.start();
      const socketPath = DaemonServer.getSocketPath();
      const client = net.createConnection(socketPath);

      await new Promise<void>((resolve) => client.on("connect", resolve));

      client.write('{"type":"ping"}\n{"type":"subscribe"}\n');
      await new Promise((r) => setTimeout(r, 100));

      expect(messageHandler).toHaveBeenCalledTimes(2);
      client.destroy();
    });

    it("ignores malformed JSON", async () => {
      await server.start();
      const socketPath = DaemonServer.getSocketPath();
      const client = net.createConnection(socketPath);

      await new Promise<void>((resolve) => client.on("connect", resolve));

      client.write("not json\n");
      await new Promise((r) => setTimeout(r, 100));

      expect(messageHandler).not.toHaveBeenCalled();
      client.destroy();
    });
  });

  describe("broadcast", () => {
    it("sends messages only to subscribed clients", async () => {
      await server.start();
      const socketPath = DaemonServer.getSocketPath();

      // Simulate subscribe via message handler
      messageHandler.mockImplementation((msg, client) => {
        if (msg.type === "subscribe") {
          client.subscribed = true;
        }
      });

      const client1 = net.createConnection(socketPath);
      await new Promise<void>((resolve) => client1.on("connect", resolve));
      client1.write('{"type":"subscribe"}\n');
      await new Promise((r) => setTimeout(r, 50));

      const client2 = net.createConnection(socketPath);
      await new Promise<void>((resolve) => client2.on("connect", resolve));
      // client2 does NOT subscribe

      const received: string[] = [];
      client1.on("data", (data) => received.push(data.toString()));
      client2.on("data", (data) => received.push("unexpected:" + data.toString()));

      server.broadcast({ type: "pong", uptime: 1000, clients: 2 });
      await new Promise((r) => setTimeout(r, 100));

      expect(received.length).toBe(1);
      expect(received[0]).toContain('"pong"');

      client1.destroy();
      client2.destroy();
    });
  });
});
