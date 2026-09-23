/**
 * Local dump entry: require --system, load that target env, run dump.sh.
 * Never defaults to cosmo-prod.
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function arg(name) {
  const i = process.argv.indexOf(name);
  if (i < 0 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

const system = arg("--system");
if (!system) {
  console.error("Usage: npm run backup:dump -- --system vault|cosmo-dev|cosmo-prod");
  console.error("Refusing to default to cosmo-prod.");
  process.exit(1);
}

const dump = resolve(root, "scripts/backup/dump.sh");
const result = spawnSync(
  process.execPath,
  [
    resolve(root, "scripts/with-env.mjs"),
    system,
    "bash",
    dump,
    "--system",
    system,
  ],
  { stdio: "inherit", cwd: root, env: process.env },
);

process.exit(result.status ?? 1);
