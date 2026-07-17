/**
 * One-time backfill: copy legacy rawPayload.erpReturnSalesInvoiceNames → Order.erpReturnSalesInvoiceIds.
 *
 * Usage (after migration deployed):
 *   npx tsx scripts/backfill-erp-return-si-ids.ts
 *   npx tsx scripts/backfill-erp-return-si-ids.ts --dry-run
 *
 * Uses active .env (npm run env:use <target>). Ask before prod.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  combineErpReturnSalesInvoiceIds,
  readLegacyErpReturnSalesInvoiceNames,
} from "../lib/erp-return-si";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const rows = await prisma.$queryRaw<
    Array<{ id: string; erpReturnSalesInvoiceIds: string[]; rawPayload: unknown }>
  >(Prisma.sql`
    SELECT id, "erpReturnSalesInvoiceIds", "rawPayload"
    FROM "Order"
    WHERE "rawPayload" IS NOT NULL
      AND jsonb_typeof("rawPayload"->'erpReturnSalesInvoiceNames') = 'array'
      AND jsonb_array_length("rawPayload"->'erpReturnSalesInvoiceNames') > 0
  `);

  let updated = 0;
  for (const row of rows) {
    const legacy = readLegacyErpReturnSalesInvoiceNames(row.rawPayload);
    if (legacy.length === 0) continue;
    const merged = combineErpReturnSalesInvoiceIds(row.erpReturnSalesInvoiceIds, row.rawPayload);
    if (merged.length === (row.erpReturnSalesInvoiceIds?.length ?? 0) &&
        merged.every((id, i) => id === row.erpReturnSalesInvoiceIds[i])) {
      continue;
    }
    if (dryRun) {
      console.log(`[dry-run] ${row.id}: ${merged.join(", ")}`);
      updated += 1;
      continue;
    }
    await prisma.order.update({
      where: { id: row.id },
      data: { erpReturnSalesInvoiceIds: merged },
    });
    updated += 1;
  }

  console.log(`${dryRun ? "Would update" : "Updated"} ${updated} order(s) (scanned ${rows.length})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
