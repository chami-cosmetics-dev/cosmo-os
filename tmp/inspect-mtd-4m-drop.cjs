const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function colomboYmd(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
function dayStart(ymd) {
  return new Date(`${ymd}T00:00:00.000+05:30`);
}
function dayEnd(ymd) {
  return new Date(`${ymd}T23:59:59.999+05:30`);
}

async function main() {
  const todayYmd = colomboYmd();
  const ym = todayYmd.slice(0, 7);
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthFrom = dayStart(`${ym}-01`);
  const todayTo = dayEnd(`${ym}-${String(last).padStart(2, "0")}`);
  const todayFrom = dayStart(todayYmd);

  const company = await prisma.company.findFirst({ select: { id: true, name: true } });
  console.log(company.name, todayYmd);

  const hit200 = await prisma.order.findMany({
    where: {
      companyId: company.id,
      createdAt: { gte: monthFrom, lte: todayTo },
      totalPrice: { gte: 199000, lte: 201000 },
    },
    select: {
      name: true,
      totalPrice: true,
      financialStatus: true,
      sourceName: true,
      createdAt: true,
      updatedAt: true,
      cancelledAt: true,
      cancelReason: true,
      assignedMerchant: { select: { knownName: true, name: true, couponCodes: true } },
    },
  });
  console.log(
    "orders ~200k",
    JSON.stringify(
      hit200.map((o) => ({
        name: o.name,
        total: Number(o.totalPrice),
        status: o.financialStatus,
        source: o.sourceName,
        merchant: o.assignedMerchant?.knownName || o.assignedMerchant?.name,
        coupons: o.assignedMerchant?.couponCodes,
        cancelledAt: o.cancelledAt,
        cancelReason: o.cancelReason,
        updatedAt: o.updatedAt,
      })),
      null,
      2,
    ),
  );

  const byAssigned = await prisma.$queryRaw`
    SELECT
      COALESCE(u."knownName", u.name, u.email, '(unassigned)') AS merchant,
      u."couponCodes" AS coupons,
      COUNT(*)::int AS n,
      COALESCE(SUM(o."totalPrice"), 0) AS total
    FROM "Order" o
    LEFT JOIN "User" u ON u.id = o."assignedMerchantId"
    WHERE o."companyId" = ${company.id}
      AND o."createdAt" >= ${monthFrom}
      AND o."createdAt" <= ${todayTo}
      AND lower(trim(coalesce(o."financialStatus", ''))) IN ('paid', 'pending')
    GROUP BY 1, 2
    ORDER BY SUM(o."totalPrice") DESC
    LIMIT 20
  `;
  console.log(
    "MTD by assignedMerchant (paid+pending)",
    JSON.stringify(
      byAssigned.map((r) => ({
        merchant: r.merchant,
        coupons: r.coupons,
        n: r.n,
        total: Math.round(Number(r.total)),
      })),
      null,
      2,
    ),
  );

  const near4425 = byAssigned.filter((r) => {
    const t = Number(r.total);
    return t >= 4_000_000 && t <= 4_700_000;
  });
  console.log("near 4.2–4.5M assigned", JSON.stringify(near4425, (_, v) => (typeof v === "bigint" ? Number(v) : v), 2));

  const voidsTodayByMerchant = await prisma.$queryRaw`
    SELECT
      COALESCE(u."knownName", u.name, u.email, '(unassigned)') AS merchant,
      COUNT(*)::int AS n,
      COALESCE(SUM(o."totalPrice"), 0) AS total
    FROM "Order" o
    LEFT JOIN "User" u ON u.id = o."assignedMerchantId"
    WHERE o."companyId" = ${company.id}
      AND o."createdAt" >= ${monthFrom}
      AND o."cancelledAt" >= ${todayFrom}
      AND o."cancelledAt" <= ${dayEnd(todayYmd)}
      AND lower(trim(coalesce(o."financialStatus", ''))) = 'voided'
    GROUP BY 1
    ORDER BY SUM(o."totalPrice") DESC
    LIMIT 15
  `;
  console.log(
    "voided today by assigned",
    JSON.stringify(
      voidsTodayByMerchant.map((r) => ({
        merchant: r.merchant,
        n: r.n,
        total: Math.round(Number(r.total)),
      })),
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
