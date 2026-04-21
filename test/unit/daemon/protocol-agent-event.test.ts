import { describe, it, expect } from "vitest";
import { parseMessage, serialize } from "../../../src/daemon/protocol.js";

describe("protocol / agent_event", () => {
  it("round-trips an agent_event message", () => {
    const raw = serialize({
      type: "agent_event",
      source: "claude",
      kind: "tool_use",
      tool: "Edit",
      file: "/path/to/file.ts",
      summary: "edited file",
    });
    expect(raw.endsWith("\n")).toBe(true);

    const parsed = parseMessage(raw.trim());
    expect(parsed).not.toBeNull();
    if (parsed?.type === "agent_event") {
      expect(parsed.source).toBe("claude");
      expect(parsed.kind).toBe("tool_use");
      expect(parsed.tool).toBe("Edit");
      expect(parsed.file).toBe("/path/to/file.ts");
      expect(parsed.summary).toBe("edited file");
    } else {
      throw new Error("expected agent_event");
    }
  });

  it("accepts all documented kinds", () => {
    const kinds = ["prompt_submit", "tool_use", "file_edit", "complete", "error", "stop"];
    for (const kind of kinds) {
      const parsed = parseMessage(`{"type":"agent_event","source":"cursor","kind":"${kind}"}`);
      expect(parsed).not.toBeNull();
      if (parsed?.type === "agent_event") {
        expect(parsed.kind).toBe(kind);
      }
    }
  });
});
