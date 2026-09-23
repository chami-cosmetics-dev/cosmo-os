import { spawnSync } from "node:child_process";

import { PROTECTED_SYSTEMS, statusObjectKey, type ProtectedSystem } from "../../lib/backup/object-key";
import { hoursSinceSuccess, isOverdue, parseBackupStatus, type BackupStatus } from "../../lib/backup/status";

function r2Required(): { bucket: string; endpoint: string } {
  const bucket = process.env.R2_BUCKET;
  const endpoint = process.env.R2_ENDPOINT;
  const id = process.env.R2_ACCESS_KEY_ID;
  const secret = process.env.R2_SECRET_ACCESS_KEY;
  if (!bucket || !endpoint || !id || !secret) {
    console.error("R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY are required");
    process.exit(1);
  }
  return { bucket, endpoint };
}

function fetchStatus(system: ProtectedSystem): BackupStatus | null {
  const { bucket, endpoint } = r2Required();
  const key = statusObjectKey(system);
  const result = spawnSync(
    "aws",
    ["--endpoint-url", endpoint, "s3", "cp", `s3://${bucket}/${key}`, "-"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        AWS_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
        AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION ?? "auto",
      },
    },
  );
  if (result.status !== 0) {
    return null;
  }
  try {
    return parseBackupStatus(JSON.parse(result.stdout));
  } catch {
    return null;
  }
}

function line(system: ProtectedSystem, status: BackupStatus | null): string {
  if (!status) {
    return `${system.padEnd(12)} MISSING   lastSuccess=never  overdue=yes`;
  }
  const hours = hoursSinceSuccess(status);
  const age =
    hours == null ? "never" : `${hours.toFixed(1)}h ago`;
  const overdue = isOverdue(status) ? "yes" : "no";
  const ok = status.ok ? "ok" : "FAIL";
  return `${system.padEnd(12)} ${ok.padEnd(8)} lastSuccess=${age.padEnd(12)} overdue=${overdue}  ${status.objectKey ?? ""}`;
}

const now = new Date();
let anyOverdue = false;
for (const system of PROTECTED_SYSTEMS) {
  const status = fetchStatus(system);
  if (!status || isOverdue(status, now)) anyOverdue = true;
  console.log(line(system, status));
}

if (anyOverdue) {
  process.exitCode = 2;
}
