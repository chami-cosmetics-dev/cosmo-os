/**
 * Backfill historical GRN PR/SSR/PI data from ERPNext into separate backfill tables.
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-prod node scripts/backfill-grn-pr-ssr-history.mjs --from=2026-01-01 --to=2026-09-14
 *   node scripts/with-env.mjs cosmo-prod node scripts/backfill-grn-pr-ssr-history.mjs --dry-run --slot=erp1
 *   node scripts/with-env.mjs cosmo-prod node scripts/backfill-grn-pr-ssr-history.mjs --company="Chami Trading Lanka (Pvt) Ltd"
 *   node scripts/with-env.mjs cosmo-prod node scripts/backfill-grn-pr-ssr-history.mjs --doctype=pr
 *   node scripts/with-env.mjs cosmo-prod node scripts/backfill-grn-pr-ssr-history.mjs --doctype=ssr
 *   node scripts/with-env.mjs cosmo-prod node scripts/backfill-grn-pr-ssr-history.mjs --doctype=pi
 *   node scripts/with-env.mjs cosmo-prod node scripts/backfill-grn-pr-ssr-history.mjs --all-time
 */

import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

const envFile =
  process.argv.find((arg) => arg.endsWith(".env") || arg.startsWith(".env.")) ?? ".env.cosmo-prod";
config({ path: envFile });

const args = process.argv.slice(2).filter((arg) => !arg.endsWith(".env") && !arg.startsWith(".env."));
const dryRun = args.includes("--dry-run");
const allTime = args.includes("--all-time");
const slotFilter = argValue("--slot=")?.toLowerCase() ?? null;
const companyFilter = argValue("--company=") ?? null;
const doctypeFilter = argValue("--doctype=")?.toLowerCase() ?? "all";
const from = argValue("--from=") ?? null;
const to = argValue("--to=") ?? null;
const delayMs = Number(argValue("--delay-ms=") ?? "100");
const pageSize = Number(argValue("--page-size=") ?? "100");
const maxRetries = Number(argValue("--retries=") ?? "4");

if (!["all", "pr", "ssr", "pi"].includes(doctypeFilter)) {
  console.error("--doctype must be one of: all, pr, ssr, pi");
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDateOnly(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateTime(value) {
  if (!value) return null;
  const date = new Date(String(value).includes("T") ? value : String(value).replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
}

function nullIfBlank(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed && trimmed.toLowerCase() !== "none" ? trimmed : null;
}

function resolveSlots(instances) {
  const erp1 = instances.find((instance) => /erp[_\s-]*1\b/i.test(instance.label ?? ""));
  const erp2 = instances.find((instance) => /erp[_\s-]*2\b/i.test(instance.label ?? ""));
  if (erp1 || erp2) {
    return [
      ...(erp1 ? [{ ...erp1, slot: "erp1" }] : []),
      ...(erp2 ? [{ ...erp2, slot: "erp2" }] : []),
    ];
  }
  return instances.map((instance, index) => ({
    ...instance,
    slot: index === 0 ? "erp1" : index === 1 ? "erp2" : `erp${index + 1}`,
  }));
}

async function loadInstances() {
  const instances = await prisma.erpnextInstance.findMany({
    select: {
      id: true,
      label: true,
      baseUrl: true,
      apiKey: true,
      apiSecret: true,
    },
    orderBy: { createdAt: "asc" },
  });
  const slotted = resolveSlots(instances).filter((instance) =>
    slotFilter ? instance.slot === slotFilter : true,
  );
  return slotted.filter((instance) => instance.baseUrl && instance.apiKey && instance.apiSecret);
}

async function loadLocationsByInstance(instanceId) {
  const locations = await prisma.companyLocation.findMany({
    where: {
      erpnextInstanceId: instanceId,
      erpnextCompany: { not: null },
      ...(companyFilter ? { erpnextCompany: companyFilter } : {}),
    },
    select: {
      id: true,
      companyId: true,
      erpnextCompany: true,
    },
    orderBy: { name: "asc" },
  });
  return locations.filter((location) => location.erpnextCompany);
}

async function erpGet(instance, path) {
  const baseUrl = instance.baseUrl.replace(/\/$/, "");
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        headers: { Authorization: `token ${instance.apiKey}:${instance.apiSecret}` },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const error = new Error(`ERPNext GET ${path} failed [${res.status}]: ${text.slice(0, 300)}`);
        if (res.status < 500 && res.status !== 429) throw error;
        lastError = error;
      } else {
        return res.json();
      }
    } catch (error) {
      lastError = error;
    }

    if (attempt < maxRetries) {
      const waitMs = Math.min(30000, 1000 * 2 ** attempt);
      console.warn(
        `    ERP GET retry ${attempt + 1}/${maxRetries} after ${waitMs}ms: ${
          lastError instanceof Error ? lastError.message : String(lastError)
        }`,
      );
      await sleep(waitMs);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`ERPNext GET ${path} failed`);
}

async function listNames(instance, input) {
  const filters = [
    ["company", "=", input.erpCompany],
    ...(from ? [[input.dateField, ">=", from]] : []),
    ...(input.to ? [[input.dateField, "<=", input.to]] : []),
  ];
  const fields = encodeURIComponent(JSON.stringify(["name"]));
  const encodedFilters = encodeURIComponent(JSON.stringify(filters));
  const names = [];
  let start = 0;

  while (true) {
    const path =
      `/api/resource/${encodeURIComponent(input.doctype)}` +
      `?filters=${encodedFilters}` +
      `&fields=${fields}` +
      `&limit_page_length=${pageSize}` +
      `&limit_start=${start}` +
      `&order_by=creation asc`;
    const json = await erpGet(instance, path);
    const batch = (json.data ?? []).map((row) => row.name).filter(Boolean);
    names.push(...batch);
    if (batch.length < pageSize) break;
    start += pageSize;
  }

  return names;
}

function formatDateOnly(date) {
  return date?.toISOString().slice(0, 10) ?? null;
}

function previousDateOnly(date) {
  if (!date) return null;
  const previous = new Date(date);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return formatDateOnly(previous);
}

async function resolveDoctypeCutoff(location, input) {
  if (allTime) return null;
  if (to) return to;
  const earliestLive = await prisma[input.liveModel].findFirst({
    where: {
      companyId: location.companyId,
      [input.liveDateField]: { not: null },
    },
    orderBy: { [input.liveDateField]: "asc" },
    select: { [input.liveDateField]: true },
  });
  return previousDateOnly(earliestLive?.[input.liveDateField] ?? null);
}

async function filterMissingNames(location, input, names) {
  const [liveRows, backfillRows] = await Promise.all([
    prisma[input.liveModel].findMany({
      where: { companyId: location.companyId, name: { in: names } },
      select: { name: true, deletedAt: true },
    }),
    prisma[input.backfillModel].findMany({
      where: { companyId: location.companyId, name: { in: names } },
      select: { name: true, deletedAt: true },
    }),
  ]);
  const existing = new Set(
    [...liveRows, ...backfillRows]
      .filter((row) => !row.deletedAt)
      .map((row) => row.name),
  );
  return names.filter((name) => !existing.has(name));
}

async function markMissingDocumentsDeleted(location, input, names, cutoff) {
  const range = {
    ...(from ? { gte: parseDateOnly(from) } : {}),
    ...(cutoff ? { lte: parseDateOnly(cutoff) } : {}),
  };
  const dateScope = Object.keys(range).length > 0 ? { [input.liveDateField]: range } : {};
  const sourceNames = new Set(names);
  const [liveRows, backfillRows] = await Promise.all([
    prisma[input.liveModel].findMany({
      where: { companyId: location.companyId, deletedAt: null, ...dateScope },
      select: { id: true, name: true },
    }),
    prisma[input.backfillModel].findMany({
      where: { companyId: location.companyId, deletedAt: null, ...dateScope },
      select: { id: true, name: true },
    }),
  ]);
  const missingLiveIds = liveRows.filter((row) => !sourceNames.has(row.name)).map((row) => row.id);
  const missingBackfillIds = backfillRows.filter((row) => !sourceNames.has(row.name)).map((row) => row.id);
  if (!dryRun) {
    const deletedAt = new Date();
    await Promise.all([
      missingLiveIds.length
        ? prisma[input.liveModel].updateMany({ where: { id: { in: missingLiveIds } }, data: { deletedAt } })
        : Promise.resolve(),
      missingBackfillIds.length
        ? prisma[input.backfillModel].updateMany({ where: { id: { in: missingBackfillIds } }, data: { deletedAt } })
        : Promise.resolve(),
    ]);
    const deletedNames = [...liveRows, ...backfillRows]
      .filter((row) => !sourceNames.has(row.name))
      .map((row) => row.name);
    if (input.doctype === "Purchase Receipt" && deletedNames.length > 0) {
      await Promise.all([
        prisma.grnSupplierStockReturn.updateMany({
          where: { companyId: location.companyId, purchaseReceiptName: { in: deletedNames } },
          data: { purchaseReceiptName: null },
        }),
        prisma.grnBackfillSupplierStockReturn.updateMany({
          where: { companyId: location.companyId, purchaseReceiptName: { in: deletedNames } },
          data: { purchaseReceiptName: null },
        }),
      ]);
    }
    if (input.doctype === "Supplier Stock Return" && deletedNames.length > 0) {
      await prisma.grnPurchaseReceipt.updateMany({
        where: { companyId: location.companyId, supplierStockReturnName: { in: deletedNames } },
        data: { supplierStockReturnName: null },
      });
    }
  }
  return missingLiveIds.length + missingBackfillIds.length;
}

async function fetchDoc(instance, doctype, name) {
  const json = await erpGet(
    instance,
    `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`,
  );
  return json.data ?? null;
}

async function upsertPurchaseReceipt(location, doc) {
  const receipt = await prisma.grnBackfillPurchaseReceipt.upsert({
    where: { companyId_name: { companyId: location.companyId, name: doc.name } },
    create: {
      companyId: location.companyId,
      companyLocationId: location.id,
      name: doc.name,
      supplier: doc.supplier,
      supplierName: nullIfBlank(doc.supplier_name),
      postingDate: parseDateOnly(doc.posting_date),
      postingTime: nullIfBlank(doc.posting_time),
      docstatus: doc.docstatus == null ? null : Number(doc.docstatus),
      status: nullIfBlank(doc.status),
      amendedFrom: nullIfBlank(doc.amended_from),
      owner: nullIfBlank(doc.owner),
      creation: parseDateTime(doc.creation),
      deletedAt: null,
      rawPayload: doc,
    },
    update: {
      companyLocationId: location.id,
      supplier: doc.supplier,
      supplierName: nullIfBlank(doc.supplier_name),
      postingDate: parseDateOnly(doc.posting_date),
      postingTime: nullIfBlank(doc.posting_time),
      docstatus: doc.docstatus == null ? null : Number(doc.docstatus),
      status: nullIfBlank(doc.status),
      amendedFrom: nullIfBlank(doc.amended_from),
      owner: nullIfBlank(doc.owner),
      creation: parseDateTime(doc.creation),
      deletedAt: null,
      rawPayload: doc,
    },
    select: { id: true },
  });

  await prisma.grnBackfillPurchaseReceiptItem.deleteMany({
    where: { purchaseReceiptId: receipt.id },
  });
  const items = (doc.items ?? []).filter((item) => item?.name && item?.item_code);
  if (items.length > 0) {
    await prisma.grnBackfillPurchaseReceiptItem.createMany({
      data: items.map((item) => ({
        companyId: location.companyId,
        purchaseReceiptId: receipt.id,
        name: item.name,
        itemCode: item.item_code,
        itemName: nullIfBlank(item.item_name),
        qty: Number(item.qty ?? 0),
        stockQty: item.stock_qty == null ? null : Number(item.stock_qty),
        warehouse: nullIfBlank(item.warehouse),
        stockUom: nullIfBlank(item.stock_uom),
      })),
    });
  }
}

async function upsertSupplierStockReturn(location, doc) {
  const stockReturn = await prisma.grnBackfillSupplierStockReturn.upsert({
    where: { companyId_name: { companyId: location.companyId, name: doc.name } },
    create: {
      companyId: location.companyId,
      name: doc.name,
      supplier: doc.supplier,
      supplierName: nullIfBlank(doc.supplier_name),
      returnDate: parseDateOnly(doc.return_date),
      docstatus: doc.docstatus == null ? null : Number(doc.docstatus),
      amendedFrom: nullIfBlank(doc.amended_from),
      owner: nullIfBlank(doc.owner),
      creation: parseDateTime(doc.creation),
      deletedAt: null,
      rawPayload: doc,
    },
    update: {
      supplier: doc.supplier,
      supplierName: nullIfBlank(doc.supplier_name),
      returnDate: parseDateOnly(doc.return_date),
      docstatus: doc.docstatus == null ? null : Number(doc.docstatus),
      amendedFrom: nullIfBlank(doc.amended_from),
      owner: nullIfBlank(doc.owner),
      creation: parseDateTime(doc.creation),
      deletedAt: null,
      rawPayload: doc,
    },
    select: { id: true },
  });

  await prisma.grnBackfillSupplierStockReturnItem.deleteMany({
    where: { supplierStockReturnId: stockReturn.id },
  });
  const items = (doc.items ?? []).filter((item) => item?.name && item?.item_code);
  if (items.length > 0) {
    await prisma.grnBackfillSupplierStockReturnItem.createMany({
      data: items.map((item) => ({
        companyId: location.companyId,
        supplierStockReturnId: stockReturn.id,
        name: item.name,
        itemCode: item.item_code,
        itemName: nullIfBlank(item.item_name),
        qty: Number(item.qty ?? 0),
        stockUom: nullIfBlank(item.stock_uom),
      })),
    });
  }
}

function firstValue(values) {
  return values.find((value) => Boolean(value)) ?? null;
}

function supplierStockReturnNameFromBillNo(value) {
  const trimmed = nullIfBlank(value);
  if (!trimmed?.startsWith("SSR-")) return null;
  return nullIfBlank(trimmed.slice(4));
}

async function upsertPurchaseInvoice(location, doc) {
  const items = (doc.items ?? []).filter((item) => item?.name && item?.item_code);
  const purchaseReceiptName = firstValue(items.map((item) => nullIfBlank(item.purchase_receipt)));
  const supplierStockReturnName =
    firstValue(items.map((item) => nullIfBlank(item.supplier_stock_return))) ??
    (Number(doc.is_return ?? 0) === 1 ? supplierStockReturnNameFromBillNo(doc.bill_no) : null);

  const invoice = await prisma.grnBackfillPurchaseInvoice.upsert({
    where: { companyId_name: { companyId: location.companyId, name: doc.name } },
    create: {
      companyId: location.companyId,
      name: doc.name,
      supplier: doc.supplier,
      supplierName: nullIfBlank(doc.supplier_name),
      postingDate: parseDateOnly(doc.posting_date),
      docstatus: doc.docstatus == null ? null : Number(doc.docstatus),
      status: nullIfBlank(doc.status),
      isReturn: doc.is_return == null ? null : Number(doc.is_return),
      returnAgainst: nullIfBlank(doc.return_against),
      billNo: nullIfBlank(doc.bill_no),
      amendedFrom: nullIfBlank(doc.amended_from),
      owner: nullIfBlank(doc.owner),
      creation: parseDateTime(doc.creation),
      purchaseReceiptName,
      supplierStockReturnName,
      deletedAt: null,
      rawPayload: doc,
    },
    update: {
      supplier: doc.supplier,
      supplierName: nullIfBlank(doc.supplier_name),
      postingDate: parseDateOnly(doc.posting_date),
      docstatus: doc.docstatus == null ? null : Number(doc.docstatus),
      status: nullIfBlank(doc.status),
      isReturn: doc.is_return == null ? null : Number(doc.is_return),
      returnAgainst: nullIfBlank(doc.return_against),
      billNo: nullIfBlank(doc.bill_no),
      amendedFrom: nullIfBlank(doc.amended_from),
      owner: nullIfBlank(doc.owner),
      creation: parseDateTime(doc.creation),
      purchaseReceiptName,
      supplierStockReturnName,
      deletedAt: null,
      rawPayload: doc,
    },
    select: { id: true },
  });

  await prisma.grnBackfillPurchaseInvoiceItem.deleteMany({
    where: { purchaseInvoiceId: invoice.id },
  });
  if (items.length > 0) {
    await prisma.grnBackfillPurchaseInvoiceItem.createMany({
      data: items.map((item) => ({
        companyId: location.companyId,
        purchaseInvoiceId: invoice.id,
        name: item.name,
        itemCode: item.item_code,
        itemName: nullIfBlank(item.item_name),
        qty: Number(item.qty ?? 0),
        rate: Number(item.rate ?? 0),
        amount: Number(item.amount ?? 0),
        purchaseReceipt: nullIfBlank(item.purchase_receipt),
        purchaseReceiptItem: nullIfBlank(item.purchase_receipt_item),
        supplierStockReturn: nullIfBlank(item.supplier_stock_return),
        supplierStockReturnItem: nullIfBlank(item.supplier_stock_return_item),
        stockUom: nullIfBlank(item.stock_uom),
      })),
    });
  }
}

async function backfillDoctype(instance, location, input) {
  const cutoff = await resolveDoctypeCutoff(location, input);
  if (!allTime && !cutoff) {
    console.log(`  ${input.label}: no live cutoff found and --to was not provided; skipped`);
    return { ok: 0, failed: 0 };
  }
  const names = await listNames(instance, {
    erpCompany: location.erpnextCompany,
    doctype: input.doctype,
    dateField: input.dateField,
    to: cutoff,
  });
  const deleted = await markMissingDocumentsDeleted(location, input, names, cutoff);
  const missingNames = await filterMissingNames(location, input, names);
  console.log(
    `  ${input.label}: ${names.length} ERP document(s), ${missingNames.length} missing` +
      (cutoff ? ` before/equal ${cutoff}` : " across all time") +
      `, ${deleted} moved to deleted records${dryRun ? " (dry run)" : ""}`,
  );

  let ok = 0;
  let failed = 0;
  for (const name of missingNames) {
    try {
      const doc = await fetchDoc(instance, input.doctype, name);
      if (!doc) continue;
      if (!dryRun) await input.upsert(location, doc);
      ok++;
      if (delayMs > 0) await sleep(delayMs);
    } catch (error) {
      failed++;
      console.error(`    ${input.label} ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { ok, failed };
}

async function main() {
  console.log(
    `[grn-backfill] dryRun=${dryRun} allTime=${allTime} from=${from ?? "beginning"} to=${
      allTime ? "all time" : to ?? "live cutoff - 1 day"
    } doctype=${doctypeFilter}`,
  );
  const instances = await loadInstances();
  if (instances.length === 0) throw new Error("No ERPNext instances found");

  let totalOk = 0;
  let totalFailed = 0;
  for (const instance of instances) {
    console.log(`\n=== ${instance.slot.toUpperCase()} ${instance.label ?? ""} ===`);
    const locations = await loadLocationsByInstance(instance.id);
    if (locations.length === 0) {
      console.log("  No mapped ERP companies; skipped");
      continue;
    }

    for (const location of locations) {
      console.log(`\n  Company: ${location.erpnextCompany}`);
      const jobs = [
        ...(doctypeFilter === "all" || doctypeFilter === "pr"
          ? [{
              label: "Purchase Receipt",
              doctype: "Purchase Receipt",
              dateField: "posting_date",
              liveDateField: "postingDate",
              liveModel: "grnPurchaseReceipt",
              backfillModel: "grnBackfillPurchaseReceipt",
              upsert: upsertPurchaseReceipt,
            }]
          : []),
        ...(doctypeFilter === "all" || doctypeFilter === "ssr"
          ? [{
              label: "Supplier Stock Return",
              doctype: "Supplier Stock Return",
              dateField: "return_date",
              liveDateField: "returnDate",
              liveModel: "grnSupplierStockReturn",
              backfillModel: "grnBackfillSupplierStockReturn",
              upsert: upsertSupplierStockReturn,
            }]
          : []),
        ...(doctypeFilter === "all" || doctypeFilter === "pi"
          ? [{
              label: "Purchase Invoice",
              doctype: "Purchase Invoice",
              dateField: "posting_date",
              liveDateField: "postingDate",
              liveModel: "grnPurchaseInvoice",
              backfillModel: "grnBackfillPurchaseInvoice",
              upsert: upsertPurchaseInvoice,
            }]
          : []),
      ];

      for (const job of jobs) {
        const result = await backfillDoctype(instance, location, job);
        totalOk += result.ok;
        totalFailed += result.failed;
      }
    }
  }

  console.log(`\n[grn-backfill] done ok=${totalOk} failed=${totalFailed}${dryRun ? " (dry run)" : ""}`);
}

main()
  .catch((error) => {
    console.error("[grn-backfill] fatal:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
