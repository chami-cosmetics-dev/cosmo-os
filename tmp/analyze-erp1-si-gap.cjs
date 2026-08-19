/** Compare ERP1 SI dates vs Cosmo erp- order coverage. */
const { PrismaClient } = require("@prisma/client");

const raw = process.env.DATABASE_URL || "";
const url = raw.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || raw;
const prisma = new PrismaClient({ datasources: { db: { url } } });

async function fetchErp1SiDates(instance, erpCompany) {
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
    const fields = encodeURIComponent(JSON.stringify(["name", "posting_date", "creation"]));
    const res = await fetch(
      `${baseUrl}/api/resource/Sales%20Invoice?filters=${f}&fields=${fields}&limit_page_length=500&limit_start=${page * 500}&order_by=posting_date asc`,
      { headers: { Authorization: auth } }
    );
    const json = await res.json();
    const batch = json.data ?? [];
    all.push(...batch);
    if (batch.length < 500) break;
  }
  return all;
}

function yearOf(d) {
  return String(d || "").slice(0, 4) || "unknown";
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

  const sis = await fetchErp1SiDates(instance, erpCompany);
  const erpIds = sis.map((s) => `erp-${s.name}`);
  const existing = await prisma.order.findMany({
    where: { shopifyOrderId: { in: erpIds } },
    select: { shopifyOrderId: true, createdAt: true },
  });
  const have = new Set(existing.map((o) => o.shopifyOrderId));

  const byYear = {};
  for (const si of sis) {
    const y = yearOf(si.posting_date);
    if (!byYear[y]) byYear[y] = { erp: 0, cosmo: 0 };
    byYear[y].erp += 1;
    if (have.has(`erp-${si.name}`)) byYear[y].cosmo += 1;
  }

  const cosmoErpOrders = await prisma.order.count({
    where: { sourceName: { startsWith: "erpnext" } },
  });
  const cosmoErpShopifyIds = await prisma.order.count({
    where: { shopifyOrderId: { startsWith: "erp-" } },
  });

  console.log(
    JSON.stringify(
      {
        erpCompany,
        erpSubmittedSis: sis.length,
        cosmoMatchedByShopifyOrderId: existing.length,
        missing: sis.length - existing.length,
        byPostingYear: byYear,
        cosmoErpSourceOrders: cosmoErpOrders,
        cosmoErpShopifyIdOrders: cosmoErpShopifyIds,
        oldestErpSi: sis[0]?.posting_date,
        newestErpSi: sis[sis.length - 1]?.posting_date,
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
