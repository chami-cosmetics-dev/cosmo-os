/**
 * Keep Adapt history on Dimantha / John only when the invoice phone is proven.
 * Unconfirmed Adapt rows go to a holding contact (no phone, no email).
 *
 *   node scripts/with-env.mjs cosmo-prod node tmp/keep-phone-confirmed-only.cjs --dry-run
 *   node scripts/with-env.mjs cosmo-prod node tmp/keep-phone-confirmed-only.cjs --apply
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: (process.env.DATABASE_URL || "").replace(
        /(ep-[^.]+)-pooler(\.[^/]+)/,
        "$1$2"
      ),
    },
  },
});

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
const DIMANTHA_ID = "cmpl4bqnz003tla04zpnq63lb";
const JOHN_ID = "cmsk2sf1r003yj80ao4fov2hk";
const apply = process.argv.includes("--apply");

const DIMANTHA_CONFIRMED = new Set([
  "1001739", // Adapt CSV customer_tp 0763520381
  "1002287", // Adapt CSV customer_tp 0763520381
  "4007066", // Adapt CSV: 60010792 on 0763520381 cancelled as "4007066 Replacement"
  "60013031", // Shopify order 13031 created contact with +94763520381
]);

function phoneVariants(raw) {
  const t = String(raw || "").trim();
  let d = t.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  const out = new Set();
  if (t) out.add(t);
  if (d) {
    out.add(d);
    if (d.length === 9) {
      out.add(`0${d}`);
      out.add(`94${d}`);
      out.add(`+94${d}`);
    }
    if (d.length === 10 && d.startsWith("0")) {
      out.add(d.slice(1));
      out.add(`94${d.slice(1)}`);
      out.add(`+94${d.slice(1)}`);
    }
    if (d.length === 11 && d.startsWith("94")) {
      out.add(`0${d.slice(2)}`);
      out.add(d.slice(2));
      out.add(`+${d}`);
    }
  }
  return [...out].filter(Boolean);
}

async function orderAgg(phones) {
  if (!phones.length) {
    return { orderCount: 0, totalSpent: 0, lastOrderAt: null, firstOrderAt: null };
  }
  const grouped = await prisma.order.groupBy({
    by: ["customerPhone"],
    where: { companyId: COMPANY_ID, customerPhone: { in: phones } },
    _count: { _all: true },
    _sum: { totalPrice: true },
    _max: { createdAt: true },
    _min: { createdAt: true },
  });
  let orderCount = 0;
  let totalSpent = 0;
  let lastOrderAt = null;
  let firstOrderAt = null;
  for (const row of grouped) {
    orderCount += row._count._all;
    totalSpent += Number(row._sum.totalPrice || 0);
    if (row._max.createdAt && (!lastOrderAt || row._max.createdAt > lastOrderAt)) {
      lastOrderAt = row._max.createdAt;
    }
    if (row._min.createdAt && (!firstOrderAt || row._min.createdAt < firstOrderAt)) {
      firstOrderAt = row._min.createdAt;
    }
  }
  return { orderCount, totalSpent, lastOrderAt, firstOrderAt };
}

async function adaptAgg(contactId) {
  const row = await prisma.adaptPurchaseHistory.aggregate({
    where: {
      companyId: COMPANY_ID,
      contactId,
      OR: [
        { financialStatus: null },
        { financialStatus: { notIn: ["voided", "void", "refunded", "refund"] } },
      ],
    },
    _count: { _all: true },
    _sum: { ttlAmount: true },
    _max: { invoiceDate: true },
    _min: { invoiceDate: true },
  });
  return {
    orderCount: row._count._all,
    totalSpent: Number(row._sum.ttlAmount || 0),
    lastOrderAt: row._max.invoiceDate,
    firstOrderAt: row._min.invoiceDate,
  };
}

function mergeSummary(order, adapt) {
  const last =
    [order.lastOrderAt, adapt.lastOrderAt].filter(Boolean).sort((a, b) => b - a)[0] ||
    null;
  const first =
    [order.firstOrderAt, adapt.firstOrderAt].filter(Boolean).sort((a, b) => a - b)[0] ||
    null;
  return {
    purchaseOrderCount: order.orderCount + adapt.orderCount,
    purchaseTotalValue: order.totalSpent + adapt.totalSpent,
    purchaseLastOrderAt: last,
    purchaseFirstOrderAt: first,
    lastPurchaseAt: last,
    orderOnly: order,
    adaptOnly: adapt,
  };
}

async function snapshot(id) {
  return prisma.contactMaster.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      lastPurchaseAt: true,
      purchaseOrderCount: true,
      purchaseTotalValue: true,
      _count: { select: { adaptPurchases: true } },
    },
  });
}

async function writeTotals(id, phones) {
  const summary = mergeSummary(await orderAgg(phones), await adaptAgg(id));
  await prisma.contactMaster.update({
    where: { id },
    data: {
      lastPurchaseAt: summary.lastPurchaseAt,
      purchaseOrderCount: summary.purchaseOrderCount,
      purchaseTotalValue: summary.purchaseTotalValue,
      purchaseLastOrderAt: summary.purchaseLastOrderAt,
      purchaseFirstOrderAt: summary.purchaseFirstOrderAt,
    },
  });
  return summary;
}

async function main() {
  const dimantha = await snapshot(DIMANTHA_ID);
  const john = await snapshot(JOHN_ID);
  if (!dimantha || dimantha.phoneNumber !== "+94763520381") {
    throw new Error("Dimantha card unexpected");
  }
  if (!john || john.phoneNumber !== "0776169135") {
    throw new Error("John card unexpected");
  }

  const onCards = await prisma.adaptPurchaseHistory.findMany({
    where: { companyId: COMPANY_ID, contactId: { in: [DIMANTHA_ID, JOHN_ID] } },
    select: {
      id: true,
      contactId: true,
      salesInvoiceNo: true,
      ttlAmount: true,
      invoiceDate: true,
      adaptCustomerMasterId: true,
    },
    orderBy: { invoiceDate: "asc" },
  });

  const keepDimantha = [];
  const keepJohn = [];
  const unconfirmed = [];
  for (const row of onCards) {
    const item = {
      id: row.id,
      from: row.contactId === JOHN_ID ? "john" : "dimantha",
      invoice: row.salesInvoiceNo,
      amount: Number(row.ttlAmount),
      date: row.invoiceDate,
      adaptCustomerMasterId: row.adaptCustomerMasterId,
    };
    if (DIMANTHA_CONFIRMED.has(row.salesInvoiceNo)) {
      keepDimantha.push(item);
      continue;
    }
    unconfirmed.push(item);
  }

  const plan = {
    mode: apply ? "apply" : "dry-run",
    keepDimanthaAdapt: keepDimantha,
    keepJohnAdapt: keepJohn,
    unconfirmedAdapt: unconfirmed,
    keepDimanthaSum: keepDimantha.reduce((a, r) => a + r.amount, 0),
    unconfirmedSum: unconfirmed.reduce((a, r) => a + r.amount, 0),
  };

  if (!apply) {
    const dimanthaOrders = await orderAgg(phoneVariants("+94763520381"));
    const johnOrders = await orderAgg(phoneVariants("0776169135"));
    plan.wouldBe = {
      dimantha: {
        cosmo: dimanthaOrders,
        adapt: {
          n: keepDimantha.length,
          sum: plan.keepDimanthaSum,
        },
        total: dimanthaOrders.totalSpent + plan.keepDimanthaSum,
      },
      john: {
        cosmo: johnOrders,
        adapt: { n: 0, sum: 0 },
        total: johnOrders.totalSpent,
      },
    };
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  let holding = await prisma.contactMaster.findFirst({
    where: {
      companyId: COMPANY_ID,
      name: "Unassigned Adapt (phone-unconfirmed split)",
      phoneNumber: null,
      email: null,
    },
    select: { id: true },
  });
  if (!holding) {
    holding = await prisma.contactMaster.create({
      data: {
        companyId: COMPANY_ID,
        name: "Unassigned Adapt (phone-unconfirmed split)",
        phoneNumber: null,
        email: null,
        source: "unmerge-phone",
      },
      select: { id: true },
    });
  }

  const moveToDimanthaIds = keepDimantha
    .filter((r) => r.from !== "dimantha")
    .map((r) => r.id);
  const moveToHoldingIds = unconfirmed.map((r) => r.id);

  if (moveToDimanthaIds.length) {
    await prisma.adaptPurchaseHistory.updateMany({
      where: { id: { in: moveToDimanthaIds } },
      data: { contactId: DIMANTHA_ID },
    });
  }
  if (moveToHoldingIds.length) {
    await prisma.adaptPurchaseHistory.updateMany({
      where: { id: { in: moveToHoldingIds } },
      data: { contactId: holding.id },
    });
  }

  const dimanthaSummary = await writeTotals(DIMANTHA_ID, phoneVariants("+94763520381"));
  const johnSummary = await writeTotals(JOHN_ID, phoneVariants("0776169135"));
  await writeTotals(holding.id, []);

  await prisma.auditLog.create({
    data: {
      companyId: COMPANY_ID,
      module: "contacts",
      action: "contact_merged",
      entityType: "ContactMaster",
      entityId: DIMANTHA_ID,
      summary:
        "Kept only phone-confirmed Adapt invoices on Dimantha / John; unconfirmed moved to holding",
      metadata: {
        dimanthaKeep: keepDimantha.map((r) => r.invoice),
        johnKeepAdapt: [],
        unconfirmedCount: unconfirmed.length,
        holdingContactId: holding.id,
      },
    },
  });

  plan.holdingContactId = holding.id;
  plan.dimanthaAfter = await snapshot(DIMANTHA_ID);
  plan.johnAfter = await snapshot(JOHN_ID);
  plan.dimanthaSummary = dimanthaSummary;
  plan.johnSummary = johnSummary;
  console.log(JSON.stringify(plan, null, 2));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
