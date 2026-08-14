/**
 * Full list: ERP SI with same po_no (duplicate invoice for one Cosmo/Shopify order).
 * Includes submitted + cancelled + draft. ERP1 + ERP2.
 *
 * Usage: node scripts/with-env.mjs cosmo-prod node tmp/export-duplicate-po-sis.cjs
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const raw = process.env.DATABASE_URL || "";
const url = raw.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || raw;
const prisma = new PrismaClient({ datasources: { db: { url } } });

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function docstatusLabel(n) {
  if (n === 0) return "Draft";
  if (n === 1) return "Submitted";
  if (n === 2) return "Cancelled";
  return String(n ?? "");
}

async function fetchAllSis(instance) {
  const baseUrl = instance.baseUrl.replace(/\/$/, "");
  const auth = `token ${instance.apiKey}:${instance.apiSecret}`;
  const all = [];
  for (let page = 0; page < 100; page++) {
    const fields = encodeURIComponent(
      JSON.stringify([
        "name",
        "posting_date",
        "creation",
        "modified",
        "grand_total",
        "is_pos",
        "is_return",
        "po_no",
        "customer",
        "customer_name",
        "contact_mobile",
        "docstatus",
        "status",
        "company",
      ])
    );
    const res = await fetch(
      `${baseUrl}/api/resource/Sales%20Invoice?fields=${fields}&limit_page_length=500&limit_start=${page * 500}&order_by=creation asc`,
      { headers: { Authorization: auth, Accept: "application/json" } }
    );
    if (!res.ok) {
      throw new Error(`${instance.label} SI list HTTP ${res.status}: ${await res.text().catch(() => "")}`);
    }
    const json = await res.json();
    const batch = json.data ?? [];
    all.push(...batch);
    if (batch.length < 500) break;
  }
  return all;
}

function poKey(po) {
  return String(po ?? "").trim();
}

async function lookupCosmoOrders(poNos) {
  const map = new Map();
  for (let i = 0; i < poNos.length; i += 400) {
    const chunk = poNos.slice(i, i + 400);
    const rows = await prisma.order.findMany({
      where: {
        OR: chunk.flatMap((po) => [{ name: po }, { orderNumber: po }, { shopifyOrderId: po }]),
      },
      select: {
        id: true,
        name: true,
        orderNumber: true,
        shopifyOrderId: true,
        erpnextInvoiceId: true,
        sourceName: true,
        totalPrice: true,
      },
    });
    for (const row of rows) {
      for (const po of chunk) {
        if (row.name === po || row.orderNumber === po || row.shopifyOrderId === po) {
          if (!map.has(po)) map.set(po, row);
        }
      }
    }
  }
  return map;
}

async function main() {
  const instances = await prisma.erpnextInstance.findMany({
    where: { companyId: "cmn2xcas1002crl5xtgoq28f5" },
    orderBy: { createdAt: "asc" },
    select: { id: true, label: true, baseUrl: true, apiKey: true, apiSecret: true },
  });

  const groups = [];
  const summaryBySlot = [];

  for (const inst of instances) {
    const slot = /erp[_\s-]*1\b/i.test(inst.label ?? "")
      ? "erp1"
      : /erp[_\s-]*2\b/i.test(inst.label ?? "")
        ? "erp2"
        : inst.label;
    const sis = await fetchAllSis(inst);
    const byPo = new Map();
    for (const si of sis) {
      const po = poKey(si.po_no);
      if (!po) continue;
      const list = byPo.get(po) ?? [];
      list.push(si);
      byPo.set(po, list);
    }
    const dups = [...byPo.entries()].filter(([, list]) => list.length > 1);
    const poNos = dups.map(([po]) => po);
    const cosmoByPo = await lookupCosmoOrders(poNos);

    for (const [po, list] of dups) {
      const sorted = [...list].sort((a, b) => String(a.name).localeCompare(String(b.name)));
      const cosmo = cosmoByPo.get(po);
      groups.push({
        slot,
        erp_label: inst.label,
        po_no: po,
        si_count: sorted.length,
        invoices: sorted,
        cosmo_order: cosmo?.name || cosmo?.orderNumber || "",
        cosmo_source: cosmo?.sourceName || "",
        cosmo_linked_si: cosmo?.erpnextInvoiceId || "",
        cosmo_shopify_id: cosmo?.shopifyOrderId || "",
      });
    }

    summaryBySlot.push({
      slot,
      label: inst.label,
      totalSis: sis.length,
      sisWithPo: [...byPo.values()].reduce((n, l) => n + l.length, 0),
      duplicatePoGroups: dups.length,
      duplicateSiRows: dups.reduce((n, [, l]) => n + l.length, 0),
    });
  }

  groups.sort((a, b) => a.slot.localeCompare(b.slot) || a.po_no.localeCompare(b.po_no));

  const outPath = path.resolve("tmp/erp-duplicate-po-sis.csv");
  const header = [
    "erp_slot",
    "erp_label",
    "po_no",
    "si_count_on_po",
    "invoice_no",
    "docstatus",
    "status",
    "is_return",
    "is_pos",
    "posting_date",
    "grand_total",
    "customer",
    "phone",
    "company",
    "cosmo_order",
    "cosmo_source",
    "cosmo_linked_si",
    "linked_on_this_si",
    "note",
  ];
  const rows = [header.join(",")];
  for (const g of groups) {
    for (const si of g.invoices) {
      const linkedHere = g.cosmo_linked_si === si.name ? "yes" : "no";
      const note =
        g.si_count > 1
          ? linkedHere === "yes"
            ? "Cosmo linked this SI"
            : "Duplicate SI on same po_no — not the Cosmo linked invoice"
          : "";
      rows.push(
        [
          g.slot,
          g.erp_label,
          g.po_no,
          g.si_count,
          si.name,
          docstatusLabel(si.docstatus),
          si.status ?? "",
          si.is_return ? "1" : "0",
          si.is_pos ? "1" : "0",
          si.posting_date ?? "",
          si.grand_total ?? "",
          si.customer_name ?? si.customer ?? "",
          si.contact_mobile ?? "",
          si.company ?? "",
          g.cosmo_order,
          g.cosmo_source,
          g.cosmo_linked_si,
          linkedHere,
          note,
        ]
          .map(csvEscape)
          .join(",")
      );
    }
  }
  fs.writeFileSync(outPath, rows.join("\n"), "utf8");

  console.log(
    JSON.stringify(
      {
        file: outPath,
        summaryBySlot,
        duplicatePoGroups: groups.length,
        csvRows: rows.length - 1,
        groups: groups.map((g) => ({
          slot: g.slot,
          po_no: g.po_no,
          si_count: g.si_count,
          invoices: g.invoices.map((s) => ({
            name: s.name,
            docstatus: docstatusLabel(s.docstatus),
            status: s.status,
            is_return: s.is_return,
            posting_date: s.posting_date,
            grand_total: s.grand_total,
          })),
          cosmo_order: g.cosmo_order,
          cosmo_linked_si: g.cosmo_linked_si,
        })),
      },
      null,
      2
    )
  );
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
