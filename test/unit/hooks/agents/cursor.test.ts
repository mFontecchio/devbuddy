import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { cursorWriter, cursorGlobalWriter } from "../../../../src/hooks/agents/cursor.js";

describe("hooks/agents/cursor", () => {
  let tmpDir: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "devbuddy-cursor-"));
    originalHome = process.env.HOME;
    originalUserProfile = process.env.USERPROFILE;
    originalCwd = process.cwd();
    process.env.HOME = tmpDir;
    process.env.USERPROFILE = tmpDir;
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalUserProfile;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("install (project) writes to <cwd>/.cursor/hooks.json", () => {
    expect(cursorWriter.isInstalled()).toBe(false);
    const p = cursorWriter.install();
    // Resolve both sides to handle macOS /private/var vs /var symlinks
    expect(fs.realpathSync(p)).toBe(fs.realpathSync(path.join(tmpDir, ".cursor", "hooks.json")));
    expect(fs.existsSync(p)).toBe(true);
    const file = JSON.parse(fs.readFileSync(p, "utf-8"));
    expect(file.hooks.beforeSubmitPrompt).toBeTruthy();
    expect(file.hooks.beforeShellExecution).toBeTruthy();
    expect(file.hooks.afterFileEdit).toBeTruthy();
    expect(file.hooks.stop).toBeTruthy();
    expect(cursorWriter.isInstalled()).toBe(true);
  });

  it("install (global) writes to ~/.cursor/hooks.json", () => {
    const p = cursorGlobalWriter.install();
    expect(fs.realpathSync(p)).toBe(fs.realpathSync(path.join(tmpDir, ".cursor", "hooks.json")));
    expect(fs.existsSync(p)).toBe(true);
  });

  it("install is idempotent", () => {
    cursorWriter.install();
    cursorWriter.install();
    const file = JSON.parse(fs.readFileSync(cursorWriter.configPath(), "utf-8"));
    expect(file.hooks.beforeSubmitPrompt).toHaveLength(1);
  });

  it("install preserves existing non-devbuddy hooks", () => {
    fs.mkdirSync(path.join(tmpDir, ".cursor"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".cursor", "hooks.json"),
      JSON.stringify({
        version: 1,
        hooks: { beforeSubmitPrompt: [{ command: "my-custom" }] },
      }),
    );
    cursorWriter.install();
    const file = JSON.parse(fs.readFileSync(cursorWriter.configPath(), "utf-8"));
    const cmds = file.hooks.beforeSubmitPrompt.map((h: { command: string }) => h.command);
    expect(cmds).toContain("my-custom");
    expect(cmds.some((c: string) => c.includes("devbuddy agent-event"))).toBe(true);
  });

  it("uninstall removes only devbuddy entries", () => {
    fs.mkdirSync(path.join(tmpDir, ".cursor"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".cursor", "hooks.json"),
      JSON.stringify({
        version: 1,
        hooks: { beforeSubmitPrompt: [{ command: "my-custom" }] },
      }),
    );
    cursorWriter.install();
    cursorWriter.uninstall();
    const file = JSON.parse(fs.readFileSync(cursorWriter.configPath(), "utf-8"));
    const cmds = file.hooks?.beforeSubmitPrompt?.map((h: { command: string }) => h.command) ?? [];
    expect(cmds).toContain("my-custom");
    expect(cmds.some((c: string) => c.includes("devbuddy agent-event"))).toBe(false);
  });
});
