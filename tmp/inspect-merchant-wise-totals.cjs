const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

function getMerchantDisplayName(user) {
  return (
    user?.knownName?.trim() ||
    user?.name?.trim() ||
    user?.email?.trim() ||
    user?.id?.trim() ||
    "Unknown"
  );
}

function getUserDisplayName(user) {
  return user?.knownName?.trim() || user?.name?.trim() || user?.email?.trim() || null;
}

function normalizeStatus(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isDashboardSalesOrderEligible(order) {
  const financial = normalizeStatus(order.financialStatus);
  if (!["paid", "pending", "partially_paid", "authorized"].includes(financial) && financial) {
    // keep loose — use same as lib if needed; for inspect count use paid/pending mainly
  }
  return true;
}

(async () => {
  const company = await p.company.findFirst({ select: { id: true } });
  const companyId = company.id;

  const [users, groups, orders] = await Promise.all([
    p.user.findMany({
      where: { companyId, couponCodes: { isEmpty: false } },
      select: { id: true, knownName: true, name: true, email: true, couponCodes: true },
    }),
    p.merchantGroup.findMany({
      where: { companyId },
      select: { id: true, name: true, members: { select: { userId: true } } },
    }),
    p.order.findMany({
      where: {
        companyId,
        createdAt: {
          gte: new Date("2026-01-01T00:00:00.000+05:30"),
          lte: new Date("2026-08-21T23:59:59.999+05:30"),
        },
      },
      select: {
        totalPrice: true,
        discountCodes: true,
        sourceName: true,
        rawPayload: true,
        assignedMerchantId: true,
        financialStatus: true,
        assignedMerchant: {
          select: { id: true, knownName: true, name: true, email: true, couponCodes: true },
        },
      },
      take: 50000,
    }),
  ]);

  const userToGroup = new Map();
  for (const g of groups) {
    for (const m of g.members) userToGroup.set(m.userId, { id: g.id, name: g.name });
  }

  function applyMerchantGroup(merchant) {
    if (!merchant.id) return merchant;
    const group = userToGroup.get(merchant.id);
    return group ? { id: group.id, name: group.name } : merchant;
  }

  const couponToUser = new Map();
  for (const user of users) {
    const merchant = applyMerchantGroup({
      id: user.id,
      name: getMerchantDisplayName(user),
    });
    for (const coupon of user.couponCodes) {
      const normalized = coupon.trim().toLowerCase();
      if (normalized && !couponToUser.has(normalized)) {
        couponToUser.set(normalized, merchant);
      }
    }
  }

  // Minimal coupon extract from discountCodes JSON
  function couponsFromOrder(order) {
    const codes = [];
    const d = order.discountCodes;
    if (Array.isArray(d)) {
      for (const row of d) {
        if (row && typeof row === "object" && typeof row.code === "string") {
          codes.push(row.code.trim().toLowerCase());
        }
      }
    }
    return codes.filter(Boolean);
  }

  const totals = new Map();
  let orderCount = 0;
  for (const order of orders) {
    const financial = normalizeStatus(order.financialStatus);
    if (financial && !["paid", "pending", "partially_paid"].includes(financial)) continue;

    let merchantId = null;
    let merchantName = null;
    const merchantCoupons = couponsFromOrder(order);
    for (const code of merchantCoupons) {
      const matched = couponToUser.get(code);
      if (matched) {
        merchantId = matched.id;
        merchantName = matched.name;
        break;
      }
    }
    if (!merchantName) {
      const grouped = applyMerchantGroup({
        id: order.assignedMerchantId,
        name: getUserDisplayName(order.assignedMerchant) ?? "DM-General",
      });
      merchantId = grouped.id;
      merchantName = grouped.name;
    }
    const amount = Number(order.totalPrice ?? 0);
    totals.set(merchantName, (totals.get(merchantName) ?? 0) + amount);
    orderCount += 1;
  }

  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  console.log("orders counted", orderCount);
  console.log("top 15", sorted.slice(0, 15));
  console.log(
    "Unknown?",
    sorted.find((x) => /unknown/i.test(x[0]))
  );
  console.log(
    "DM-ish",
    sorted.filter((x) => /dm|general|staff/i.test(x[0]))
  );

  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
