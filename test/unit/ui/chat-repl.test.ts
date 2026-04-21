import { describe, it, expect } from "vitest";
import {
  wrapLine,
  layoutMessages,
  type ChatMessage,
} from "../../../src/ui/chat-repl.js";

describe("wrapLine", () => {
  it("returns a single empty line for empty input", () => {
    expect(wrapLine("", 20)).toEqual([""]);
  });

  it("does not split short single-line text", () => {
    expect(wrapLine("hello world", 20)).toEqual(["hello world"]);
  });

  it("wraps text onto multiple lines at word boundaries", () => {
    const out = wrapLine("hello there buddy this is a long line", 12);
    for (const line of out) {
      expect(line.length).toBeLessThanOrEqual(12);
    }
    expect(out.join(" ")).toBe("hello there buddy this is a long line");
  });

  it("breaks words longer than the width", () => {
    const out = wrapLine("abcdefghij", 4);
    expect(out).toEqual(["abcd", "efgh", "ij"]);
  });

  it("respects a width of 1 without looping forever", () => {
    const out = wrapLine("ab c", 1);
    expect(out.every((l) => l.length <= 1)).toBe(true);
  });
});

function makeMessages(): ChatMessage[] {
  return [
    { role: "user", text: "hello", ts: 1 },
    { role: "buddy", text: "hi there", ts: 2 },
    { role: "user", text: "how are you doing today my friend", ts: 3 },
    { role: "buddy", text: "pretty good", ts: 4 },
  ];
}

describe("layoutMessages", () => {
  it("prefixes user lines with 'you: ' and buddy lines with the buddy name", () => {
    const { lines } = layoutMessages(makeMessages(), "Pixel", 80, 10, 0);
    const first = lines.find((l) => l.role === "user" && !l.isContinuation);
    const second = lines.find((l) => l.role === "buddy" && !l.isContinuation);
    expect(first?.text.startsWith("you: ")).toBe(true);
    expect(second?.text.startsWith("Pixel: ")).toBe(true);
  });

  it("returns the tail when there are more lines than fit", () => {
    const msgs: ChatMessage[] = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "buddy") as ChatMessage["role"],
      text: `msg-${i}`,
      ts: i,
    }));
    const { lines, maxScroll } = layoutMessages(msgs, "Buddy", 80, 5, 0);
    expect(lines.length).toBe(5);
    expect(lines[lines.length - 1].text.endsWith("msg-19")).toBe(true);
    expect(maxScroll).toBe(15);
  });

  it("scroll offset moves the window backward through history", () => {
    const msgs: ChatMessage[] = Array.from({ length: 10 }, (_, i) => ({
      role: "user" as const,
      text: `msg-${i}`,
      ts: i,
    }));
    const { lines } = layoutMessages(msgs, "B", 80, 3, 2);
    expect(lines.map((l) => l.text)).toEqual([
      "you: msg-5",
      "you: msg-6",
      "you: msg-7",
    ]);
  });

  it("clamps scroll offset at maxScroll", () => {
    const msgs: ChatMessage[] = Array.from({ length: 4 }, (_, i) => ({
      role: "user" as const,
      text: `m${i}`,
      ts: i,
    }));
    const { lines, maxScroll } = layoutMessages(msgs, "B", 80, 3, 999);
    expect(maxScroll).toBe(1);
    expect(lines.map((l) => l.text)).toEqual([
      "you: m0",
      "you: m1",
      "you: m2",
    ]);
  });

  it("marks wrapped continuation rows", () => {
    const msgs: ChatMessage[] = [
      { role: "buddy", text: "one two three four five six", ts: 1 },
    ];
    const { lines } = layoutMessages(msgs, "Buddy", 12, 10, 0);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0].isContinuation).toBe(false);
    expect(lines[1].isContinuation).toBe(true);
  });
});
