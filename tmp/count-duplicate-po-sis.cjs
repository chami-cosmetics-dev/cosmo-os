/**
 * ERP1 SIs sharing po_no: count duplicate-invoice patterns like
 * 600-001483 vs 600-001484 (same Shopify order, Cosmo linked one SI only).
 */
const { PrismaClient } = require("@prisma/client");

const raw = process.env.DATABASE_URL || "";
const url = raw.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || raw;
const prisma = new PrismaClient({ datasources: { db: { url } } });

async function fetchErp1Sis(instance, erpCompany) {
  const baseUrl = instance.baseUrl.replace(/\/$/, "");
  const auth = `token ${instance.apiKey}:${instance.apiSecret}`;
  const all = [];
  for (let page = 0; page < 20; page++) {
    const filters = [
      ["docstatus", "=", 1],
      ["is_return", "!=", 1],
      ["company", "=", erpCompany],
    ];
    const f = encodeURIComponent(JSON.stringify(filters));
    const fields = encodeURIComponent(
      JSON.stringify([
        "name",
        "posting_date",
        "creation",
        "grand_total",
        "is_pos",
        "po_no",
        "customer_name",
        "docstatus",
      ])
    );
    const res = await fetch(
      `${baseUrl}/api/resource/Sales%20Invoice?filters=${f}&fields=${fields}&limit_page_length=500&limit_start=${page * 500}&order_by=name asc`,
      { headers: { Authorization: auth } }
    );
    const json = await res.json();
    const batch = json.data ?? [];
    all.push(...batch);
    if (batch.length < 500) break;
  }
  return all;
}

function siSortKey(name) {
  const m = /(\d+)$/.exec(String(name));
  return m ? Number(m[1]) : 0;
}

async function main() {
  const instance = await prisma.erpnextInstance.findFirst({
    where: { label: { contains: "ERP_1" } },
    select: { baseUrl: true, apiKey: true, apiSecret: true, id: true },
  });
  if (!instance) throw new Error("ERP1 not found");

  const location = await prisma.companyLocation.findFirst({
    where: { erpnextInstanceId: instance.id, erpnextCompany: { not: null } },
    select: { erpnextCompany: true },
  });
  const erpCompany = location?.erpnextCompany ?? "Cosmetics.lk";
  const sis = await fetchErp1Sis(instance, erpCompany);

  const byPo = new Map();
  for (const si of sis) {
    const po = String(si.po_no ?? "").trim();
    if (!po) continue;
    const list = byPo.get(po) ?? [];
    list.push(si);
    byPo.set(po, list);
  }

  const duplicatePoGroups = [...byPo.entries()].filter(([, list]) => list.length > 1);

  const poNos = [...byPo.keys()];
  const cosmoByPo = new Map();
  for (let i = 0; i < poNos.length; i += 500) {
    const chunk = poNos.slice(i, i + 500);
    const rows = await prisma.order.findMany({
      where: {
        OR: chunk.flatMap((po) => [
          { name: po },
          { orderNumber: po },
          { shopifyOrderId: po },
        ]),
      },
      select: {
        id: true,
        name: true,
        orderNumber: true,
        shopifyOrderId: true,
        erpnextInvoiceId: true,
        sourceName: true,
      },
    });
    for (const row of rows) {
      for (const po of chunk) {
        if (
          row.name === po ||
          row.orderNumber === po ||
          row.shopifyOrderId === po
        ) {
          if (!cosmoByPo.has(po)) cosmoByPo.set(po, row);
        }
      }
    }
  }

  const allNames = sis.map((s) => s.name);
  const cosmoByInvoice = new Map();
  for (let i = 0; i < allNames.length; i += 500) {
    const chunk = allNames.slice(i, i + 500);
    const rows = await prisma.order.findMany({
      where: { erpnextInvoiceId: { in: chunk } },
      select: { erpnextInvoiceId: true, shopifyOrderId: true, sourceName: true, name: true },
    });
    for (const row of rows) {
      if (row.erpnextInvoiceId) cosmoByInvoice.set(row.erpnextInvoiceId, row);
    }
  }

  const erpNative = new Set(
    (
      await prisma.order.findMany({
        where: { shopifyOrderId: { in: allNames.map((n) => `erp-${n}`) } },
        select: { shopifyOrderId: true },
      })
    ).map((o) => o.shopifyOrderId.replace(/^erp-/, ""))
  );

  /** Same po_no, multiple SIs, Cosmo order exists, some SIs not linked on that order. */
  const samePoMultiSiUnlinked = [];
  /** Same po_no, multiple SIs total (any Cosmo state). */
  const samePoMultiSiAll = [];

  for (const [po, list] of duplicatePoGroups) {
    const sorted = [...list].sort((a, b) => siSortKey(a.name) - siSortKey(b.name));
    samePoMultiSiAll.push({
      po_no: po,
      invoice_count: sorted.length,
      invoices: sorted.map((s) => ({
        name: s.name,
        posting_date: s.posting_date,
        grand_total: s.grand_total,
      })),
    });

    const cosmo = cosmoByPo.get(po);
    if (!cosmo) continue;

    const linkedOnOrder = cosmo.erpnextInvoiceId?.trim() || null;
    const unlinked = sorted.filter((s) => {
      const name = s.name;
      if (linkedOnOrder === name) return false;
      if (cosmoByInvoice.has(name)) return false;
      if (erpNative.has(name)) return false;
      return true;
    });

    if (unlinked.length === 0) continue;

    samePoMultiSiUnlinked.push({
      po_no: po,
      cosmo_order: cosmo.name || cosmo.orderNumber || cosmo.id,
      cosmo_linked_invoice: linkedOnOrder,
      cosmo_source: cosmo.sourceName,
      all_invoices: sorted.map((s) => s.name),
      unlinked_invoices: unlinked.map((s) => ({
        name: s.name,
        posting_date: s.posting_date,
        grand_total: s.grand_total,
      })),
      pattern:
        sorted.length === 2 &&
        linkedOnOrder &&
        unlinked.length === 1 &&
        siSortKey(unlinked[0].name) + 1 === siSortKey(linkedOnOrder)
          ? "adjacent_plus_one"
          : sorted.length === 2
            ? "pair_other"
            : "multi",
    });
  }

  const adjacentPair = samePoMultiSiUnlinked.filter((r) => r.pattern === "adjacent_plus_one");
  const pairOther = samePoMultiSiUnlinked.filter((r) => r.pattern === "pair_other");
  const multi = samePoMultiSiUnlinked.filter((r) => r.pattern === "multi");

  console.log(
    JSON.stringify(
      {
        erpCompany,
        totals: {
          erp_submitted_sis: sis.length,
          sis_with_po_no: [...byPo.values()].reduce((n, l) => n + l.length, 0),
          distinct_po_no: byPo.size,
          po_no_with_multiple_sis: duplicatePoGroups.length,
          cosmo_order_exists_but_some_si_unlinked: samePoMultiSiUnlinked.length,
          adjacent_plus_one_like_483_484: adjacentPair.length,
          other_two_invoice_pairs: pairOther.length,
          three_or_more_invoices_same_po: multi.length,
          total_unlinked_si_rows: samePoMultiSiUnlinked.reduce(
            (n, r) => n + r.unlinked_invoices.length,
            0
          ),
        },
        examples_adjacent_plus_one: adjacentPair.slice(0, 15),
        examples_other_pairs: pairOther.slice(0, 10),
        examples_multi: multi.slice(0, 5),
        known_cases: samePoMultiSiUnlinked.filter((r) =>
          r.all_invoices.some((n) => n === "600-001483" || n === "600-002133")
        ),
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
