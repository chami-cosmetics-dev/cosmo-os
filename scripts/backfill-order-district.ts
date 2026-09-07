/**
 * Fill Order.district from shipping address when blank.
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-dev npx tsx scripts/backfill-order-district.ts
 *   node scripts/with-env.mjs cosmo-dev npx tsx scripts/backfill-order-district.ts --fix
 */

import { PrismaClient } from "@prisma/client";

import { storedDistrictFromAddress } from "../lib/address-district";

const shouldFix = process.argv.includes("--fix");
const BATCH = 200;

const rawUrl = process.env.DATABASE_URL ?? "";
const directUrl = rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2");
const dbUrl = new URL(directUrl || rawUrl);
dbUrl.searchParams.set("connect_timeout", "30");
const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl.toString() } },
});

async function main() {
  let scanned = 0;
  let wouldUpdate = 0;
  let updated = 0;
  let cursor: string | undefined;

  for (;;) {
    const rows = await prisma.order.findMany({
      where: { district: null },
      select: { id: true, shippingAddress: true },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]?.id;
    scanned += rows.length;

    const patches = rows
      .map((row) => ({ id: row.id, district: storedDistrictFromAddress(row.shippingAddress) }))
      .filter((row) => row.district);
    wouldUpdate += patches.length;

    if (shouldFix) {
      for (const patch of patches) {
        await prisma.order.update({
          where: { id: patch.id },
          data: { district: patch.district },
        });
        updated += 1;
      }
    }

    if (rows.length < BATCH) break;
  }

  console.log(
    JSON.stringify({ scanned, resolvable: wouldUpdate, updated, dryRun: !shouldFix }, null, 2),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
