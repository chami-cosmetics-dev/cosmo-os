/**
 * Restore Adapt customer 23653 invoices onto Mr. John (except 60013031,
 * which stays on Dimantha — Shopify used +94763520381).
 *
 *   node scripts/with-env.mjs cosmo-prod node tmp/restore-john-adapt-23653.cjs --dry-run
 *   node scripts/with-env.mjs cosmo-prod node tmp/restore-john-adapt-23653.cjs --apply
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
const HOLDING_ID = "cmvj9s3jx0001wc08ltqscezq";
const ADAPT_ID = "23653";
const KEEP_ON_DIMANTHA = "60013031";
const apply = process.argv.includes("--apply");

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
  const john = await snapshot(JOHN_ID);
  const dimantha = await snapshot(DIMANTHA_ID);
  if (!john || john.phoneNumber !== "0776169135") throw new Error("John card unexpected");
  if (!dimantha || dimantha.phoneNumber !== "+94763520381") {
    throw new Error("Dimantha card unexpected");
  }

  const toRestore = await prisma.adaptPurchaseHistory.findMany({
    where: {
      companyId: COMPANY_ID,
      contactId: HOLDING_ID,
      adaptCustomerMasterId: ADAPT_ID,
      NOT: { salesInvoiceNo: KEEP_ON_DIMANTHA },
    },
    select: {
      id: true,
      salesInvoiceNo: true,
      ttlAmount: true,
      invoiceDate: true,
    },
    orderBy: { invoiceDate: "asc" },
  });

  const dimanthaKeep = await prisma.adaptPurchaseHistory.findMany({
    where: { companyId: COMPANY_ID, contactId: DIMANTHA_ID },
    select: { salesInvoiceNo: true, ttlAmount: true },
  });

  const plan = {
    mode: apply ? "apply" : "dry-run",
    restoreToJohn: toRestore.map((r) => ({
      invoice: r.salesInvoiceNo,
      amount: Number(r.ttlAmount),
      date: r.invoiceDate,
    })),
    restoreCount: toRestore.length,
    restoreSum: toRestore.reduce((a, r) => a + Number(r.ttlAmount), 0),
    stayOnDimantha: dimanthaKeep.map((r) => ({
      invoice: r.salesInvoiceNo,
      amount: Number(r.ttlAmount),
    })),
    johnBefore: john,
    dimanthaBefore: dimantha,
  };

  if (toRestore.length !== 18) {
    throw new Error(`Expected 18 Adapt 23653 rows on holding, found ${toRestore.length}`);
  }

  if (!apply) {
    const johnOrders = await orderAgg(phoneVariants("0776169135"));
    plan.johnWouldBe = {
      cosmo: johnOrders.totalSpent,
      adapt: plan.restoreSum,
      total: johnOrders.totalSpent + plan.restoreSum,
      orderCount: johnOrders.orderCount + toRestore.length,
    };
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  const moved = await prisma.adaptPurchaseHistory.updateMany({
    where: { id: { in: toRestore.map((r) => r.id) } },
    data: { contactId: JOHN_ID },
  });
  if (moved.count !== 18) throw new Error(`Moved ${moved.count}, expected 18`);

  const johnSummary = await writeTotals(JOHN_ID, phoneVariants("0776169135"));
  await writeTotals(HOLDING_ID, []);

  await prisma.auditLog.create({
    data: {
      companyId: COMPANY_ID,
      module: "contacts",
      action: "contact_merged",
      entityType: "ContactMaster",
      entityId: JOHN_ID,
      summary:
        "Restored 18 Adapt 23653 invoices onto Mr. John (early total); 60013031 stays on Dimantha",
      metadata: {
        invoices: toRestore.map((r) => r.salesInvoiceNo),
        total: plan.restoreSum,
      },
    },
  });

  plan.johnAfter = await snapshot(JOHN_ID);
  plan.johnSummary = johnSummary;
  plan.holdingAfter = await snapshot(HOLDING_ID);
  console.log(JSON.stringify(plan, null, 2));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
