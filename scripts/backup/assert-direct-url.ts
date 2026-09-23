import { assertDirectDatabaseUrl } from "../../lib/backup/db-url";

const url = process.env.DIRECT_URL ?? process.env.BACKUP_DIRECT_URL ?? "";
if (!url) {
  console.error("DIRECT_URL (or BACKUP_DIRECT_URL) is required");
  process.exit(1);
}
try {
  assertDirectDatabaseUrl(url);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
