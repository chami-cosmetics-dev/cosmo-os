/**
 * Match historical GRN SSR rows to historical PR rows inside the backfill tables.
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-prod node scripts/match-grn-backfill-history.mjs --dry-run
 *   node scripts/with-env.mjs cosmo-prod node scripts/match-grn-backfill-history.mjs
 *   node scripts/with-env.mjs cosmo-prod node scripts/match-grn-backfill-history.mjs --min=90
 */

import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

const envFile =
  process.argv.find((arg) => arg.endsWith(".env") || arg.startsWith(".env.")) ?? ".env.cosmo-prod";
config({ path: envFile });

const args = process.argv.slice(2).filter((arg) => !arg.endsWith(".env") && !arg.startsWith(".env."));
const dryRun = args.includes("--dry-run");
const minPercentage = Number(argValue("--min=") ?? "100");
const windowHours = Number(argValue("--window-hours=") ?? "24");
const includeLiveSsr = !args.includes("--backfill-only");

const rawUrl = process.env.DATABASE_URL ?? "";
const prisma = new PrismaClient({
  datasources: {
    db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl },
  },
});

function argValue(prefix) {
  const arg = args.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function normalizeSupplier(value) {
  return value?.trim().toLowerCase() ?? "";
}

function normalizeItemCode(value) {
  return value.trim().toUpperCase();
}

function addQty(map, itemCode, qty) {
  if (!itemCode) return;
  const key = normalizeItemCode(itemCode);
  map.set(key, (map.get(key) ?? 0) + Number(qty ?? 0));
}

function matchPercentage(prItems, ssrItems) {
  const prTotals = new Map();
  const ssrTotals = new Map();
  for (const item of prItems) addQty(prTotals, item.itemCode, item.stockQty ?? item.qty);
  for (const item of ssrItems) addQty(ssrTotals, item.itemCode, item.qty);

  const codes = new Set([...prTotals.keys(), ...ssrTotals.keys()]);
  let matchedQty = 0;
  let totalQty = 0;
  for (const code of codes) {
    const prQty = prTotals.get(code) ?? 0;
    const ssrQty = ssrTotals.get(code) ?? 0;
    matchedQty += Math.min(prQty, ssrQty);
    totalQty += Math.max(prQty, ssrQty);
  }
  if (totalQty <= 0) return 0;
  return Math.round((matchedQty / totalQty) * 10000) / 100;
}

function isWithinWindow(pr, ssr) {
  if (pr.postingDate && ssr.returnDate) {
    return pr.postingDate.toISOString().slice(0, 10) === ssr.returnDate.toISOString().slice(0, 10);
  }
  if (!pr.creation || !ssr.creation) return false;
  return Math.abs(pr.creation.getTime() - ssr.creation.getTime()) <= windowHours * 60 * 60 * 1000;
}

function isCancelled(row, amendedNames) {
  const status = row.status?.trim().toLowerCase();
  return row.docstatus === 2 || status === "cancelled" || status === "canceled" || amendedNames.has(row.name);
}

async function main() {
  console.log(
    `[grn-backfill-match] dryRun=${dryRun} min=${minPercentage}% windowHours=${windowHours} includeLiveSsr=${includeLiveSsr}`,
  );

  const supplierPrefixLocations = await prisma.companyLocation.findMany({
    where: { supplierPrefix: { not: null } },
    select: {
      id: true,
      companyId: true,
      name: true,
      supplierPrefix: true,
    },
    orderBy: { name: "asc" },
  });
  const rules = supplierPrefixLocations
    .map((location) => ({
      locationId: location.id,
      companyId: location.companyId,
      label: location.name,
      key: normalizeSupplier(location.supplierPrefix),
    }))
    .filter((rule) => rule.key.length > 0);

  if (rules.length === 0) {
    console.log("No supplier prefixes configured; nothing to match.");
    return;
  }

  const [prs, backfillSsrs, liveSsrs] = await Promise.all([
    prisma.grnBackfillPurchaseReceipt.findMany({
      include: { items: true },
      orderBy: [{ creation: "asc" }, { createdAt: "asc" }],
    }),
    prisma.grnBackfillSupplierStockReturn.findMany({
      where: { purchaseReceiptName: null },
      include: { items: true },
      orderBy: [{ creation: "asc" }, { createdAt: "asc" }],
    }),
    includeLiveSsr
      ? prisma.grnSupplierStockReturn.findMany({
          where: { purchaseReceiptName: null },
          include: { items: true },
          orderBy: [{ creation: "asc" }, { createdAt: "asc" }],
        })
      : Promise.resolve([]),
  ]);
  const ssrs = [
    ...backfillSsrs.map((row) => ({ ...row, source: "backfill" })),
    ...liveSsrs.map((row) => ({ ...row, source: "live" })),
  ];

  const amendedPrNames = new Set(prs.map((row) => row.amendedFrom).filter(Boolean));
  const usedPrNames = new Set(
    [
      ...(await prisma.grnBackfillSupplierStockReturn.findMany({
        where: { docstatus: 1, purchaseReceiptName: { not: null } },
        select: { purchaseReceiptName: true },
      })),
      ...(await prisma.grnSupplierStockReturn.findMany({
        where: { docstatus: 1, purchaseReceiptName: { not: null } },
        select: { purchaseReceiptName: true },
      })),
    ]
      .map((row) => row.purchaseReceiptName)
      .filter(Boolean),
  );

  const activePrs = prs.filter((row) => !isCancelled(row, amendedPrNames));
  const candidateMatches = new Map();
  const claimCountByPr = new Map();
  for (const ssr of ssrs) {
    if (ssr.docstatus !== 1) continue;
    const values = [normalizeSupplier(ssr.supplier), normalizeSupplier(ssr.supplierName)].filter(Boolean);
    const rule = rules.find((candidate) => values.some((value) => value.includes(candidate.key)));
    if (!rule) continue;
    const candidates = activePrs
      .filter(
        (pr) =>
          pr.companyId === ssr.companyId &&
          pr.companyLocationId === rule.locationId &&
          !usedPrNames.has(pr.name) &&
          isWithinWindow(pr, ssr),
      )
      .map((pr) => ({
        pr,
        percentage: matchPercentage(pr.items, ssr.items),
      }))
      .filter((candidate) => candidate.percentage >= minPercentage)
      .sort((a, b) => b.percentage - a.percentage || a.pr.name.localeCompare(b.pr.name));
    if (candidates.length === 0) continue;
    candidateMatches.set(ssr.id, candidates);
    for (const candidate of candidates) {
      claimCountByPr.set(candidate.pr.name, (claimCountByPr.get(candidate.pr.name) ?? 0) + 1);
    }
  }
  let matched = 0;
  let skipped = 0;

  for (const ssr of ssrs) {
    if (ssr.docstatus !== 1) {
      skipped++;
      continue;
    }
    const candidates = candidateMatches.get(ssr.id) ?? [];
    if (candidates.length === 0) {
      skipped++;
      continue;
    }
    const hasConflict =
      candidates.length > 1 ||
      candidates.some((candidate) => (claimCountByPr.get(candidate.pr.name) ?? 0) > 1);
    if (hasConflict) {
      skipped++;
      console.log(`  CONFLICT ${ssr.name}: ${candidates.map((candidate) => candidate.pr.name).join(", ")}`);
      continue;
    }
    const best = candidates[0];

    matched++;
    usedPrNames.add(best.pr.name);
    console.log(`  ${ssr.name} -> ${best.pr.name} (${best.percentage.toFixed(2)}%)`);
    if (!dryRun) {
      await prisma.grnBackfillSupplierStockReturn.updateMany({
        where: {
          purchaseReceiptName: best.pr.name,
          docstatus: { not: 1 },
        },
        data: { purchaseReceiptName: null },
      });
      await prisma.grnSupplierStockReturn.updateMany({
        where: {
          purchaseReceiptName: best.pr.name,
          docstatus: { not: 1 },
        },
        data: { purchaseReceiptName: null },
      });
      if (ssr.source === "live") {
        await prisma.grnSupplierStockReturn.update({
          where: { id: ssr.id },
          data: { purchaseReceiptName: best.pr.name },
        });
      } else {
        await prisma.grnBackfillSupplierStockReturn.update({
          where: { id: ssr.id },
          data: { purchaseReceiptName: best.pr.name },
        });
      }
    }
  }

  console.log(
    `[grn-backfill-match] done matched=${matched} skipped=${skipped}${dryRun ? " (dry run)" : ""}`,
  );
}

main()
  .catch((error) => {
    console.error("[grn-backfill-match] fatal:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
