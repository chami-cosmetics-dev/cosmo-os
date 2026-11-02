/**
 * Store the posted valuation of legacy Supplier Stock Returns that were sent
 * through a linked Material Issue Stock Entry, rather than a PI return.
 *
 * The record is keyed by (company, SSR name, source kind). Re-running the
 * script updates that single record and replaces its child item snapshot, so
 * it never creates duplicate legacy valuation rows.
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-prod node scripts/backfill-grn-legacy-material-issues.mjs --target=cosmo-prod --dry-run
 *   node scripts/with-env.mjs vault node scripts/backfill-grn-legacy-material-issues.mjs --target=vault --dry-run
 *   node scripts/with-env.mjs <cosmo-prod|vault> node scripts/backfill-grn-legacy-material-issues.mjs --target=<cosmo-prod|vault>
 */

import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

const envFile =
  process.argv.find((arg) => arg.endsWith(".env") || arg.startsWith(".env.")) ?? ".env.cosmo-prod";
config({ path: envFile });

const args = process.argv.slice(2).filter((arg) => !arg.endsWith(".env") && !arg.startsWith(".env."));
const dryRun = args.includes("--dry-run");
const verbose = args.includes("--verbose");
const refresh = args.includes("--refresh");
const target = argValue("--target=");
const requestedSsr = argValue("--ssr=")?.trim() || null;
const limit = numberArg("--limit=");
const delayMs = numberArg("--delay-ms=") ?? 100;

if (target !== "cosmo-prod" && target !== "vault") {
  console.error("Refusing to run without --target=cosmo-prod or --target=vault.");
  process.exit(1);
}

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

function numberArg(prefix) {
  const value = argValue(prefix);
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function payloadRecord(rawPayload) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return {};
  const top = rawPayload;
  return top.data && typeof top.data === "object" && !Array.isArray(top.data) ? top.data : top;
}

function text(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function number(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function abs(value) {
  return value == null ? null : Math.abs(value);
}

function date(value) {
  if (!value) return null;
  const parsed = new Date(String(value).includes("T") ? value : `${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function materialIssueRate(item) {
  const qty = abs(number(item.qty));
  const amount = abs(number(item.amount) ?? number(item.basic_amount));
  if (qty && amount != null) return amount / qty;
  return abs(number(item.basic_rate)) ?? abs(number(item.valuation_rate));
}

async function erpGet(instance, path) {
  const baseUrl = instance.baseUrl.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `token ${instance.apiKey}:${instance.apiSecret}` },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`ERP GET ${path} failed [${response.status}]: ${body.slice(0, 300)}`);
  }
  const json = await response.json();
  return json.data ?? null;
}

async function main() {
  const [instances, locations, liveSsr, backfillSsr, existingIssues] = await Promise.all([
    prisma.erpnextInstance.findMany({
      select: { id: true, label: true, baseUrl: true, apiKey: true, apiSecret: true },
    }),
    prisma.companyLocation.findMany({
      where: { erpnextCompany: { not: null }, erpnextInstanceId: { not: null } },
      select: { companyId: true, erpnextCompany: true, erpnextInstanceId: true },
    }),
    prisma.grnSupplierStockReturn.findMany({
      where: { deletedAt: null, docstatus: { not: 2 }, ...(requestedSsr ? { name: requestedSsr } : {}) },
      select: { companyId: true, name: true, rawPayload: true },
    }),
    prisma.grnBackfillSupplierStockReturn.findMany({
      where: { deletedAt: null, docstatus: { not: 2 }, ...(requestedSsr ? { name: requestedSsr } : {}) },
      select: { companyId: true, name: true, rawPayload: true },
    }),
    prisma.grnSupplierStockReturnMaterialIssueLink.findMany({
      select: { companyId: true, supplierStockReturnName: true, supplierStockReturnIsBackfill: true },
    }),
  ]);

  const instanceById = new Map(instances.map((instance) => [instance.id, instance]));
  const instanceForCompany = new Map(
    locations.map((location) => [
      `${location.companyId}:${location.erpnextCompany}`,
      location.erpnextInstanceId ? instanceById.get(location.erpnextInstanceId) ?? null : null,
    ]),
  );
  const existingKeys = new Set(
    existingIssues.map(
      (issue) => `${issue.companyId}:${issue.supplierStockReturnName}:${issue.supplierStockReturnIsBackfill}`,
    ),
  );

  const allCandidates = [
    ...liveSsr.map((ssr) => ({ ...ssr, isBackfill: false })),
    ...backfillSsr.map((ssr) => ({ ...ssr, isBackfill: true })),
  ]
    .map((ssr) => {
      const payload = payloadRecord(ssr.rawPayload);
      return {
        ...ssr,
        erpCompany: text(payload.company),
        stockEntryName: text(payload.stock_entry),
      };
    })
    .filter((ssr) => ssr.stockEntryName && ssr.erpCompany)
    .sort((a, b) => a.name.localeCompare(b.name));
  const candidates = refresh
    ? allCandidates
    : allCandidates.filter(
        (ssr) => !existingKeys.has(`${ssr.companyId}:${ssr.name}:${ssr.isBackfill}`),
      );
  const selected = limit ? candidates.slice(0, limit) : candidates;

  console.log(
    `Found ${allCandidates.length} active SSRs with a linked Stock Entry; ${candidates.length} require processing` +
      (limit && candidates.length > selected.length ? `; limiting to ${selected.length}` : "") +
      ".",
  );

  const stockEntryCache = new Map();
  const persistedMaterialIssueIds = new Map();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const [index, ssr] of selected.entries()) {
    const instance = instanceForCompany.get(`${ssr.companyId}:${ssr.erpCompany}`);
    if (!instance?.baseUrl || !instance.apiKey || !instance.apiSecret) {
      console.warn(`SKIP ${ssr.name}: no ERP instance configured for ${ssr.erpCompany}`);
      skipped += 1;
      continue;
    }

    const cacheKey = `${instance.id}:${ssr.stockEntryName}`;
    try {
      let stockEntry = stockEntryCache.get(cacheKey);
      if (!stockEntry) {
        stockEntry = await erpGet(
          instance,
          `/api/resource/${encodeURIComponent("Stock Entry")}/${encodeURIComponent(ssr.stockEntryName)}`,
        );
        stockEntryCache.set(cacheKey, stockEntry);
      }
      if (text(stockEntry?.purpose) !== "Material Issue") {
        console.warn(`SKIP ${ssr.name}: ${ssr.stockEntryName} is not a Material Issue.`);
        skipped += 1;
        continue;
      }

      const key = `${ssr.companyId}:${ssr.name}:${ssr.isBackfill}`;
      const issueData = {
        name: ssr.stockEntryName,
        erpCompany: text(stockEntry.company),
        purpose: text(stockEntry.purpose),
        stockEntryType: text(stockEntry.stock_entry_type),
        docstatus: number(stockEntry.docstatus),
        postingDate: date(stockEntry.posting_date),
        rawPayload: stockEntry,
      };
      const items = Array.isArray(stockEntry.items)
        ? stockEntry.items
            .filter((item) => text(item?.name) && text(item?.item_code))
            .map((item) => ({
              companyId: ssr.companyId,
              name: text(item.name),
              itemCode: text(item.item_code),
              itemName: text(item.item_name),
              qty: number(item.qty) ?? 0,
              stockUom: text(item.stock_uom),
              basicRate: number(item.basic_rate),
              basicAmount: number(item.basic_amount),
              valuationRate: number(item.valuation_rate),
              amount: number(item.amount),
              effectiveRate: materialIssueRate(item),
            }))
        : [];

      if (!dryRun) {
        await prisma.$transaction(async (tx) => {
          let materialIssueId = persistedMaterialIssueIds.get(cacheKey);
          if (!materialIssueId) {
            const materialIssue = await tx.grnMaterialIssue.upsert({
              where: {
                companyId_name: {
                  companyId: ssr.companyId,
                  name: ssr.stockEntryName,
                },
              },
              create: {
                companyId: ssr.companyId,
                ...issueData,
              },
              update: issueData,
              select: { id: true },
            });
            materialIssueId = materialIssue.id;
            await tx.grnMaterialIssueItem.deleteMany({
              where: { materialIssueId },
            });
            if (items.length > 0) {
              await tx.grnMaterialIssueItem.createMany({
                data: items.map((item) => ({ ...item, materialIssueId })),
              });
            }
            persistedMaterialIssueIds.set(cacheKey, materialIssueId);
          }
          await tx.grnSupplierStockReturnMaterialIssueLink.upsert({
            where: {
              companyId_supplierStockReturnName_supplierStockReturnIsBackfill: {
                companyId: ssr.companyId,
                supplierStockReturnName: ssr.name,
                supplierStockReturnIsBackfill: ssr.isBackfill,
              },
            },
            create: {
              companyId: ssr.companyId,
              supplierStockReturnName: ssr.name,
              supplierStockReturnIsBackfill: ssr.isBackfill,
              materialIssueId,
            },
            update: { materialIssueId },
          });
        });
      }

      if (existingKeys.has(key)) updated += 1;
      else created += 1;
      if (verbose) {
        console.log(
          `${dryRun ? "CHECK" : "UPSERT"} ${ssr.name} → ${ssr.stockEntryName} (${items.length} item${items.length === 1 ? "" : "s"})`,
        );
      }
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${ssr.name} → ${ssr.stockEntryName}: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (delayMs > 0 && index < selected.length - 1) await sleep(delayMs);
  }

  console.log(JSON.stringify({ dryRun, checked: selected.length, created, updated, skipped, failed }, null, 2));
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
