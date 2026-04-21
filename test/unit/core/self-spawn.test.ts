import { describe, it, expect } from "vitest";
import path from "path";
import { resolveSelfInvocation } from "../../../src/core/self-spawn.js";

describe("resolveSelfInvocation", () => {
  it("uses node + script when entry is a .js file", () => {
    const result = resolveSelfInvocation({
      script: "/opt/proj/dist/devbuddy.js",
      execPath: "/usr/bin/node",
      platform: "linux",
      exists: () => false,
    });
    expect(result).toEqual({
      command: "/usr/bin/node",
      args: ["/opt/proj/dist/devbuddy.js"],
      needsShell: false,
    });
  });

  it("uses node + dist/devbuddy.js when running .ts with a built dist", () => {
    const pkgRoot = path.sep === "\\" ? "C:\\proj" : "/proj";
    const script = path.join(pkgRoot, "bin", "devbuddy.ts");
    const expectedDist = path.join(pkgRoot, "dist", "devbuddy.js");
    const pkgJson = path.join(pkgRoot, "package.json");

    const result = resolveSelfInvocation({
      script,
      execPath: "/usr/bin/node",
      platform: "linux",
      exists: (p) => p === pkgJson || p === expectedDist,
    });

    expect(result).toEqual({
      command: "/usr/bin/node",
      args: [expectedDist],
      needsShell: false,
    });
  });

  it("falls back to `npx tsx <script>` on linux when no dist is built", () => {
    const pkgRoot = path.sep === "\\" ? "C:\\proj" : "/proj";
    const script = path.join(pkgRoot, "bin", "devbuddy.ts");
    const pkgJson = path.join(pkgRoot, "package.json");

    const result = resolveSelfInvocation({
      script,
      execPath: "/usr/bin/node",
      platform: "linux",
      exists: (p) => p === pkgJson,
    });

    expect(result.command).toBe("npx");
    expect(result.args).toEqual(["tsx", script]);
    expect(result.needsShell).toBe(false);
  });

  it("uses npx.cmd with shell: true on Windows when falling back to tsx", () => {
    const pkgRoot = "C:\\proj";
    const script = path.win32.join(pkgRoot, "bin", "devbuddy.ts");
    const pkgJson = path.win32.join(pkgRoot, "package.json");

    const result = resolveSelfInvocation({
      script,
      execPath: "C:\\Program Files\\nodejs\\node.exe",
      platform: "win32",
      exists: (p) => p === pkgJson,
    });

    expect(result.command).toBe("npx.cmd");
    expect(result.args).toEqual(["tsx", script]);
    expect(result.needsShell).toBe(true);
  });

  it("handles missing package root gracefully", () => {
    const result = resolveSelfInvocation({
      script: "/nowhere/bin/devbuddy.ts",
      execPath: "/usr/bin/node",
      platform: "linux",
      exists: () => false,
    });

    expect(result.command).toBe("npx");
    expect(result.args).toEqual(["tsx", "/nowhere/bin/devbuddy.ts"]);
  });
});
