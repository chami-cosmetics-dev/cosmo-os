/**
 * One-time backfill: copy vendorId onto ProductItems that are missing vendor
 * when another catalog row for the same company + SKU already has vendor set.
 *
 * Usage (uses active .env — npm run env:use <target> first; ask before prod):
 *   npx tsx scripts/backfill-product-item-vendors-from-sku.ts --dry-run
 *   npx tsx scripts/backfill-product-item-vendors-from-sku.ts
 *   npx tsx scripts/backfill-product-item-vendors-from-sku.ts --companyId=clxxxxxxxx
 *   npx tsx scripts/backfill-product-item-vendors-from-sku.ts --limit=500
 */

import { PrismaClient } from "@prisma/client";

const BATCH_SIZE = 200;

const rawUrl = process.env.DATABASE_URL ?? "";
const directUrl = rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2");
const prisma = new PrismaClient({
  datasources: { db: { url: directUrl || rawUrl } },
});

function argValue(prefix: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function skuKey(companyId: string, sku: string) {
  return `${companyId}|${sku.trim().toLowerCase()}`;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const companyId = argValue("--companyId=");
  const limitRaw = argValue("--limit=");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
  if (limitRaw && (!Number.isFinite(limit) || limit! <= 0)) {
    throw new Error(`Invalid --limit value: ${limitRaw}`);
  }

  console.log(
    `[backfill-product-item-vendors-from-sku] dry-run=${dryRun}` +
      (companyId ? ` companyId=${companyId}` : "") +
      (limit ? ` limit=${limit}` : ""),
  );

  const vendorSourceRows = await prisma.productItem.findMany({
    where: {
      ...(companyId ? { companyId } : {}),
      vendorId: { not: null },
      sku: { not: null },
    },
    select: {
      companyId: true,
      sku: true,
      vendorId: true,
      updatedAt: true,
      vendor: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const vendorByCompanySku = new Map<string, { vendorId: string; vendorName: string }>();
  const vendorIdsByCompanySku = new Map<string, Set<string>>();

  for (const row of vendorSourceRows) {
    const sku = row.sku?.trim();
    if (!sku || !row.vendorId) continue;

    const key = skuKey(row.companyId, sku);
    if (!vendorIdsByCompanySku.has(key)) vendorIdsByCompanySku.set(key, new Set());
    vendorIdsByCompanySku.get(key)!.add(row.vendorId);

    if (!vendorByCompanySku.has(key)) {
      vendorByCompanySku.set(key, {
        vendorId: row.vendorId,
        vendorName: row.vendor?.name?.trim() || row.vendorId,
      });
    }
  }

  const conflictCount = [...vendorIdsByCompanySku.values()].filter((ids) => ids.size > 1).length;
  if (conflictCount > 0) {
    console.log(
      `Note: ${conflictCount} company+SKU pair(s) have multiple vendors in catalog; using most recently updated vendor.`,
    );
  }

  const missingVendorRows = await prisma.productItem.findMany({
    where: {
      ...(companyId ? { companyId } : {}),
      vendorId: null,
      sku: { not: null },
    },
    select: {
      id: true,
      companyId: true,
      sku: true,
      productTitle: true,
      variantTitle: true,
    },
    orderBy: { updatedAt: "desc" },
    ...(limit ? { take: limit } : {}),
  });

  const updates: Array<{
    id: string;
    sku: string;
    vendorId: string;
    vendorName: string;
    productTitle: string;
  }> = [];

  for (const row of missingVendorRows) {
    const sku = row.sku?.trim();
    if (!sku) continue;

    const match = vendorByCompanySku.get(skuKey(row.companyId, sku));
    if (!match) continue;

    updates.push({
      id: row.id,
      sku,
      vendorId: match.vendorId,
      vendorName: match.vendorName,
      productTitle: row.variantTitle
        ? `${row.productTitle} — ${row.variantTitle}`
        : row.productTitle,
    });
  }

  const unmatched = missingVendorRows.length - updates.length;
  console.log(
    `Missing vendor: ${missingVendorRows.length} item(s); can backfill from SKU match: ${updates.length}; still unmatched: ${unmatched}`,
  );

  if (updates.length === 0) {
    return;
  }

  if (dryRun) {
    for (const row of updates.slice(0, 25)) {
      console.log(`  [dry-run] ${row.sku} → ${row.vendorName} (${row.productTitle})`);
    }
    if (updates.length > 25) {
      console.log(`  … and ${updates.length - 25} more`);
    }
    console.log(`Would update ${updates.length} product item(s)`);
    return;
  }

  let updated = 0;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    await prisma.$transaction(
      batch.map((row) =>
        prisma.productItem.update({
          where: { id: row.id, vendorId: null },
          data: { vendorId: row.vendorId },
        }),
      ),
    );
    updated += batch.length;
    console.log(`Updated ${updated}/${updates.length}…`);
  }

  console.log(`Done — updated ${updated} product item(s) with vendor from SKU match`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
