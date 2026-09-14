import { readFileSync, writeFileSync } from "node:fs";

import { parseProtectedSystem } from "../../lib/backup/object-key";
import { mergeStatus, parseBackupStatus } from "../../lib/backup/status";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i < 0 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

const system = parseProtectedSystem(arg("--system") ?? "");
const existingPath = arg("--existing");
const outPath = arg("--out");
const ok = arg("--ok") === "true";
const error = arg("--error") ?? null;
const objectKey = arg("--object-key") ?? null;
const bytesRaw = arg("--bytes");
const bytes = bytesRaw != null && bytesRaw !== "" ? Number(bytesRaw) : null;

let existing = null;
if (existingPath) {
  try {
    existing = parseBackupStatus(JSON.parse(readFileSync(existingPath, "utf8")));
  } catch {
    existing = null;
  }
}

const merged = mergeStatus(existing, {
  system,
  attemptedAt: new Date(),
  ok,
  error,
  objectKey,
  bytes: Number.isFinite(bytes) ? bytes : null,
});

const json = `${JSON.stringify(merged, null, 2)}\n`;
if (outPath) {
  writeFileSync(outPath, json, "utf8");
} else {
  process.stdout.write(json);
}
