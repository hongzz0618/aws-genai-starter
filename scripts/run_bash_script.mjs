import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const [, , scriptPath, ...scriptArgs] = process.argv;

if (!scriptPath) {
  console.error("Usage: node scripts/run_bash_script.mjs <script> [args...]");
  process.exit(1);
}

const windowsBashCandidates = [
  process.env.BASH,
  "C:\\Program Files\\Git\\bin\\bash.exe",
  "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
  "bash",
];

const posixBashCandidates = [
  process.env.BASH,
  "bash",
];

const bashCandidates = (process.platform === "win32"
  ? windowsBashCandidates
  : posixBashCandidates).filter(Boolean);

let lastError;
for (const bashPath of bashCandidates) {
  if (bashPath.includes("\\") && !existsSync(bashPath)) {
    continue;
  }

  const result = spawnSync(bashPath, [scriptPath, ...scriptArgs], {
    stdio: "inherit",
    shell: false,
  });

  if (!result.error) {
    process.exit(result.status ?? 1);
  }

  lastError = result.error;
}

console.error(`Unable to run ${scriptPath}: ${lastError?.message ?? "bash not found"}`);
process.exit(1);
