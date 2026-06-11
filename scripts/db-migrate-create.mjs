/**
 * Create a new migration from schema changes without `migrate dev` (shadow DB).
 *
 * Our history has no base init migration, so `prisma migrate dev` fails on P3006.
 * This diffs the live cosmo-dev DB → prisma/schema.prisma and writes a migration file.
 *
 * Usage:
 *   1. Edit prisma/schema.prisma
 *   2. npm run db:migrate:create -- add_my_column
 *   3. Review prisma/migrations/<timestamp>_add_my_column/migration.sql
 *   4. npm run db:deploy:all
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const nameArg = process.argv[2];
if (!nameArg?.trim()) {
  console.error("Usage: npm run db:migrate:create -- <migration_name>");
  console.error("Example: npm run db:migrate:create -- add_user_timezone");
  process.exit(1);
}

const slug = nameArg
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "");

const timestamp = new Date()
  .toISOString()
  .replace(/[-:TZ.]/g, "")
  .slice(0, 14);
const folder = `${timestamp}_${slug}`;
const migrationDir = resolve(root, "prisma/migrations", folder);
const migrationFile = resolve(migrationDir, "migration.sql");

config({ path: resolve(root, ".env.cosmo-dev"), override: true });

const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("Missing DIRECT_URL or DATABASE_URL in .env.cosmo-dev");
  process.exit(1);
}

console.error("[db:migrate:create] Diffing cosmo-dev DB → schema.prisma");
console.error(`[db:migrate:create] Using ${process.env.DIRECT_URL ? "DIRECT_URL" : "DATABASE_URL"}`);

const result = spawnSync(
  "npx",
  [
    "prisma",
    "migrate",
    "diff",
    "--from-url",
    dbUrl,
    "--to-schema-datamodel",
    "prisma/schema.prisma",
    "--script",
  ],
  { cwd: root, encoding: "utf8", shell: true },
);

if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}

const sql = (result.stdout ?? "").trim();
if (!sql) {
  console.error("No schema diff — prisma/schema.prisma matches the database.");
  process.exit(1);
}

mkdirSync(migrationDir, { recursive: true });
writeFileSync(migrationFile, `${sql}\n`, "utf8");

console.log(`Created migration: prisma/migrations/${folder}/migration.sql`);
console.log("");
console.log("Next steps:");
console.log("  1. Review the SQL");
console.log("  2. npm run db:deploy:cosmo-dev");
console.log("  3. npm run db:deploy:vault");
console.log("  4. npm run db:deploy:cosmo-prod  (or npm run db:deploy:all)");
