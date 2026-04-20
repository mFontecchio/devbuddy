import { describe, it, expect } from "vitest";
import {
  serialize,
  parseMessage,
  type InboundMessage,
  type OutboundMessage,
} from "../../../src/daemon/protocol.js";

describe("protocol", () => {
  describe("serialize", () => {
    it("serializes an outbound message to JSON with newline", () => {
      const msg: OutboundMessage = {
        type: "pong",
        uptime: 5000,
        clients: 2,
      };
      const result = serialize(msg);
      expect(result).toBe('{"type":"pong","uptime":5000,"clients":2}\n');
    });

    it("serializes an inbound message to JSON with newline", () => {
      const msg: InboundMessage = {
        type: "cmd",
        cmd: "npm test",
        exit: 0,
        cwd: "/project",
      };
      const result = serialize(msg);
      expect(result).toContain('"type":"cmd"');
      expect(result.endsWith("\n")).toBe(true);
    });
  });

  describe("parseMessage", () => {
    it("parses a valid command event", () => {
      const raw = '{"type":"cmd","cmd":"npm test","exit":0,"cwd":"/project"}';
      const msg = parseMessage(raw);
      expect(msg).not.toBeNull();
      expect(msg!.type).toBe("cmd");
      if (msg!.type === "cmd") {
        expect(msg!.cmd).toBe("npm test");
        expect(msg!.exit).toBe(0);
        expect(msg!.cwd).toBe("/project");
      }
    });

    it("parses a chat message", () => {
      const raw = '{"type":"chat","text":"hello buddy"}';
      const msg = parseMessage(raw);
      expect(msg).not.toBeNull();
      expect(msg!.type).toBe("chat");
    });

    it("parses a subscribe message", () => {
      const raw = '{"type":"subscribe"}';
      const msg = parseMessage(raw);
      expect(msg).not.toBeNull();
      expect(msg!.type).toBe("subscribe");
    });

    it("parses a ping message", () => {
      const raw = '{"type":"ping"}';
      const msg = parseMessage(raw);
      expect(msg!.type).toBe("ping");
    });

    it("parses a stop message", () => {
      const raw = '{"type":"stop"}';
      const msg = parseMessage(raw);
      expect(msg!.type).toBe("stop");
    });

    it("returns null for invalid JSON", () => {
      expect(parseMessage("not json")).toBeNull();
    });

    it("returns null for JSON without type field", () => {
      expect(parseMessage('{"foo":"bar"}')).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(parseMessage("")).toBeNull();
    });

    it("trims whitespace before parsing", () => {
      const raw = '  {"type":"ping"}  \n';
      const msg = parseMessage(raw);
      expect(msg).not.toBeNull();
      expect(msg!.type).toBe("ping");
    });

    it("parses output event", () => {
      const raw = '{"type":"output","line":"PASS test.ts"}';
      const msg = parseMessage(raw);
      expect(msg).not.toBeNull();
      expect(msg!.type).toBe("output");
    });

    it("parses choose_buddy message", () => {
      const raw = '{"type":"choose_buddy","buddyId":"spark"}';
      const msg = parseMessage(raw);
      expect(msg).not.toBeNull();
      expect(msg!.type).toBe("choose_buddy");
    });
  });
});
