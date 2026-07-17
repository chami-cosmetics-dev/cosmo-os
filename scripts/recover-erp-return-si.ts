/**
 * Ops CLI: backfill Return SI ids from ERP for voided/returned orders.
 *
 *   npx tsx scripts/recover-erp-return-si.ts --company <companyId> [--dry-run] [--limit 25] [--order <orderId>]
 *
 * Uses active .env. Ask before running against production.
 */

import { recoverErpReturnSalesInvoiceIds } from "../lib/erp-return-si-recover";
import { prisma } from "../lib/prisma";

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  return process.argv[idx + 1]?.trim() || null;
}

async function main() {
  const companyId = argValue("--company");
  if (!companyId) {
    console.error("Usage: npx tsx scripts/recover-erp-return-si.ts --company <id> [--dry-run] [--limit N] [--order <orderId>]");
    process.exit(1);
  }
  const dryRun = process.argv.includes("--dry-run");
  const limitRaw = argValue("--limit");
  const limit = limitRaw ? parseInt(limitRaw, 10) : 25;
  const orderId = argValue("--order");

  const result = await recoverErpReturnSalesInvoiceIds({
    companyId,
    orderId,
    limit,
    dryRun,
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
