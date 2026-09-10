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
function counted(status) {
  const s = String(status ?? "")
    .trim()
    .toLowerCase();
  return s === "paid" || s === "pending";
}
function codesFromOrder(order) {
  const out = [];
  const d = order.discountCodes;
  if (Array.isArray(d)) {
    for (const row of d) {
      const c = row && typeof row.code === "string" ? row.code.trim().toLowerCase() : "";
      if (c) out.push(c);
    }
  }
  return out;
}

async function main() {
  const todayYmd = colomboYmd();
  const ym = todayYmd.slice(0, 7);
  const monthFrom = dayStart(`${ym}-01`);
  const todayFrom = dayStart(todayYmd);
  const todayTo = dayEnd(todayYmd);

  const company = await prisma.company.findFirst({ select: { id: true } });
  const merchants = await prisma.user.findMany({
    where: { companyId: company.id, couponCodes: { isEmpty: false } },
    select: { id: true, knownName: true, name: true, couponCodes: true },
  });
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
    },
  });

  const rows = [];
  for (const m of merchants) {
    const set = new Set(m.couponCodes.map((c) => c.trim().toLowerCase()).filter(Boolean));
    let total = 0;
    let n = 0;
    const todayVoids = [];
    const todayAdds = [];
    for (const o of orders) {
      const oc = codesFromOrder(o);
      const merHit = oc.some((c) => set.has(c));
      const assigned = o.assignedMerchantId === m.id;
      // personal coupon wins; else assigned if no other MER-looking code
      const otherMer = oc.some((c) => c.startsWith("mer") && !set.has(c));
      const mine = merHit || (assigned && !otherMer && !oc.some((c) => c.startsWith("mer")));
      if (!mine) continue;
      const amt = Number(o.totalPrice);
      const created = o.createdAt >= todayFrom;
      if (counted(o.financialStatus)) {
        total += amt;
        n += 1;
        if (created) todayAdds.push({ name: o.name, amt, status: o.financialStatus });
      } else if (o.cancelledAt && o.cancelledAt >= todayFrom) {
        todayVoids.push({
          name: o.name,
          amt,
          status: o.financialStatus,
          reason: o.cancelReason,
        });
      }
    }
    rows.push({
      name: m.knownName || m.name,
      coupons: m.couponCodes,
      n,
      total: Math.round(total),
      todayAdds,
      todayVoids,
      todayVoidSum: Math.round(todayVoids.reduce((s, x) => s + x.amt, 0)),
      todayAddSum: Math.round(todayAdds.reduce((s, x) => s + x.amt, 0)),
    });
  }
  rows.sort((a, b) => b.total - a.total);
  console.log(
    "top MTD",
    JSON.stringify(
      rows.slice(0, 12).map((r) => ({
        name: r.name,
        total: r.total,
        n: r.n,
        todayAddSum: r.todayAddSum,
        todayVoidSum: r.todayVoidSum,
        todayAdds: r.todayAdds.slice(0, 8),
        todayVoids: r.todayVoids.slice(0, 8),
      })),
      null,
      2,
    ),
  );
  const near = rows.filter((r) => r.total >= 3_900_000 && r.total <= 4_600_000);
  console.log("near 4.2–4.5M", JSON.stringify(near, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
