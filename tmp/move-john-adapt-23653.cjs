/**
 * Move Adapt customer 23653 (19 invoices, John's web/store basket) from
 * Dimantha's card onto Mr. John.
 *
 *   node scripts/with-env.mjs cosmo-prod node tmp/move-john-adapt-23653.cjs --dry-run
 *   node scripts/with-env.mjs cosmo-prod node tmp/move-john-adapt-23653.cjs --apply
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
const ADAPT_ID = "23653";
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

async function main() {
  const dimantha = await snapshot(DIMANTHA_ID);
  const john = await snapshot(JOHN_ID);
  if (!dimantha || dimantha.phoneNumber !== "+94763520381") {
    throw new Error("Dimantha card unexpected");
  }
  if (!john || john.phoneNumber !== "0776169135") {
    throw new Error("John card unexpected");
  }

  const toMove = await prisma.adaptPurchaseHistory.findMany({
    where: {
      companyId: COMPANY_ID,
      contactId: DIMANTHA_ID,
      adaptCustomerMasterId: ADAPT_ID,
    },
    select: {
      id: true,
      salesInvoiceNo: true,
      invoiceDate: true,
      ttlAmount: true,
    },
    orderBy: { invoiceDate: "asc" },
  });
  if (toMove.length !== 19) {
    throw new Error(`Expected 19 Adapt 23653 rows on Dimantha, found ${toMove.length}`);
  }
  const otherOwners = await prisma.adaptPurchaseHistory.count({
    where: {
      companyId: COMPANY_ID,
      adaptCustomerMasterId: ADAPT_ID,
      contactId: { not: DIMANTHA_ID },
    },
  });
  if (otherOwners !== 0) {
    throw new Error("Adapt 23653 already on another contact");
  }

  const moveSum = toMove.reduce((a, r) => a + Number(r.ttlAmount), 0);

  if (apply) {
    const moved = await prisma.adaptPurchaseHistory.updateMany({
      where: {
        companyId: COMPANY_ID,
        contactId: DIMANTHA_ID,
        adaptCustomerMasterId: ADAPT_ID,
      },
      data: { contactId: JOHN_ID },
    });
    if (moved.count !== 19) {
      throw new Error(`Moved ${moved.count}, expected 19`);
    }
  }

  const dimanthaSummary = mergeSummary(
    await orderAgg(phoneVariants("+94763520381")),
    await adaptAgg(DIMANTHA_ID)
  );
  const johnSummary = mergeSummary(
    await orderAgg(phoneVariants("0776169135")),
    await adaptAgg(JOHN_ID)
  );

  if (apply) {
    await prisma.$transaction([
      prisma.contactMaster.update({
        where: { id: DIMANTHA_ID },
        data: {
          lastPurchaseAt: dimanthaSummary.lastPurchaseAt,
          purchaseOrderCount: dimanthaSummary.purchaseOrderCount,
          purchaseTotalValue: dimanthaSummary.purchaseTotalValue,
          purchaseLastOrderAt: dimanthaSummary.purchaseLastOrderAt,
          purchaseFirstOrderAt: dimanthaSummary.purchaseFirstOrderAt,
        },
      }),
      prisma.contactMaster.update({
        where: { id: JOHN_ID },
        data: {
          lastPurchaseAt: johnSummary.lastPurchaseAt,
          purchaseOrderCount: johnSummary.purchaseOrderCount,
          purchaseTotalValue: johnSummary.purchaseTotalValue,
          purchaseLastOrderAt: johnSummary.purchaseLastOrderAt,
          purchaseFirstOrderAt: johnSummary.purchaseFirstOrderAt,
        },
      }),
      prisma.auditLog.create({
        data: {
          companyId: COMPANY_ID,
          module: "contacts",
          action: "contact_merged",
          entityType: "ContactMaster",
          entityId: JOHN_ID,
          summary:
            "Moved 19 Adapt invoices (customer 23653, incl. 60013031/60016014) from Dimantha Abeywardana onto Mr. John",
          beforeData: { adaptCustomerMasterId: ADAPT_ID, fromContactId: DIMANTHA_ID },
          afterData: { invoiceCount: 19, total: moveSum, toContactId: JOHN_ID },
          metadata: {
            reason: "split_john_dimantha_adapt",
            invoices: toMove.map((r) => r.salesInvoiceNo),
          },
        },
      }),
    ]);
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        moving: {
          adaptCustomerMasterId: ADAPT_ID,
          count: toMove.length,
          total: moveSum,
          invoices: toMove.map((r) => r.salesInvoiceNo),
        },
        dimanthaBefore: dimantha,
        johnBefore: john,
        dimanthaAfter: apply ? await snapshot(DIMANTHA_ID) : dimanthaSummary,
        johnAfter: apply ? await snapshot(JOHN_ID) : johnSummary,
      },
      null,
      2
    )
  );
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
