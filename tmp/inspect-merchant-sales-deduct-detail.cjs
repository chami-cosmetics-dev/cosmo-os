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
  const todayFrom = dayStart(todayYmd);
  const todayTo = dayEnd(todayYmd);

  const companies = await prisma.company.findMany({ select: { id: true, name: true } });

  for (const company of companies) {
    console.log(`\n######## ${company.name} ########`);

    const dropped = await prisma.order.findMany({
      where: {
        companyId: company.id,
        createdAt: { gte: monthFrom, lte: todayTo },
        updatedAt: { gte: todayFrom, lte: todayTo },
        NOT: { financialStatus: { in: ["paid", "pending", "Paid", "Pending"] } },
      },
      select: {
        name: true,
        orderNumber: true,
        totalPrice: true,
        financialStatus: true,
        cancelledAt: true,
        cancelReason: true,
        fulfillmentStage: true,
        sourceName: true,
        assignedMerchant: { select: { knownName: true, name: true, email: true } },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { totalPrice: "desc" },
      take: 40,
    });

    console.log(
      "today-updated excluded orders",
      JSON.stringify(
        dropped.map((o) => ({
          name: o.name || o.orderNumber,
          total: Number(o.totalPrice),
          status: o.financialStatus,
          stage: o.fulfillmentStage,
          source: o.sourceName,
          cancelledAt: o.cancelledAt,
          cancelReason: o.cancelReason,
          merchant:
            o.assignedMerchant?.knownName ||
            o.assignedMerchant?.name ||
            o.assignedMerchant?.email ||
            "(unassigned)",
          createdAt: o.createdAt,
        })),
        null,
        2,
      ),
    );

    const voidedMtd = await prisma.$queryRaw`
      SELECT
        COALESCE("fulfillmentStage"::text, '(null)') AS stage,
        COUNT(*) FILTER (WHERE "cancelledAt" IS NOT NULL) AS cancelled_flag,
        COUNT(*) FILTER (WHERE "cancelledAt" IS NULL) AS no_cancel_flag,
        COUNT(*)::bigint AS count,
        COALESCE(SUM("totalPrice"), 0) AS total
      FROM "Order"
      WHERE "companyId" = ${company.id}
        AND "createdAt" >= ${monthFrom}
        AND "createdAt" <= ${todayTo}
        AND lower(trim(coalesce("financialStatus", ''))) = 'voided'
      GROUP BY 1
      ORDER BY SUM("totalPrice") DESC
    `;
    console.log(
      "voided MTD by fulfillmentStage",
      JSON.stringify(
        voidedMtd.map((r) => ({
          stage: r.stage,
          cancelledFlag: Number(r.cancelled_flag),
          noCancelFlag: Number(r.no_cancel_flag),
          count: Number(r.count),
          total: Math.round(Number(r.total)),
        })),
        null,
        2,
      ),
    );

    const otherStatuses = await prisma.$queryRaw`
      SELECT
        COALESCE(NULLIF(trim("financialStatus"), ''), '(null)') AS status,
        COUNT(*)::bigint AS count,
        COALESCE(SUM("totalPrice"), 0) AS total
      FROM "Order"
      WHERE "companyId" = ${company.id}
        AND "createdAt" >= ${monthFrom}
        AND "createdAt" <= ${todayTo}
        AND lower(trim(coalesce("financialStatus", ''))) NOT IN ('paid', 'pending', 'voided')
      GROUP BY 1
    `;
    console.log("other non-counted statuses", JSON.stringify(otherStatuses, (_, v) => (typeof v === "bigint" ? Number(v) : v), 2));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
