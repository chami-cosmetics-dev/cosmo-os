/**
 * List SIs in ALL mapped ERP companies that are missing from Cosmo OS.
 */
import { config } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

config({ path: ".env.cosmo-prod", override: true });

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

async function fetchAllSiRows(instance, erpCompany) {
  const baseUrl = instance.baseUrl.replace(/\/$/, "");
  const auth = `token ${instance.apiKey}:${instance.apiSecret}`;
  let page = 0;
  const all = [];
  while (true) {
    const filters = [
      ["company", "=", erpCompany],
      ["docstatus", "=", 1],
      ["is_return", "!=", 1],
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
    if (!res.ok) throw new Error(`[${instance.slot}] ${erpCompany} HTTP ${res.status}`);
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

async function findExisting(siNames) {
  const existing = new Set();
  for (const batch of chunk(siNames, 500)) {
    const erpIds = batch.map((n) => `erp-${n}`);
    const rows = await prisma.order.findMany({
      where: {
        OR: [{ shopifyOrderId: { in: erpIds } }, { erpnextInvoiceId: { in: batch } }],
      },
      select: { shopifyOrderId: true, erpnextInvoiceId: true },
    });
    for (const row of rows) {
      if (row.erpnextInvoiceId) existing.add(row.erpnextInvoiceId);
      if (row.shopifyOrderId?.startsWith("erp-")) existing.add(row.shopifyOrderId.slice(4));
    }
  }
  return existing;
}

const instances = resolveSlots(
  await prisma.erpnextInstance.findMany({
    select: {
      id: true,
      label: true,
      baseUrl: true,
      apiKey: true,
      apiSecret: true,
      locations: { select: { erpnextCompany: true } },
    },
    orderBy: { createdAt: "asc" },
  }),
);

const report = {
  generatedAt: new Date().toISOString(),
  note: "Missing = SI not found as Order.shopifyOrderId=erp-{name} AND not as Order.erpnextInvoiceId",
  byCompany: [],
  totals: { erpTotal: 0, alreadyInOs: 0, missingInOs: 0 },
  missing: [],
};

console.log("Scanning ALL mapped ERP companies...\n");

for (const instance of instances) {
  const companies = [
    ...new Set(
      (instance.locations ?? [])
        .map((l) => l.erpnextCompany)
        .filter(Boolean),
    ),
  ];
  for (const company of companies) {
    process.stdout.write(`[${instance.slot}] ${company}... `);
    const rows = await fetchAllSiRows(instance, company);
    const existing = await findExisting(rows.map((r) => r.name));
    const missing = rows.filter((r) => !existing.has(r.name));
    console.log(`ERP=${rows.length} inOS=${rows.length - missing.length} missing=${missing.length}`);

    report.byCompany.push({
      slot: instance.slot,
      label: instance.label,
      company,
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
        company,
        invoice: row.name,
        customer: row.customer ?? null,
        customerName: row.customer_name ?? null,
        postingDate: row.posting_date ?? null,
        grandTotal: row.grand_total ?? null,
        status: row.status ?? null,
        isPos: row.is_pos ?? null,
        phone: row.contact_mobile ?? null,
        email: row.contact_email ?? null,
      });
    }
  }
}

const outDir = resolve("exports");
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const jsonPath = resolve(outDir, `erp-si-missing-all-companies-${stamp}.json`);
const csvPath = resolve(outDir, `erp-si-missing-all-companies-${stamp}.csv`);
writeFileSync(jsonPath, JSON.stringify(report, null, 2));
writeFileSync(
  csvPath,
  [
    "slot,company,invoice,customer,customerName,postingDate,grandTotal,status,isPos,phone,email",
    ...report.missing.map((r) =>
      [
        r.slot,
        JSON.stringify(r.company),
        r.invoice,
        JSON.stringify(r.customer ?? ""),
        JSON.stringify(r.customerName ?? ""),
        r.postingDate ?? "",
        r.grandTotal ?? "",
        JSON.stringify(r.status ?? ""),
        r.isPos ?? "",
        JSON.stringify(r.phone ?? ""),
        JSON.stringify(r.email ?? ""),
      ].join(","),
    ),
  ].join("\n"),
);

console.log("\n=== BY COMPANY ===");
for (const row of report.byCompany) {
  console.log(
    `${row.slot.padEnd(5)} ${String(row.missingInOs).padStart(5)} missing / ${String(row.erpTotal).padStart(5)} ERP  ${row.company}`,
  );
}
console.log("\n=== TOTALS ===");
console.log(`ERP SIs scanned: ${report.totals.erpTotal}`);
console.log(`Already in OS:   ${report.totals.alreadyInOs}`);
console.log(`Missing in OS:   ${report.totals.missingInOs}`);
console.log(`\nJSON: ${jsonPath}`);
console.log(`CSV:  ${csvPath}`);

if (report.missing.length) {
  console.log("\nMissing invoices:");
  for (const row of report.missing) {
    console.log(
      `  [${row.slot}] ${row.invoice}  ${row.company}  ${row.postingDate ?? ""}  ${row.customerName ?? row.customer ?? ""}  ${row.grandTotal ?? ""}`,
    );
  }
}

await prisma.$disconnect();
