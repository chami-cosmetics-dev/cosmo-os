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
function isCounted(status) {
  const s = String(status ?? "")
    .trim()
    .toLowerCase();
  return s === "paid" || s === "pending" || s === "partially_paid";
}

async function main() {
  const todayYmd = colomboYmd();
  const ym = todayYmd.slice(0, 7);
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthFrom = dayStart(`${ym}-01`);
  const todayFrom = dayStart(todayYmd);
  const todayTo = dayEnd(todayYmd);

  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  for (const company of companies) {
    console.log(`\n######## ${company.name} ########`);

    const partial = await prisma.order.findMany({
      where: {
        companyId: company.id,
        createdAt: { gte: monthFrom, lte: todayTo },
        financialStatus: { equals: "partially_paid", mode: "insensitive" },
      },
      select: {
        name: true,
        totalPrice: true,
        sourceName: true,
        financialStatus: true,
        createdAt: true,
        updatedAt: true,
        assignedMerchant: { select: { knownName: true, name: true } },
        paymentEntries: { select: { id: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 40,
    });
    console.log(
      "partially_paid this month",
      JSON.stringify(
        partial.map((o) => ({
          name: o.name,
          total: Number(o.totalPrice),
          source: o.sourceName,
          peCount: o.paymentEntries.length,
          merchant: o.assignedMerchant?.knownName || o.assignedMerchant?.name || "(unassigned)",
          createdAt: o.createdAt,
          updatedAt: o.updatedAt,
        })),
        null,
        2,
      ),
    );

    const droppedToday = await prisma.$queryRaw`
      SELECT
        o."name",
        o."totalPrice",
        o."financialStatus",
        o."fulfillmentStage",
        o."sourceName",
        o."cancelledAt",
        o."cancelReason",
        o."createdAt",
        o."updatedAt",
        COALESCE(u."knownName", u."name", u.email, '(unassigned)') AS merchant
      FROM "Order" o
      LEFT JOIN "User" u ON u.id = o."assignedMerchantId"
      WHERE o."companyId" = ${company.id}
        AND o."createdAt" >= ${monthFrom}
        AND o."createdAt" <= ${todayTo}
        AND o."updatedAt" >= ${todayFrom}
        AND o."updatedAt" <= ${todayTo}
        AND lower(trim(coalesce(o."financialStatus", ''))) NOT IN ('paid', 'pending')
      ORDER BY o."totalPrice" DESC
      LIMIT 40
    `;
    console.log(
      "left count today (not paid/pending)",
      JSON.stringify(
        droppedToday.map((r) => ({
          name: r.name,
          total: Number(r.totalPrice),
          status: r.financialStatus,
          stage: r.fulfillmentStage,
          source: r.sourceName,
          cancelledAt: r.cancelledAt,
          cancelReason: r.cancelReason,
          merchant: r.merchant,
          createdAt: r.createdAt,
        })),
        null,
        2,
      ),
    );

    const near200k = droppedToday.filter((r) => {
      const t = Number(r.totalPrice);
      return t >= 150000 && t <= 250000;
    });
    console.log("near 200k drops", JSON.stringify(near200k.map((r) => ({
      name: r.name,
      total: Number(r.totalPrice),
      status: r.financialStatus,
      merchant: r.merchant,
    })), null, 2));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
