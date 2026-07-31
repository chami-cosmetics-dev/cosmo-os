/**
 * List Sales Invoices present in ERP1/ERP2 but missing from Cosmo OS Orders.
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-prod node scripts/list-erp-si-missing-in-os.mjs
 *   node scripts/with-env.mjs cosmo-prod node scripts/list-erp-si-missing-in-os.mjs --slot=erp1
 *   node scripts/with-env.mjs cosmo-prod node scripts/list-erp-si-missing-in-os.mjs --since=2026-01-01
 *   node scripts/with-env.mjs cosmo-prod node scripts/list-erp-si-missing-in-os.mjs --company="Chami Trading Lanka (Pvt) Ltd"
 */

import { config } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const envFile =
  process.argv.find((a) => a.endsWith(".env") || a.startsWith(".env.")) ?? ".env.cosmo-prod";
config({ path: envFile });

const args = process.argv.slice(2).filter((a) => !a.endsWith(".env") && !a.startsWith(".env."));
const since = args.find((a) => a.startsWith("--since="))?.split("=")[1] ?? null;
const companyFilter = args.find((a) => a.startsWith("--company="))?.slice("--company=".length) || null;
const slotFilter = args.find((a) => a.startsWith("--slot="))?.split("=")[1]?.toLowerCase() ?? null;

const PAGE_SIZE = 200;

const rawUrl = process.env.DATABASE_URL ?? "";
const prisma = new PrismaClient({
  datasources: {
    db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl },
  },
});

function resolveSlots(instances) {
  const erp1Match = instances.find((i) => /erp[_\s-]*1\b/i.test(i.label ?? ""));
  const erp2Match = instances.find((i) => /erp[_\s-]*2\b/i.test(i.label ?? ""));
  if (erp1Match || erp2Match) {
    return [
      ...(erp1Match ? [{ ...erp1Match, slot: "erp1" }] : []),
      ...(erp2Match ? [{ ...erp2Match, slot: "erp2" }] : []),
    ];
  }
  return instances.slice(0, 2).map((inst, idx) => ({
    ...inst,
    slot: idx === 0 ? "erp1" : "erp2",
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
  let slotted = resolveSlots(instances);
  if (slotFilter === "erp1" || slotFilter === "erp2") {
    slotted = slotted.filter((i) => i.slot === slotFilter);
  }
  return slotted;
}

async function resolveDefaultErpCompany(instance) {
  if (companyFilter) return companyFilter;
  const location = await prisma.companyLocation.findFirst({
    where: { erpnextInstanceId: instance.id, erpnextCompany: { not: null } },
    select: { erpnextCompany: true },
  });
  return location?.erpnextCompany ?? null;
}

async function fetchAllSiRows(instance, erpCompany) {
  const baseUrl = instance.baseUrl.replace(/\/$/, "");
  const auth = `token ${instance.apiKey}:${instance.apiSecret}`;
  let page = 0;
  const all = [];

  while (true) {
    const filters = [
      ["docstatus", "=", 1],
      ["is_return", "!=", 1],
      ...(erpCompany ? [["company", "=", erpCompany]] : []),
      ...(since ? [["posting_date", ">=", since]] : []),
    ];
    const f = encodeURIComponent(JSON.stringify(filters));
    const fields = encodeURIComponent(
      JSON.stringify([
        "name",
        "customer",
        "customer_name",
        "company",
        "posting_date",
        "grand_total",
        "status",
        "is_pos",
        "contact_mobile",
        "contact_email",
      ]),
    );
    const url = `${baseUrl}/api/resource/Sales%20Invoice?filters=${f}&fields=${fields}&limit_page_length=${PAGE_SIZE}&limit_start=${page * PAGE_SIZE}&order_by=creation asc`;
    const res = await fetch(url, { headers: { Authorization: auth } });
    if (!res.ok) {
      throw new Error(`[${instance.slot}] SI list failed HTTP ${res.status}`);
    }
    const json = await res.json();
    const batch = json.data ?? [];
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    page++;
  }
  return all;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function findExistingErpOrderIds(siNames) {
  const existing = new Set();
  for (const batch of chunk(siNames, 500)) {
    const erpIds = batch.map((n) => `erp-${n}`);
    const rows = await prisma.order.findMany({
      where: {
        OR: [
          { shopifyOrderId: { in: erpIds } },
          { erpnextInvoiceId: { in: batch } },
        ],
      },
      select: { shopifyOrderId: true, erpnextInvoiceId: true },
    });
    for (const row of rows) {
      if (row.erpnextInvoiceId) existing.add(row.erpnextInvoiceId);
      if (row.shopifyOrderId?.startsWith("erp-")) {
        existing.add(row.shopifyOrderId.slice(4));
      }
    }
  }
  return existing;
}

const instances = await loadInstances();
if (instances.length === 0) {
  console.error("No ERP1/ERP2 instances found");
  process.exit(1);
}

const report = {
  generatedAt: new Date().toISOString(),
  since,
  companyFilter,
  instances: [],
  totals: { erpTotal: 0, alreadyInOs: 0, missingInOs: 0 },
  missing: [],
};

console.log("Comparing ERP Sales Invoices vs Cosmo OS Orders...\n");

for (const instance of instances) {
  const erpCompany = await resolveDefaultErpCompany(instance);
  console.log(`=== ${instance.slot.toUpperCase()} (${instance.label}) ===`);
  console.log(`URL: ${instance.baseUrl}`);
  console.log(`ERP company: ${erpCompany ?? "(all)"}`);

  const rows = await fetchAllSiRows(instance, erpCompany);
  console.log(`Submitted SIs in ERP: ${rows.length}`);

  const existing = await findExistingErpOrderIds(rows.map((r) => r.name));
  const missing = rows.filter((r) => !existing.has(r.name));

  console.log(`Already in OS: ${existing.size}`);
  console.log(`Missing in OS: ${missing.length}\n`);

  report.instances.push({
    slot: instance.slot,
    label: instance.label,
    baseUrl: instance.baseUrl,
    erpCompany,
    erpTotal: rows.length,
    alreadyInOs: rows.length - missing.length,
    missingInOs: missing.length,
  });

  report.totals.erpTotal += rows.length;
  report.totals.alreadyInOs += rows.length - missing.length;
  report.totals.missingInOs += missing.length;

  for (const row of missing) {
    report.missing.push({
      slot: instance.slot,
      invoice: row.name,
      customer: row.customer ?? null,
      customerName: row.customer_name ?? null,
      company: row.company ?? null,
      postingDate: row.posting_date ?? null,
      grandTotal: row.grand_total ?? null,
      status: row.status ?? null,
      isPos: row.is_pos ?? null,
      phone: row.contact_mobile ?? null,
      email: row.contact_email ?? null,
    });
  }
}

const outDir = resolve("exports");
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const jsonPath = resolve(outDir, `erp-si-missing-in-os-${stamp}.json`);
const csvPath = resolve(outDir, `erp-si-missing-in-os-${stamp}.csv`);

writeFileSync(jsonPath, JSON.stringify(report, null, 2));

const csvHeader =
  "slot,invoice,customer,customerName,company,postingDate,grandTotal,status,isPos,phone,email";
const csvRows = report.missing.map((r) =>
  [
    r.slot,
    r.invoice,
    JSON.stringify(r.customer ?? ""),
    JSON.stringify(r.customerName ?? ""),
    JSON.stringify(r.company ?? ""),
    r.postingDate ?? "",
    r.grandTotal ?? "",
    JSON.stringify(r.status ?? ""),
    r.isPos ?? "",
    JSON.stringify(r.phone ?? ""),
    JSON.stringify(r.email ?? ""),
  ].join(","),
);
writeFileSync(csvPath, [csvHeader, ...csvRows].join("\n"));

console.log("=== TOTALS ===");
console.log(`ERP SIs scanned:   ${report.totals.erpTotal}`);
console.log(`Already in OS:     ${report.totals.alreadyInOs}`);
console.log(`Missing in OS:     ${report.totals.missingInOs}`);
console.log("");
console.log(`JSON: ${jsonPath}`);
console.log(`CSV:  ${csvPath}`);
console.log("");
console.log("Missing invoice IDs (first 100):");
for (const row of report.missing.slice(0, 100)) {
  console.log(`  [${row.slot}] ${row.invoice}  ${row.postingDate ?? ""}  ${row.customerName ?? row.customer ?? ""}  ${row.grandTotal ?? ""}`);
}
if (report.missing.length > 100) {
  console.log(`  ... and ${report.missing.length - 100} more (see CSV/JSON)`);
}

await prisma.$disconnect();
