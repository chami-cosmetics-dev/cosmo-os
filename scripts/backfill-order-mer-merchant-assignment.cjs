/* eslint-disable no-console, @typescript-eslint/no-require-imports */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function normalizeDepartmentName(name) {
  return String(name ?? "").toLowerCase().replace(/[^a-z]/g, "");
}

function isEligibleDepartment(name) {
  return new Set(["digitalmarketing", "salesmarketing", "salsemarketing"]).has(
    normalizeDepartmentName(name)
  );
}

function normalizeCode(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getOrderDiscountCodes(order) {
  const fromSaved = Array.isArray(order.discountCodes)
    ? order.discountCodes
    : [];
  const fromRaw = Array.isArray(order.rawPayload?.discount_codes)
    ? order.rawPayload.discount_codes
    : [];

  const codes = [];
  for (const discount of [...fromSaved, ...fromRaw]) {
    if (typeof discount === "string") {
      codes.push(discount);
    } else if (discount && typeof discount === "object" && "code" in discount) {
      codes.push(discount.code);
    }
  }

  return Array.from(new Set(codes.map(normalizeCode).filter(Boolean)));
}

async function main() {
  const merchants = await prisma.user.findMany({
    where: {
      couponCodes: { isEmpty: false },
    },
    select: {
      id: true,
      companyId: true,
      name: true,
      email: true,
      couponCodes: true,
      employeeProfile: {
        select: {
          department: { select: { name: true } },
        },
      },
    },
  });

  const codeMap = new Map();
  const ambiguousCodes = new Map();
  const eligibleMerchants = merchants.filter((merchant) =>
    isEligibleDepartment(merchant.employeeProfile?.department?.name)
  );
  for (const merchant of eligibleMerchants) {
    for (const rawCode of merchant.couponCodes) {
      const code = normalizeCode(rawCode);
      if (!code || !merchant.companyId) continue;
      const key = `${merchant.companyId}:${code}`;
      const existing = codeMap.get(key);
      if (existing && existing.id !== merchant.id) {
        ambiguousCodes.set(key, [existing, merchant]);
        codeMap.delete(key);
        continue;
      }
      if (ambiguousCodes.has(key)) continue;
      codeMap.set(key, merchant);
    }
  }

  const orders = await prisma.order.findMany({
    where: {
      sourceName: { not: "manual" },
    },
    select: {
      id: true,
      companyId: true,
      name: true,
      orderNumber: true,
      assignedMerchantId: true,
      discountCodes: true,
      rawPayload: true,
    },
    orderBy: { createdAt: "asc" },
  });

  let scanned = 0;
  let matched = 0;
  let updated = 0;
  let alreadyCorrect = 0;
  let ambiguous = 0;
  const examples = [];

  for (const order of orders) {
    const codes = getOrderDiscountCodes(order);
    if (codes.length === 0) continue;
    scanned += 1;

    const ambiguousMatch = codes.find((code) => ambiguousCodes.has(`${order.companyId}:${code}`));
    if (ambiguousMatch) {
      ambiguous += 1;
      continue;
    }

    const merchant = codes
      .map((code) => codeMap.get(`${order.companyId}:${code}`))
      .find(Boolean);
    if (!merchant) continue;
    matched += 1;

    if (order.assignedMerchantId === merchant.id) {
      alreadyCorrect += 1;
      continue;
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { assignedMerchantId: merchant.id },
    });
    updated += 1;

    if (examples.length < 20) {
      examples.push({
        order: order.name ?? order.orderNumber ?? order.id,
        codes,
        merchant: merchant.name ?? merchant.email ?? merchant.id,
      });
    }
  }

  console.log(`Coupon/MER-coded merchants: ${merchants.length}`);
  console.log(`Eligible coupon/MER-coded merchants: ${eligibleMerchants.length}`);
  console.log(`Unique usable codes: ${codeMap.size}`);
  console.log(`Ambiguous duplicate codes skipped: ${ambiguousCodes.size}`);
  console.log(`Orders scanned with discount codes: ${scanned}`);
  console.log(`Orders matched to a merchant: ${matched}`);
  console.log(`Orders already correct: ${alreadyCorrect}`);
  console.log(`Orders updated: ${updated}`);
  console.log(`Orders skipped due ambiguous code: ${ambiguous}`);
  if (examples.length > 0) {
    console.log("Updated examples:");
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
