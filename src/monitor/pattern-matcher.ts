import { log } from "../utils/logger.js";

export interface PatternRule {
  pattern: RegExp;
  event: string;
  extract?: "count" | "message";
}

export interface PatternMatch {
  event: string;
  match: string;
  groups?: string[];
}

const DEFAULT_PATTERNS: PatternRule[] = [
  // --- Command-name patterns (matched against the command string from hooks) ---
  { pattern: /^(?:npm\s+(?:run\s+)?test|npx\s+vitest|npx\s+jest|pytest|cargo\s+test|go\s+test|dotnet\s+test|vitest)/i, event: "cmd:test" },
  { pattern: /^(?:npm\s+run\s+build|npx\s+tsc|tsc\b|make\b|cargo\s+build|go\s+build|dotnet\s+build|gradle\s+build|mvn\s+(?:compile|package))/i, event: "cmd:build" },
  { pattern: /^git\s+commit/i, event: "cmd:git-commit" },
  { pattern: /^git\s+push/i, event: "cmd:git-push" },
  { pattern: /^git\s+pull/i, event: "cmd:git-pull" },
  { pattern: /^git\s+merge/i, event: "cmd:git-merge" },
  { pattern: /^(?:npm\s+install|npm\s+i\b|yarn\s+add|pnpm\s+add|pip\s+install|cargo\s+add)/i, event: "cmd:install" },
  { pattern: /^(?:npm\s+run\s+(?:lint|eslint)|npx\s+eslint|npx\s+prettier|eslint\b)/i, event: "cmd:lint" },
  { pattern: /^(?:npm\s+run\s+(?:dev|start|serve)|npm\s+start|node\s+|python\s+|cargo\s+run|go\s+run|dotnet\s+run)/i, event: "cmd:run" },
  { pattern: /^(?:docker|kubectl|terraform|pulumi|sam\s|cdk\s)/i, event: "cmd:devops" },

  // --- Output-line patterns (matched against terminal output forwarded via "output" messages) ---
  // Test results - various frameworks
  { pattern: /(\d+)\s+passing/i, event: "test:pass", extract: "count" },
  { pattern: /(\d+)\s+failing/i, event: "test:fail", extract: "count" },
  { pattern: /Tests:\s+\d+ passed,\s+\d+ total/i, event: "test:pass" },
  { pattern: /Tests:\s+\d+ failed/i, event: "test:fail" },
  { pattern: /FAIL\s+\w/i, event: "test:fail" },
  { pattern: /PASS\s+\w/i, event: "test:pass" },
  { pattern: /Test Suites:.*\d+ passed/i, event: "test:pass" },
  { pattern: /✓|✔|PASSED/i, event: "test:pass" },

  // Build/compile
  { pattern: /error TS\d+:/i, event: "compile:error" },
  { pattern: /SyntaxError:/i, event: "runtime:error" },
  { pattern: /Build succeeded/i, event: "build:success" },
  { pattern: /Successfully compiled/i, event: "build:success" },
  { pattern: /webpack.*compiled successfully/i, event: "build:success" },
  { pattern: /Build failed/i, event: "build:fail" },

  // Git
  { pattern: /\[[\w/-]+\s+[\da-f]+\]/i, event: "git:commit" },
  { pattern: /Already up to date/i, event: "git:uptodate" },

  // Package managers
  { pattern: /added \d+ packages/i, event: "npm:install" },
  { pattern: /packages are looking for funding/i, event: "npm:install" },

  // Generic errors
  { pattern: /^Error:/im, event: "generic:error" },
  { pattern: /ENOENT|EACCES|EPERM/i, event: "fs:error" },
  { pattern: /Traceback \(most recent call last\)/i, event: "runtime:error" },
  { pattern: /panic:/i, event: "runtime:error" },
  { pattern: /segmentation fault/i, event: "runtime:error" },
];

export class PatternMatcher {
  private patterns: PatternRule[];
  private cooldowns = new Map<string, number>();
  private cooldownMs = 3000; // Don't fire same event within 3s

  constructor(customPatterns?: PatternRule[]) {
    this.patterns = customPatterns || DEFAULT_PATTERNS;
  }

  match(line: string): PatternMatch | null {
    const now = Date.now();

    for (const rule of this.patterns) {
      const m = line.match(rule.pattern);
      if (!m) continue;

      // Check cooldown
      const lastFired = this.cooldowns.get(rule.event);
      if (lastFired && now - lastFired < this.cooldownMs) continue;

      this.cooldowns.set(rule.event, now);

      const result: PatternMatch = {
        event: rule.event,
        match: m[0],
        groups: m.slice(1),
      };

      log("debug", `Pattern matched: ${rule.event}`, { line: line.slice(0, 80) });
      return result;
    }

    return null;
  }

  addPattern(rule: PatternRule): void {
    this.patterns.push(rule);
  }
}
