import { defineConfig } from "tsup";
import { cpSync } from "fs";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: false,
    sourcemap: true,
    clean: true,
    target: "node18",
    splitting: false,
    external: ["ink", "react", "ink-text-input"],
  },
  {
    entry: ["bin/devbuddy.ts"],
    format: ["esm"],
    sourcemap: true,
    target: "node18",
    splitting: false,
    banner: {
      js: "#!/usr/bin/env node",
    },
    external: ["ink", "react", "ink-text-input"],
    onSuccess: async () => {
      cpSync("src/hooks", "dist/hooks", { recursive: true });
    },
  },
]);
