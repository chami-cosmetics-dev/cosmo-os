/* eslint-disable no-console, @typescript-eslint/no-require-imports */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getDiscountCodes(order) {
  const saved = Array.isArray(order.discountCodes) ? order.discountCodes : [];
  const raw = Array.isArray(order.rawPayload?.discount_codes)
    ? order.rawPayload.discount_codes
    : [];

  return Array.from(
    new Set(
      [...saved, ...raw]
        .map((discount) =>
          typeof discount === "string" ? discount : discount?.code
        )
        .map(normalize)
        .filter(Boolean)
    )
  );
}

async function main() {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { couponCodes: { isEmpty: false } },
        { shopifyUserIds: { isEmpty: false } },
      ],
    },
    select: {
      id: true,
      companyId: true,
      couponCodes: true,
      shopifyUserIds: true,
    },
  });

  const couponMap = new Map();
  const shopifyUserMap = new Map();
  for (const user of users) {
    if (!user.companyId) continue;
    for (const code of user.couponCodes) {
      const normalized = normalize(code);
      if (normalized) couponMap.set(`${user.companyId}:${normalized}`, user.id);
    }
    for (const shopifyUserId of user.shopifyUserIds) {
      const normalized = String(shopifyUserId ?? "").trim();
      if (normalized) shopifyUserMap.set(`${user.companyId}:${normalized}`, user.id);
    }
  }

  const orders = await prisma.order.findMany({
    where: {
      sourceName: { not: "manual" },
      assignedMerchantId: { not: null },
      companyLocation: { defaultMerchantUserId: { not: null } },
    },
    select: {
      id: true,
      companyId: true,
      name: true,
      orderNumber: true,
      sourceName: true,
      shopifyUserId: true,
      assignedMerchantId: true,
      discountCodes: true,
      rawPayload: true,
      companyLocation: { select: { defaultMerchantUserId: true } },
    },
  });

  let scanned = 0;
  let cleared = 0;
  let kept = 0;
  const examples = [];

  for (const order of orders) {
    if (order.assignedMerchantId !== order.companyLocation.defaultMerchantUserId) {
      continue;
    }
    scanned += 1;

    const matchedByPos =
      order.sourceName?.toLowerCase() === "pos" &&
      order.shopifyUserId &&
      shopifyUserMap.get(`${order.companyId}:${order.shopifyUserId}`) ===
        order.assignedMerchantId;
    const matchedByCoupon = getDiscountCodes(order).some(
      (code) => couponMap.get(`${order.companyId}:${code}`) === order.assignedMerchantId
    );

    if (matchedByPos || matchedByCoupon) {
      kept += 1;
      continue;
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { assignedMerchantId: null },
    });
    cleared += 1;
    if (examples.length < 20) {
      examples.push(order.name ?? order.orderNumber ?? order.id);
    }
  }

  console.log(`Default-assigned Shopify orders scanned: ${scanned}`);
  console.log(`Kept because POS/coupon matched same merchant: ${kept}`);
  console.log(`Cleared default-only merchant assignments: ${cleared}`);
  if (examples.length > 0) {
    console.log("Cleared examples:");
    console.log(JSON.stringify(examples, null, 2));
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
