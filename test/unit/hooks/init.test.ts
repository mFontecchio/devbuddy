import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  getHookScript,
  detectShell,
  getInitLine,
  installHook,
  uninstallHook,
  isHookInstalled,
  type ShellType,
} from "../../../src/hooks/init.js";

describe("hooks/init", () => {
  describe("getHookScript", () => {
    it("returns bash hook script", () => {
      const script = getHookScript("bash");
      expect(script).toContain("__devbuddy_precmd");
      expect(script).toContain("PROMPT_COMMAND");
    });

    it("returns zsh hook script", () => {
      const script = getHookScript("zsh");
      expect(script).toContain("add-zsh-hook");
      expect(script).toContain("precmd");
    });

    it("returns fish hook script", () => {
      const script = getHookScript("fish");
      expect(script).toContain("fish_postexec");
    });

    it("returns powershell hook script", () => {
      const script = getHookScript("powershell");
      expect(script).toContain("NamedPipeClientStream");
    });
  });

  describe("detectShell", () => {
    it("returns a valid shell type", () => {
      const shell = detectShell();
      expect(["bash", "zsh", "fish", "powershell"]).toContain(shell);
    });
  });

  describe("getInitLine", () => {
    it("returns eval line for bash", () => {
      const line = getInitLine("bash");
      expect(line).toContain("eval");
      expect(line).toContain("devbuddy-managed");
    });

    it("returns source pipe for fish", () => {
      const line = getInitLine("fish");
      expect(line).toContain("source");
      expect(line).toContain("devbuddy-managed");
    });

    it("returns Invoke-Expression for powershell", () => {
      const line = getInitLine("powershell");
      expect(line).toContain("Invoke-Expression");
      expect(line).toContain("devbuddy-managed");
    });
  });

  describe("installHook/uninstallHook", () => {
    const tmpDir = path.join(os.tmpdir(), "devbuddy-test-" + Date.now());
    const testConfig = path.join(tmpDir, ".bashrc");

    beforeEach(() => {
      fs.mkdirSync(tmpDir, { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("detects when hook is not installed", () => {
      fs.writeFileSync(testConfig, "# empty config\n");
      const content = fs.readFileSync(testConfig, "utf-8");
      expect(content.includes("devbuddy-managed")).toBe(false);
    });

    it("detects when hook is installed", () => {
      fs.writeFileSync(
        testConfig,
        '# some config\neval "$(devbuddy hook init bash)" # devbuddy-managed\n',
      );
      const content = fs.readFileSync(testConfig, "utf-8");
      expect(content.includes("devbuddy-managed")).toBe(true);
    });
  });
});
