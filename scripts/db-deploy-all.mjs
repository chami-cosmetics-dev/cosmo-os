/**
 * Apply Prisma migrations to all three databases in order.
 * Prod requires typing "yes" to confirm.
 */

import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const withEnv = resolve(__dirname, "with-env.mjs");

const STEPS = [
  { target: "cosmo-dev", label: "Cosmo OS (dev)", confirm: false },
  { target: "vault", label: "Vault OS", confirm: false },
  { target: "cosmo-prod", label: "Cosmo OS (prod)", confirm: true },
];

function runDeploy(target) {
  console.log(`\n--- migrate deploy → ${target} ---\n`);
  const result = spawnSync(
    process.execPath,
    [withEnv, target, "npx", "prisma", "migrate", "deploy"],
    { stdio: "inherit", cwd: resolve(__dirname, "..") },
  );
  if (result.status !== 0) {
    console.error(`\nFailed on ${target}. Fix the issue before continuing.`);
    process.exit(result.status ?? 1);
  }
}

async function confirmProd() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolveAnswer) => {
    rl.question('Deploy to Cosmo OS PRODUCTION? Type "yes" to continue: ', resolveAnswer);
  });
  rl.close();
  if (answer.trim().toLowerCase() !== "yes") {
    console.log("Skipped cosmo-prod.");
    return false;
  }
  return true;
}

console.log("Applying migrations to all databases (same prisma/migrations folder).\n");

for (const step of STEPS) {
  if (step.confirm) {
    const ok = await confirmProd();
    if (!ok) continue;
  }
  runDeploy(step.target);
}

console.log("\nDone. Run `npx prisma migrate status` per target to verify if needed.");
