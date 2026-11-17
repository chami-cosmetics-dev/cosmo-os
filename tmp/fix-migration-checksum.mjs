import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const name = "20261117064618_add_loyalty_sms_templates";
const sql = readFileSync(
  `prisma/migrations/${name}/migration.sql`,
);
const checksum = createHash("sha256").update(sql).digest("hex");
const prisma = new PrismaClient();

const updated = await prisma.$executeRawUnsafe(
  `UPDATE "_prisma_migrations" SET checksum = $1 WHERE migration_name = $2`,
  checksum,
  name,
);
console.log({ updated, checksum });
await prisma.$disconnect();
