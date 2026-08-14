/**
 * Compare ERP Customer counts vs Cosmo ContactMaster erp-tagged contacts.
 */
const { PrismaClient } = require("@prisma/client");

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
const raw = process.env.DATABASE_URL || "";
const url = raw.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || raw;
const prisma = new PrismaClient({ datasources: { db: { url } } });

function resolveSlots(instances) {
  const erp1 = instances.find((i) => /erp[_\s-]*1\b/i.test(i.label ?? ""));
  const erp2 = instances.find((i) => /erp[_\s-]*2\b/i.test(i.label ?? ""));
  if (erp1 || erp2) {
    return [
      ...(erp1 ? [{ ...erp1, slot: "erp1" }] : []),
      ...(erp2 ? [{ ...erp2, slot: "erp2" }] : []),
    ];
  }
  return instances.slice(0, 2).map((i, idx) => ({ ...i, slot: idx === 0 ? "erp1" : "erp2" }));
}

async function countErpCustomers(inst) {
  const auth = `token ${inst.apiKey}:${inst.apiSecret}`;
  const base = inst.baseUrl.replace(/\/$/, "");
  let total = 0;
  const pageSize = 500;
  for (let start = 0; start < 500000; start += pageSize) {
    const path =
      `/api/resource/Customer?fields=${encodeURIComponent(JSON.stringify(["name"]))}` +
      `&limit_page_length=${pageSize}&limit_start=${start}`;
    const res = await fetch(`${base}${path}`, {
      headers: { Authorization: auth, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`${inst.label} GET Customer [${res.status}]`);
    const json = await res.json();
    const batch = json.data ?? [];
    total += batch.length;
    if (batch.length < pageSize) break;
  }
  return total;
}

async function main() {
  const instances = await prisma.erpnextInstance.findMany({
    where: { companyId: COMPANY_ID },
    orderBy: { createdAt: "asc" },
    select: { label: true, baseUrl: true, apiKey: true, apiSecret: true },
  });
  const slots = resolveSlots(instances);

  const cosmoErpOrders = await prisma.$queryRaw`
    SELECT
      COUNT(*) FILTER (WHERE o."sourceName" LIKE 'erpnext%')::int AS erp_orders,
      COUNT(*) FILTER (WHERE o."erpnextCustomerId" IS NOT NULL)::int AS with_erp_customer_id,
      COUNT(DISTINCT o."erpnextCustomerId") FILTER (WHERE o."erpnextCustomerId" IS NOT NULL)::int AS distinct_erp_customer_ids
    FROM "Order" o
    WHERE o."companyId" = ${COMPANY_ID}
  `;

  const report = {
    companyId: COMPANY_ID,
    cosmoOrders: cosmoErpOrders[0],
    erpInstances: [],
  };

  for (const inst of slots) {
    const [erpCustomerCount, cosmoTagged, cosmoWithPhone] = await Promise.all([
      countErpCustomers(inst),
      prisma.contactMaster.count({ where: { companyId: COMPANY_ID, source: inst.slot } }),
      prisma.contactMaster.count({
        where: {
          companyId: COMPANY_ID,
          source: inst.slot,
          phoneNumber: { not: null },
          NOT: { phoneNumber: "" },
        },
      }),
    ]);
    report.erpInstances.push({
      slot: inst.slot,
      label: inst.label,
      baseUrl: inst.baseUrl,
      erpCustomerCount,
      cosmoContactsTagged: cosmoTagged,
      cosmoTaggedWithPhone: cosmoWithPhone,
      gapErpMinusCosmoTagged: erpCustomerCount - cosmoTagged,
    });
  }

  console.log(JSON.stringify(report, null, 2));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
