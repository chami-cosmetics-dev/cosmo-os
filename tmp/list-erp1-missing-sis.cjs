/** List ERP1 SIs missing from Cosmo + reason bucket. */
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
      JSON.stringify(["name", "posting_date", "grand_total", "is_pos", "po_no", "customer", "customer_name", "contact_mobile"])
    );
    const res = await fetch(
      `${baseUrl}/api/resource/Sales%20Invoice?filters=${f}&fields=${fields}&limit_page_length=500&limit_start=${page * 500}&order_by=posting_date desc`,
      { headers: { Authorization: auth } }
    );
    const json = await res.json();
    const batch = json.data ?? [];
    all.push(...batch);
    if (batch.length < 500) break;
  }
  return all;
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
  const names = sis.map((s) => s.name);

  const erpShopifyIds = names.map((n) => `erp-${n}`);
  const byShopify = await prisma.order.findMany({
    where: { shopifyOrderId: { in: erpShopifyIds } },
    select: { shopifyOrderId: true },
  });
  const haveShopify = new Set(byShopify.map((o) => o.shopifyOrderId.replace(/^erp-/, "")));

  const byInvoiceId = await prisma.order.findMany({
    where: { erpnextInvoiceId: { in: names } },
    select: {
      id: true,
      erpnextInvoiceId: true,
      shopifyOrderId: true,
      sourceName: true,
      name: true,
      orderNumber: true,
    },
  });
  const invoiceMap = new Map(byInvoiceId.map((o) => [o.erpnextInvoiceId, o]));

  const buckets = {
    erp_native_in_cosmo: [],
    linked_shopify_or_manual: [],
    truly_missing: [],
    backfill_would_duplicate: [],
  };

  for (const si of sis) {
    const name = si.name;
    if (haveShopify.has(name)) {
      buckets.erp_native_in_cosmo.push(name);
      continue;
    }
    const linked = invoiceMap.get(name);
    if (linked) {
      buckets.linked_shopify_or_manual.push({
        invoice: name,
        posting_date: si.posting_date,
        grand_total: si.grand_total,
        is_pos: si.is_pos,
        po_no: si.po_no,
        cosmo_order: linked.name || linked.orderNumber || linked.id,
        cosmo_source: linked.sourceName,
        cosmo_shopify_id: linked.shopifyOrderId,
        reason: "Already in Cosmo via erpnextInvoiceId on existing order (webhook linked — not erp-* row)",
      });
      buckets.backfill_would_duplicate.push(name);
      continue;
    }
    buckets.truly_missing.push({
      invoice: name,
      posting_date: si.posting_date,
      grand_total: si.grand_total,
      is_pos: si.is_pos,
      po_no: si.po_no || null,
      customer: si.customer_name || si.customer,
      phone: si.contact_mobile || null,
      reason: si.po_no
        ? "Has po_no but no matching Cosmo order found — webhook may have failed or po_no mismatch"
        : si.is_pos
          ? "POS invoice with no erp-* Cosmo row — webhook likely never received or failed"
          : "Non-POS invoice never imported — webhook likely never received or failed",
    });
  }

  console.log(
    JSON.stringify(
      {
        erpCompany,
        totals: {
          erp_submitted: sis.length,
          erp_native_in_cosmo: buckets.erp_native_in_cosmo.length,
          linked_elsewhere: buckets.linked_shopify_or_manual.length,
          truly_missing: buckets.truly_missing.length,
          backfill_script_false_gap: buckets.backfill_would_duplicate.length,
        },
        truly_missing: buckets.truly_missing,
        sample_linked_not_erp_native: buckets.linked_shopify_or_manual.slice(0, 10),
        sample_erp_native_ok: buckets.erp_native_in_cosmo.slice(0, 5),
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
