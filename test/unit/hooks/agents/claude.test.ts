import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { claudeWriter } from "../../../../src/hooks/agents/claude.js";

describe("hooks/agents/claude", () => {
  let tmpDir: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "devbuddy-claude-"));
    originalHome = process.env.HOME;
    originalUserProfile = process.env.USERPROFILE;
    process.env.HOME = tmpDir;
    process.env.USERPROFILE = tmpDir;
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalUserProfile;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("install creates settings.json with devbuddy hooks when none exists", () => {
    expect(claudeWriter.isInstalled()).toBe(false);
    const configPath = claudeWriter.install();
    expect(configPath.startsWith(tmpDir)).toBe(true);
    expect(fs.existsSync(configPath)).toBe(true);
    const settings = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(settings.hooks.UserPromptSubmit).toBeTruthy();
    expect(settings.hooks.PreToolUse).toBeTruthy();
    expect(settings.hooks.PostToolUse).toBeTruthy();
    expect(settings.hooks.Stop).toBeTruthy();
    expect(claudeWriter.isInstalled()).toBe(true);
  });

  it("install is idempotent (calling twice does not duplicate)", () => {
    claudeWriter.install();
    claudeWriter.install();
    const settings = JSON.parse(fs.readFileSync(claudeWriter.configPath(), "utf-8"));
    expect(settings.hooks.UserPromptSubmit).toHaveLength(1);
    expect(settings.hooks.Stop).toHaveLength(1);
  });

  it("install preserves existing unrelated hooks and settings", () => {
    const configDir = path.join(tmpDir, ".claude");
    fs.mkdirSync(configDir, { recursive: true });
    const existing = {
      theme: "dark",
      hooks: {
        UserPromptSubmit: [
          { hooks: [{ type: "command", command: "echo hello" }] },
        ],
      },
    };
    fs.writeFileSync(path.join(configDir, "settings.json"), JSON.stringify(existing, null, 2));

    claudeWriter.install();
    const merged = JSON.parse(fs.readFileSync(claudeWriter.configPath(), "utf-8"));
    expect(merged.theme).toBe("dark");
    expect(merged.hooks.UserPromptSubmit.length).toBeGreaterThanOrEqual(2);
  });

  it("uninstall removes only devbuddy hooks, leaves user hooks intact", () => {
    const configDir = path.join(tmpDir, ".claude");
    fs.mkdirSync(configDir, { recursive: true });
    const existing = {
      hooks: {
        UserPromptSubmit: [
          { hooks: [{ type: "command", command: "my-custom-hook" }] },
        ],
      },
    };
    fs.writeFileSync(path.join(configDir, "settings.json"), JSON.stringify(existing, null, 2));
    claudeWriter.install();
    claudeWriter.uninstall();

    const after = JSON.parse(fs.readFileSync(claudeWriter.configPath(), "utf-8"));
    const upsHooks = after.hooks?.UserPromptSubmit ?? [];
    const allCommands = upsHooks.flatMap((e: { hooks: Array<{ command: string }> }) => e.hooks.map((h) => h.command));
    expect(allCommands).toContain("my-custom-hook");
    expect(allCommands.some((c: string) => c.includes("devbuddy agent-event"))).toBe(false);
    expect(claudeWriter.isInstalled()).toBe(false);
  });
});
