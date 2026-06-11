/**
 * Activate an env target by copying it to .env (for Next.js dev server).
 *
 * Usage:
 *   node scripts/env-use.mjs              # interactive menu
 *   node scripts/env-use.mjs vault        # copy .env.vault → .env
 */

import { copyFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ENV_TARGETS, ENV_TARGET_KEYS } from "./env-targets.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function activate(target) {
  const entry = ENV_TARGETS[target];
  if (!entry) {
    console.error(`Unknown target: ${target}`);
    console.error(`Valid: ${ENV_TARGET_KEYS.join(", ")}`);
    process.exit(1);
  }

  const source = resolve(root, entry.file);
  const dest = resolve(root, ".env");

  if (!existsSync(source)) {
    console.error(`Missing ${entry.file}`);
    console.error(`Run: cp ${entry.example} ${entry.file}`);
    process.exit(1);
  }

  copyFileSync(source, dest);
  console.log(`Active env: ${entry.label}`);
  console.log(`Copied ${entry.file} → .env`);
  console.log("");
  console.log("Next steps:");
  console.log("  npm run dev              # start web app");
  console.log(`  npm run db:deploy:${target === "cosmo-prod" ? "cosmo-prod" : target}   # apply migrations`);
}

async function promptTarget() {
  console.log("Select environment:\n");
  ENV_TARGET_KEYS.forEach((key, i) => {
    const e = ENV_TARGETS[key];
    console.log(`  ${i + 1}) ${e.label}`);
    console.log(`     ${e.description}`);
  });
  console.log("");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolveAnswer) => {
    rl.question("Enter number or key [1]: ", resolveAnswer);
  });
  rl.close();

  const trimmed = answer.trim();
  if (!trimmed || trimmed === "1") return ENV_TARGET_KEYS[0];
  const num = parseInt(trimmed, 10);
  if (!Number.isNaN(num) && num >= 1 && num <= ENV_TARGET_KEYS.length) {
    return ENV_TARGET_KEYS[num - 1];
  }
  if (ENV_TARGETS[trimmed]) return trimmed;
  console.error("Invalid choice.");
  process.exit(1);
}

const arg = process.argv[2];
activate(arg ?? (await promptTarget()));
