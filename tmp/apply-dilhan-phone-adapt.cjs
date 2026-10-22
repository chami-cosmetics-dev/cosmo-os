/**
 * Assign Adapt invoices from Dilhan_2026.10.22.xlsx by phone.
 * Sheet has Adapt only (no ERP rows). Cosmo/ERP stay phone-matched on Order.
 *
 *   node scripts/with-env.mjs cosmo-prod node tmp/apply-dilhan-phone-adapt.cjs --dry-run
 *   node scripts/with-env.mjs cosmo-prod node tmp/apply-dilhan-phone-adapt.cjs --apply
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
const apply = process.argv.includes("--apply");

const DIMANTHA_INV = new Set([
  "149487",
  "194616",
  "200920",
  "205271",
  "210760",
  "217579",
  "223887",
  "1001739",
  "1002287",
  "1003943",
  "1005119",
  "1008896",
  "4005508",
  "4007066",
  "5001244",
  "5004896",
  "5005904",
  "8003562",
]);

const JOHN_INV = new Set([
  "148078",
  "148505",
  "151707",
  "172589",
  "186682",
  "191240",
  "208539",
  "224861",
  "225456",
  "231676",
  "2002755",
  "4002659",
  "4003228",
  "4004624",
  "4005500",
  "5001126",
  "5001569",
  "5003289",
  "5004166",
  "5006122",
  "7001261",
  "8002504",
  "8003740",
  "8004668",
  "9001716",
  "9002924",
  "9003001",
  "60013031",
  "60016014",
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

function brief(row) {
  return {
    invoice: row.salesInvoiceNo,
    amount: Number(row.ttlAmount),
    date: row.invoiceDate,
    contactId: row.contactId,
    adaptCustomerMasterId: row.adaptCustomerMasterId,
  };
}

async function main() {
  const john = await snapshot(JOHN_ID);
  const dimantha = await snapshot(DIMANTHA_ID);
  if (!john || john.phoneNumber !== "0776169135") throw new Error("John card unexpected");
  if (!dimantha || dimantha.phoneNumber !== "+94763520381") {
    throw new Error("Dimantha card unexpected");
  }

  const wanted = [...DIMANTHA_INV, ...JOHN_INV];
  const found = await prisma.adaptPurchaseHistory.findMany({
    where: { companyId: COMPANY_ID, salesInvoiceNo: { in: wanted } },
    select: {
      id: true,
      contactId: true,
      salesInvoiceNo: true,
      ttlAmount: true,
      invoiceDate: true,
      adaptCustomerMasterId: true,
    },
  });
  const foundByNo = new Map(found.map((r) => [r.salesInvoiceNo, r]));

  const onCards = await prisma.adaptPurchaseHistory.findMany({
    where: { companyId: COMPANY_ID, contactId: { in: [JOHN_ID, DIMANTHA_ID] } },
    select: {
      id: true,
      contactId: true,
      salesInvoiceNo: true,
      ttlAmount: true,
      invoiceDate: true,
      adaptCustomerMasterId: true,
    },
  });

  const moveToDimantha = [];
  const moveToJohn = [];
  const missingDimantha = [];
  const missingJohn = [];

  for (const inv of DIMANTHA_INV) {
    const row = foundByNo.get(inv);
    if (!row) missingDimantha.push(inv);
    else if (row.contactId !== DIMANTHA_ID) moveToDimantha.push(row);
  }
  for (const inv of JOHN_INV) {
    const row = foundByNo.get(inv);
    if (!row) missingJohn.push(inv);
    else if (row.contactId !== JOHN_ID) moveToJohn.push(row);
  }

  const extrasToHolding = onCards.filter(
    (r) => !DIMANTHA_INV.has(r.salesInvoiceNo) && !JOHN_INV.has(r.salesInvoiceNo)
  );

  const plan = {
    mode: apply ? "apply" : "dry-run",
    source: "Dilhan_2026.10.22.xlsx sheet dILHAN — Adapt only, 47 rows",
    fileCounts: { dimantha: DIMANTHA_INV.size, john: JOHN_INV.size },
    moveToDimantha: moveToDimantha.map(brief),
    moveToJohn: moveToJohn.map(brief),
    extrasToHolding: extrasToHolding.map(brief),
    missingInCosmo: { dimantha: missingDimantha, john: missingJohn },
    johnBefore: john,
    dimanthaBefore: dimantha,
  };

  if (!apply) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  if (moveToDimantha.length) {
    await prisma.adaptPurchaseHistory.updateMany({
      where: { id: { in: moveToDimantha.map((r) => r.id) } },
      data: { contactId: DIMANTHA_ID },
    });
  }
  if (moveToJohn.length) {
    await prisma.adaptPurchaseHistory.updateMany({
      where: { id: { in: moveToJohn.map((r) => r.id) } },
      data: { contactId: JOHN_ID },
    });
  }
  if (extrasToHolding.length) {
    await prisma.adaptPurchaseHistory.updateMany({
      where: { id: { in: extrasToHolding.map((r) => r.id) } },
      data: { contactId: HOLDING_ID },
    });
  }

  const dimanthaSummary = await writeTotals(DIMANTHA_ID, phoneVariants("+94763520381"));
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
        "Assigned Adapt invoices from Dilhan_2026.10.22.xlsx by customer_phone",
      metadata: {
        toDimantha: moveToDimantha.map((r) => r.salesInvoiceNo),
        toJohn: moveToJohn.map((r) => r.salesInvoiceNo),
        extrasToHolding: extrasToHolding.map((r) => r.salesInvoiceNo),
        missingDimantha,
        missingJohn,
      },
    },
  });

  plan.dimanthaAfter = await snapshot(DIMANTHA_ID);
  plan.johnAfter = await snapshot(JOHN_ID);
  plan.dimanthaSummary = dimanthaSummary;
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
