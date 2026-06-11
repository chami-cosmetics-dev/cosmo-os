/**
 * Run a command with env vars loaded from a target file (.env.vault, etc.)
 *
 * Usage: node scripts/with-env.mjs <vault|cosmo-dev|cosmo-prod> <command...>
 * Example: node scripts/with-env.mjs vault npx prisma migrate deploy
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";

import { ENV_TARGETS } from "./env-targets.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const target = process.argv[2];
const cmdArgs = process.argv.slice(3);

if (!target || !ENV_TARGETS[target]) {
  console.error("Usage: node scripts/with-env.mjs <target> <command...>");
  console.error("");
  console.error("Targets:");
  for (const [key, entry] of Object.entries(ENV_TARGETS)) {
    console.error(`  ${key.padEnd(12)} ${entry.label} (${entry.file})`);
  }
  process.exit(1);
}

if (cmdArgs.length === 0) {
  console.error("Error: missing command to run.");
  process.exit(1);
}

const entry = ENV_TARGETS[target];
const envPath = resolve(root, entry.file);

if (!existsSync(envPath)) {
  console.error(`Missing ${entry.file}`);
  console.error(`Copy ${entry.example} → ${entry.file} and fill in credentials.`);
  process.exit(1);
}

config({ path: envPath, override: true });
console.error(`[env] ${entry.label} ← ${entry.file}`);

const result = spawnSync(cmdArgs[0], cmdArgs.slice(1), {
  stdio: "inherit",
  env: process.env,
  shell: true,
  cwd: root,
});

process.exit(result.status ?? 1);
