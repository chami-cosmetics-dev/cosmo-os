import { parseProtectedSystem, systemFromObjectKey } from "../../lib/backup/object-key";
import {
  assertDirectDatabaseUrl,
  isCrossProductLiveTarget,
  isLiveTarget,
} from "../../lib/backup/db-url";

const system = parseProtectedSystem(process.env.BACKUP_SYSTEM ?? "");
const target = process.env.TARGET_DIRECT_URL ?? "";
const objectKey = process.env.BACKUP_OBJECT_KEY ?? "";

if (!target) {
  console.error("--target-direct-url is required");
  process.exit(1);
}

try {
  assertDirectDatabaseUrl(target);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

if (objectKey) {
  try {
    const fromKey = systemFromObjectKey(objectKey);
    if (fromKey !== system) {
      console.error(
        `Object key system (${fromKey}) does not match --system (${system})`,
      );
      process.exit(1);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

if (isCrossProductLiveTarget(system, target)) {
  console.error(
    "Refusing to restore this product's copy onto the other product's live host",
  );
  process.exit(2);
}

if (isLiveTarget(system, target)) {
  const confirm = process.env.CONFIRM_PRODUCTION_RESTORE ?? "";
  if (confirm !== system) {
    console.error(
      `Live ${system} restore requires CONFIRM_PRODUCTION_RESTORE=${system} for this process only`,
    );
    process.exit(2);
  }
}
