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
  return s === "paid" || s === "pending";
}

async function aggRange(companyId, from, to) {
  return prisma.$queryRaw`
    SELECT
      COALESCE(NULLIF(trim("financialStatus"), ''), '(null)') AS status,
      COUNT(*)::bigint AS count,
      COALESCE(SUM("totalPrice"), 0) AS total
    FROM "Order"
    WHERE "companyId" = ${companyId}
      AND "createdAt" >= ${from}
      AND "createdAt" <= ${to}
    GROUP BY 1
    ORDER BY SUM("totalPrice") DESC NULLS LAST
  `;
}

function printBlock(title, rows) {
  const mapped = rows.map((r) => ({
    status: r.status,
    counted: isCounted(r.status),
    count: Number(r.count),
    total: Math.round(Number(r.total)),
  }));
  const counted = mapped.filter((r) => r.counted);
  const dropped = mapped.filter((r) => !r.counted);
  const cSum = counted.reduce((s, r) => s + r.total, 0);
  const cCnt = counted.reduce((s, r) => s + r.count, 0);
  const dSum = dropped.reduce((s, r) => s + r.total, 0);
  const dCnt = dropped.reduce((s, r) => s + r.count, 0);
  const allSum = cSum + dSum;
  console.log(`\n=== ${title} ===`);
  console.log(
    JSON.stringify(
      {
        countedPaidPending: { count: cCnt, total: cSum },
        excludedFromDashboard: { count: dCnt, total: dSum },
        excludePctOfGross: allSum ? Math.round((dSum / allSum) * 1000) / 10 : 0,
        byStatus: mapped,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const todayYmd = colomboYmd();
  const ym = todayYmd.slice(0, 7);
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthFrom = dayStart(`${ym}-01`);
  const monthTo = dayEnd(`${ym}-${String(last).padStart(2, "0")}`);
  const todayFrom = dayStart(todayYmd);
  const todayTo = dayEnd(todayYmd);

  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
  });
  console.log("today", todayYmd, "companies", companies.map((c) => c.name));

  for (const company of companies) {
    console.log(`\n######## ${company.name} ########`);
    printBlock(
      "MTD by financialStatus (order placed this month)",
      await aggRange(company.id, monthFrom, monthTo),
    );
    printBlock(
      "TODAY by financialStatus (order placed today)",
      await aggRange(company.id, todayFrom, todayTo),
    );

    const droppedToday = await prisma.$queryRaw`
      SELECT
        COALESCE(NULLIF(trim("financialStatus"), ''), '(null)') AS status,
        COUNT(*)::bigint AS count,
        COALESCE(SUM("totalPrice"), 0) AS total
      FROM "Order"
      WHERE "companyId" = ${company.id}
        AND "createdAt" >= ${monthFrom}
        AND "createdAt" <= ${todayTo}
        AND lower(trim(coalesce("financialStatus", ''))) NOT IN ('paid', 'pending')
        AND "updatedAt" >= ${todayFrom}
        AND "updatedAt" <= ${todayTo}
      GROUP BY 1
      ORDER BY SUM("totalPrice") DESC NULLS LAST
    `;
    console.log(
      "\n--- MTD orders currently excluded AND updated today (silent deduct candidates) ---",
    );
    console.log(
      JSON.stringify(
        droppedToday.map((r) => ({
          status: r.status,
          count: Number(r.count),
          total: Math.round(Number(r.total)),
        })),
        null,
        2,
      ),
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
