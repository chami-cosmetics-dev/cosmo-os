const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function dayStart(ymd) {
  return new Date(`${ymd}T00:00:00.000+05:30`);
}
function dayEnd(ymd) {
  return new Date(`${ymd}T23:59:59.999+05:30`);
}
function counted(status) {
  const s = String(status ?? "").trim().toLowerCase();
  return s === "paid" || s === "pending";
}
function codesFromOrder(order) {
  const out = [];
  if (Array.isArray(order.discountCodes)) {
    for (const row of order.discountCodes) {
      const c = row && typeof row.code === "string" ? row.code.trim().toLowerCase() : "";
      if (c) out.push(c);
    }
  }
  return out;
}

async function main() {
  const monthFrom = dayStart("2026-08-01");
  const todayTo = dayEnd("2026-08-31");
  const company = await prisma.company.findFirst({ select: { id: true } });
  const sachini = await prisma.user.findFirst({
    where: { companyId: company.id, knownName: { equals: "sachini", mode: "insensitive" } },
    select: { id: true, knownName: true, couponCodes: true },
  });
  const set = new Set(sachini.couponCodes.map((c) => c.trim().toLowerCase()));
  const orders = await prisma.order.findMany({
    where: { companyId: company.id, createdAt: { gte: monthFrom, lte: todayTo } },
    select: {
      name: true,
      totalPrice: true,
      financialStatus: true,
      assignedMerchantId: true,
      discountCodes: true,
      createdAt: true,
      updatedAt: true,
      cancelledAt: true,
      cancelReason: true,
      fulfillmentStage: true,
    },
  });
  const mine = [];
  for (const o of orders) {
    const oc = codesFromOrder(o);
    const merHit = oc.some((c) => set.has(c));
    const assigned = o.assignedMerchantId === sachini.id;
    const otherMer = oc.some((c) => c.startsWith("mer") && !set.has(c));
    const isMine = merHit || (assigned && !otherMer && !oc.some((c) => c.startsWith("mer")));
    if (!isMine) continue;
    mine.push(o);
  }
  const notCounted = mine
    .filter((o) => !counted(o.financialStatus))
    .map((o) => ({
      name: o.name,
      amt: Number(o.totalPrice),
      status: o.financialStatus,
      stage: o.fulfillmentStage,
      cancelledAt: o.cancelledAt,
      reason: o.cancelReason,
      updatedAt: o.updatedAt,
    }))
    .sort((a, b) => b.amt - a.amt);
  const countedSum = mine.filter((o) => counted(o.financialStatus)).reduce((s, o) => s + Number(o.totalPrice), 0);
  const notSum = notCounted.reduce((s, o) => s + o.amt, 0);
  console.log(
    JSON.stringify(
      {
        merchant: sachini.knownName,
        countedN: mine.filter((o) => counted(o.financialStatus)).length,
        countedSum: Math.round(countedSum),
        notCountedN: notCounted.length,
        notCountedSum: Math.round(notSum),
        notCounted: notCounted.slice(0, 25),
        target: await prisma.merchantMonthlyTarget.findUnique({
          where: {
            companyId_userId_yearMonth: {
              companyId: company.id,
              userId: sachini.id,
              yearMonth: "2026-08",
            },
          },
          select: { targetAmount: true, shopTargetAmount: true, onlineTargetAmount: true },
        }),
      },
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
