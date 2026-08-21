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

// Copy of getMerchantCouponCode essentials
function getMerchantCouponCode(params) {
  const {
    sourceName,
    discountCodes,
    rawPayload,
    assignedMerchantCouponCodes,
    joinAllDiscountCodes = false,
  } = params;

  if (sourceName === "erpnext" || sourceName === "erpnext-pos") {
    if (rawPayload != null && typeof rawPayload === "object") {
      const payload =
        rawPayload.data != null && typeof rawPayload.data === "object" && !Array.isArray(rawPayload.data)
          ? rawPayload.data
          : rawPayload;
      const code = payload.merchant_coupon_code ?? payload.custom_merchant_coupon_code;
      if (typeof code === "string" && code.trim() && code.trim().toLowerCase() !== "none")
        return code.trim();
    }
    if (Array.isArray(discountCodes) && discountCodes.length > 0) {
      const merEntry = discountCodes.find((d) => {
        const c = typeof d?.code === "string" ? d.code.trim() : "";
        return c.toUpperCase().startsWith("MER");
      });
      if (merEntry && typeof merEntry.code === "string" && merEntry.code.trim())
        return merEntry.code.trim();
    }
    if (assignedMerchantCouponCodes) {
      const first = assignedMerchantCouponCodes.find((c) => c?.trim());
      if (first) return first.trim();
    }
    return null;
  }

  if (Array.isArray(discountCodes) && discountCodes.length > 0) {
    if (joinAllDiscountCodes) {
      const codes = discountCodes
        .map((discount, index) => {
          if (discount == null || typeof discount !== "object") return null;
          const code = discount.code;
          if (typeof code !== "string" || !code.trim()) return null;
          return { code: code.trim(), index };
        })
        .filter(Boolean)
        .sort((a, b) => {
          const aIsMerchant = a.code.toUpperCase().startsWith("MER");
          const bIsMerchant = b.code.toUpperCase().startsWith("MER");
          if (aIsMerchant !== bIsMerchant) return aIsMerchant ? -1 : 1;
          return a.index - b.index;
        })
        .map(({ code }) => code);
      if (codes.length > 0) return codes.join(",");
    }
  }

  if (assignedMerchantCouponCodes) {
    const first = assignedMerchantCouponCodes.find((c) => c?.trim());
    if (first) return first.trim();
  }
  return null;
}

function normalizeStatus(v) {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
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
        id: true,
        name: true,
        totalPrice: true,
        discountCodes: true,
        sourceName: true,
        rawPayload: true,
        assignedMerchantId: true,
        financialStatus: true,
        fulfillmentStatus: true,
        fulfillmentStage: true,
        assignedMerchant: {
          select: { id: true, knownName: true, name: true, email: true, couponCodes: true },
        },
      },
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

  const totals = new Map();
  const samples = new Map();
  for (const order of orders) {
    const financial = normalizeStatus(order.financialStatus);
    // loose eligible: skip cancelled-ish
    if (["voided", "refunded"].includes(financial)) continue;

    const merchantCouponCode = getMerchantCouponCode({
      sourceName: order.sourceName,
      discountCodes: order.discountCodes,
      rawPayload: order.rawPayload,
      assignedMerchantCouponCodes: order.assignedMerchant?.couponCodes ?? null,
      joinAllDiscountCodes: true,
    });
    const merchantCoupons = (merchantCouponCode ?? "")
      .split(",")
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean);

    let merchantId = null;
    let merchantName = null;
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
    if (!samples.has(merchantName)) samples.set(merchantName, []);
    const arr = samples.get(merchantName);
    if (arr.length < 5) {
      arr.push({
        id: order.id,
        name: order.name,
        source: order.sourceName,
        coupons: merchantCouponCode,
        assignedId: order.assignedMerchantId,
        assignedName: getUserDisplayName(order.assignedMerchant),
      });
    }
  }

  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  console.log("TOP", sorted.slice(0, 15));
  const unknown = sorted.filter(([n]) => /unknown/i.test(n) || !n || n.trim() === "");
  console.log("UNKNOWN-ISH", unknown);
  for (const [n] of unknown) {
    console.log("samples", n, samples.get(n));
  }
  // also print names that look like cuid
  const cuids = sorted.filter(([n]) => /^c[a-z0-9]{20,}$/i.test(n));
  console.log("CUID names", cuids.slice(0, 10));

  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
