/** Why ERP1 SI backfill shows gap: erp-{name} vs erpnextInvoiceId linkage. */
const { PrismaClient } = require("@prisma/client");

const raw = process.env.DATABASE_URL || "";
const url = raw.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || raw;
const prisma = new PrismaClient({ datasources: { db: { url } } });

async function fetchErp1SiNames(instance, erpCompany) {
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
    const fields = encodeURIComponent(JSON.stringify(["name"]));
    const res = await fetch(
      `${baseUrl}/api/resource/Sales%20Invoice?filters=${f}&fields=${fields}&limit_page_length=500&limit_start=${page * 500}`,
      { headers: { Authorization: auth } }
    );
    const json = await res.json();
    const batch = (json.data ?? []).map((r) => r.name);
    all.push(...batch);
    if (batch.length < 500) break;
  }
  return all;
}

async function main() {
  const instance = await prisma.erpnextInstance.findFirst({
    where: { label: { contains: "ERP_1" } },
    select: { baseUrl: true, apiKey: true, apiSecret: true, id: true, createdAt: true },
  });
  const location = await prisma.companyLocation.findFirst({
    where: { erpnextInstanceId: instance.id, erpnextCompany: { not: null } },
    select: { erpnextCompany: true },
  });
  const erpCompany = location?.erpnextCompany ?? "Cosmetics.lk";
  const names = await fetchErp1SiNames(instance, erpCompany);

  const erpShopifyIds = names.map((n) => `erp-${n}`);
  const byShopify = await prisma.order.findMany({
    where: { shopifyOrderId: { in: erpShopifyIds } },
    select: { shopifyOrderId: true },
  });
  const haveShopify = new Set(byShopify.map((o) => o.shopifyOrderId));

  const byInvoiceId = await prisma.order.findMany({
    where: { erpnextInvoiceId: { in: names } },
    select: { erpnextInvoiceId: true, shopifyOrderId: true, sourceName: true },
  });
  const haveInvoiceId = new Set(byInvoiceId.map((o) => o.erpnextInvoiceId));
  const linkedNonErpNative = byInvoiceId.filter(
    (o) => !String(o.shopifyOrderId).startsWith(`erp-${o.erpnextInvoiceId}`)
  );

  let trueMissing = 0;
  let linkedElsewhere = 0;
  for (const name of names) {
    if (haveShopify.has(`erp-${name}`)) continue;
    if (haveInvoiceId.has(name)) linkedElsewhere += 1;
    else trueMissing += 1;
  }

  console.log(
    JSON.stringify(
      {
        erpCompany,
        erp1InstanceCreated: instance.createdAt,
        erpSubmittedSis: names.length,
        inCosmoAsErpNative: byShopify.length,
        inCosmoViaErpnextInvoiceId: byInvoiceId.length,
        linkedToShopifyManualNotErpNative: linkedNonErpNative.length,
        linkedNonErpNativeSample: linkedNonErpNative.slice(0, 5),
        trueMissingNoCosmoRow: trueMissing,
        backfillScriptWouldImport: names.length - byShopify.length,
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
