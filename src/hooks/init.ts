import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export type ShellType = "bash" | "zsh" | "fish" | "powershell";

const HOOK_FILES: Record<ShellType, string> = {
  bash: "bash.sh",
  zsh: "zsh.sh",
  fish: "fish.fish",
  powershell: "powershell.ps1",
};

export function getHookScript(shell: ShellType): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const file = HOOK_FILES[shell];

  // Search multiple possible locations:
  // - dev mode (tsx): src/hooks/ relative to this file in src/hooks/
  // - built (tsup): dist/hooks/ adjacent to bundled code
  // - npm global install: various relative paths from the bundled CLI
  const candidates = [
    path.resolve(__dirname, file),                        // same directory (dev mode, this file IS in hooks/)
    path.resolve(__dirname, "../hooks", file),             // sibling hooks/ from src/hooks/init.ts
    path.resolve(__dirname, "../../src/hooks", file),      // from dist/ up to project root
    path.resolve(__dirname, "../../dist/hooks", file),     // from dist/ to dist/hooks/
    path.resolve(__dirname, "../src/hooks", file),         // from dist/bin/ to src/hooks/
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, "utf-8");
    }
  }

  throw new Error(
    `Hook script for ${shell} not found. Searched:\n${candidates.join("\n")}`,
  );
}

export function detectShell(): ShellType {
  // Check PowerShell first (Windows default)
  if (process.env.PSModulePath || process.env.PSVersionTable) {
    return "powershell";
  }

  const shell = process.env.SHELL || "";

  if (shell.includes("zsh")) return "zsh";
  if (shell.includes("fish")) return "fish";
  if (shell.includes("bash")) return "bash";

  // Windows fallback
  if (process.platform === "win32") return "powershell";

  return "bash";
}

export function getShellConfigPath(shell: ShellType): string {
  const home = process.env.HOME || process.env.USERPROFILE || "";

  switch (shell) {
    case "bash":
      // Prefer .bashrc, fall back to .bash_profile
      const bashrc = path.join(home, ".bashrc");
      if (fs.existsSync(bashrc)) return bashrc;
      return path.join(home, ".bash_profile");

    case "zsh":
      return path.join(home, ".zshrc");

    case "fish":
      return path.join(
        process.env.XDG_CONFIG_HOME || path.join(home, ".config"),
        "fish",
        "config.fish",
      );

    case "powershell": {
      const docs =
        process.env.USERPROFILE
          ? path.join(process.env.USERPROFILE, "Documents")
          : home;
      const psCorePath = path.join(docs, "PowerShell", "Microsoft.PowerShell_profile.ps1");
      const winPsPath = path.join(docs, "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1");

      // Return the profile matching the running PowerShell version.
      // PSEdition is "Core" for pwsh 7+ and "Desktop" for Windows PowerShell 5.x.
      // When called from Node (not inside PS), fall back to Core.
      if (process.env.PSEdition === "Desktop" || (!process.env.PSEdition && fs.existsSync(winPsPath) && !fs.existsSync(psCorePath))) {
        return winPsPath;
      }
      return psCorePath;
    }
  }
}

export function getInitLine(shell: ShellType): string {
  switch (shell) {
    case "bash":
      return 'eval "$(devbuddy hook init bash)" # devbuddy-managed';
    case "zsh":
      return 'eval "$(devbuddy hook init zsh)" # devbuddy-managed';
    case "fish":
      return "devbuddy hook init fish | source # devbuddy-managed";
    case "powershell":
      return 'Invoke-Expression (& devbuddy hook init powershell | Out-String) # devbuddy-managed';
  }
}

const MARKER = "# devbuddy-managed";

function getAllPowerShellProfiles(): string[] {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const docs = process.env.USERPROFILE
    ? path.join(process.env.USERPROFILE, "Documents")
    : home;
  return [
    path.join(docs, "PowerShell", "Microsoft.PowerShell_profile.ps1"),
    path.join(docs, "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1"),
  ];
}

function installToProfile(configPath: string, initLine: string): boolean {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, "utf-8");
    if (content.includes(MARKER)) return false;
    fs.appendFileSync(configPath, `\n${initLine}\n`);
  } else {
    fs.writeFileSync(configPath, `${initLine}\n`);
  }
  return true;
}

function uninstallFromProfile(configPath: string): boolean {
  if (!fs.existsSync(configPath)) return false;
  const content = fs.readFileSync(configPath, "utf-8");
  if (!content.includes(MARKER)) return false;
  const lines = content.split("\n");
  const filtered = lines.filter((line) => !line.includes(MARKER));
  while (filtered.length > 0 && filtered[filtered.length - 1].trim() === "") {
    filtered.pop();
  }
  fs.writeFileSync(configPath, filtered.join("\n") + "\n");
  return true;
}

export function isHookInstalled(shell: ShellType): boolean {
  if (shell === "powershell") {
    return getAllPowerShellProfiles().every(
      (p) => fs.existsSync(p) && fs.readFileSync(p, "utf-8").includes(MARKER),
    );
  }
  const configPath = getShellConfigPath(shell);
  if (!fs.existsSync(configPath)) return false;
  return fs.readFileSync(configPath, "utf-8").includes(MARKER);
}

export function installHook(shell: ShellType): string {
  const initLine = getInitLine(shell);

  if (shell === "powershell") {
    const profiles = getAllPowerShellProfiles();
    const installed: string[] = [];
    for (const p of profiles) {
      if (installToProfile(p, initLine)) installed.push(p);
    }
    if (installed.length === 0) return `Hook already installed in all PowerShell profiles`;
    return installed.join(", ");
  }

  const configPath = getShellConfigPath(shell);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, "utf-8");
    if (content.includes(MARKER)) {
      return `Hook already installed in ${configPath}`;
    }
    fs.appendFileSync(configPath, `\n${initLine}\n`);
  } else {
    fs.writeFileSync(configPath, `${initLine}\n`);
  }
  return configPath;
}

export function uninstallHook(shell: ShellType): string {
  if (shell === "powershell") {
    const profiles = getAllPowerShellProfiles();
    const removed: string[] = [];
    for (const p of profiles) {
      if (uninstallFromProfile(p)) removed.push(p);
    }
    if (removed.length === 0) return "No hook found to remove.";
    return removed.join(", ");
  }

  const configPath = getShellConfigPath(shell);
  if (!fs.existsSync(configPath)) {
    return `Config file not found: ${configPath}`;
  }
  const content = fs.readFileSync(configPath, "utf-8");
  const lines = content.split("\n");
  const filtered = lines.filter((line) => !line.includes(MARKER));
  while (filtered.length > 0 && filtered[filtered.length - 1].trim() === "") {
    filtered.pop();
  }
  fs.writeFileSync(configPath, filtered.join("\n") + "\n");
  return configPath;
}
