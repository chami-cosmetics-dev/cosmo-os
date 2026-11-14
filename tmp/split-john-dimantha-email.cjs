/**
 * Split wrongly merged John / Dimantha Contact Master cards.
 *
 * John (0776169135) keeps johnck@gmail.com.
 * Dimantha (+94763520381) loses that email and Previous 0776169135.
 *
 *   node scripts/with-env.mjs cosmo-prod node tmp/split-john-dimantha-email.cjs --dry-run
 *   node scripts/with-env.mjs cosmo-prod node tmp/split-john-dimantha-email.cjs --apply
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
const EMAIL = "johnck@gmail.com";
const JOHN_PHONE = "0776169135";
const PREVIOUS_PHONE_ID = "cmscx8z3g0019jx04tdzcu4ox";
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
    if (d.length === 12 && d.startsWith("94") === false && t.startsWith("+")) {
      out.add(d);
    }
  }
  return [...out].filter(Boolean);
}

async function snapshot(id) {
  return prisma.contactMaster.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      source: true,
      loyaltyAssignedTier: true,
      lastPurchaseAt: true,
      purchaseOrderCount: true,
      purchaseTotalValue: true,
      purchaseLastOrderAt: true,
      emails: { select: { id: true, email: true } },
      phones: { select: { id: true, phoneNumber: true, isPrimary: true, createdAt: true } },
      _count: { select: { adaptPurchases: true } },
    },
  });
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
  const last = [order.lastOrderAt, adapt.lastOrderAt].filter(Boolean).sort((a, b) => b - a)[0] || null;
  const first = [order.firstOrderAt, adapt.firstOrderAt].filter(Boolean).sort((a, b) => a - b)[0] || null;
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

async function main() {
  const dimantha = await snapshot(DIMANTHA_ID);
  const john = await snapshot(JOHN_ID);
  if (!dimantha) throw new Error("Dimantha contact missing");
  if (!john) throw new Error("John contact missing");
  if (dimantha.phoneNumber !== "+94763520381") {
    throw new Error(`Dimantha phone unexpected: ${dimantha.phoneNumber}`);
  }
  if (String(dimantha.email || "").toLowerCase() !== EMAIL) {
    throw new Error(`Dimantha email unexpected: ${dimantha.email}`);
  }
  if (john.phoneNumber !== JOHN_PHONE) {
    throw new Error(`John phone unexpected: ${john.phoneNumber}`);
  }
  if (john.email) {
    throw new Error(`John already has email: ${john.email}`);
  }
  const previous = dimantha.phones.find((p) => p.id === PREVIOUS_PHONE_ID);
  if (!previous || previous.phoneNumber !== JOHN_PHONE) {
    throw new Error("Previous 0776169135 row missing on Dimantha");
  }

  const dimanthaPhones = phoneVariants(dimantha.phoneNumber);
  const johnPhones = phoneVariants(JOHN_PHONE);
  const dimanthaSummary = mergeSummary(
    await orderAgg(dimanthaPhones),
    await adaptAgg(DIMANTHA_ID)
  );
  const johnSummary = mergeSummary(await orderAgg(johnPhones), await adaptAgg(JOHN_ID));

  const plan = {
    mode: apply ? "apply" : "dry-run",
    dimanthaBefore: dimantha,
    johnBefore: john,
    after: {
      dimantha: {
        id: DIMANTHA_ID,
        name: dimantha.name,
        phoneNumber: dimantha.phoneNumber,
        email: null,
        previousPhoneRemoved: JOHN_PHONE,
        ...dimanthaSummary,
      },
      john: {
        id: JOHN_ID,
        name: john.name,
        phoneNumber: JOHN_PHONE,
        email: EMAIL,
        ...johnSummary,
      },
    },
  };

  if (!apply) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.contactPhone.delete({ where: { id: PREVIOUS_PHONE_ID } });
    await tx.contactEmail.deleteMany({
      where: {
        contactId: DIMANTHA_ID,
        email: { equals: EMAIL, mode: "insensitive" },
      },
    });
    await tx.contactMaster.update({
      where: { id: DIMANTHA_ID },
      data: {
        email: null,
        emailUpdatedAt: new Date(),
        lastPurchaseAt: dimanthaSummary.lastPurchaseAt,
        purchaseOrderCount: dimanthaSummary.purchaseOrderCount,
        purchaseTotalValue: dimanthaSummary.purchaseTotalValue,
        purchaseLastOrderAt: dimanthaSummary.purchaseLastOrderAt,
        purchaseFirstOrderAt: dimanthaSummary.purchaseFirstOrderAt,
      },
    });
    await tx.contactMaster.update({
      where: { id: JOHN_ID },
      data: {
        email: EMAIL,
        emailUpdatedAt: new Date(),
        lastPurchaseAt: johnSummary.lastPurchaseAt ?? john.lastPurchaseAt,
        purchaseOrderCount: johnSummary.purchaseOrderCount,
        purchaseTotalValue: johnSummary.purchaseTotalValue,
        purchaseLastOrderAt: johnSummary.purchaseLastOrderAt,
        purchaseFirstOrderAt: johnSummary.purchaseFirstOrderAt,
      },
    });
    await tx.auditLog.create({
      data: {
        companyId: COMPANY_ID,
        module: "contacts",
        action: "contact_merged",
        entityType: "ContactMaster",
        entityId: DIMANTHA_ID,
        summary:
          "Split Previous 0776169135 and johnck@gmail.com off Dimantha Abeywardana onto Mr. John",
        beforeData: {
          name: dimantha.name,
          email: dimantha.email,
          phoneNumber: dimantha.phoneNumber,
          previousPhone: JOHN_PHONE,
        },
        afterData: {
          email: null,
          phoneNumber: dimantha.phoneNumber,
          previousPhone: null,
        },
        metadata: {
          reason: "shared_email_false_merge",
          movedEmailToContactId: JOHN_ID,
          detachedPhone: JOHN_PHONE,
        },
      },
    });
    await tx.auditLog.create({
      data: {
        companyId: COMPANY_ID,
        module: "contacts",
        action: "contact_email_cleared",
        entityType: "ContactMaster",
        entityId: JOHN_ID,
        summary: "Set johnck@gmail.com on Mr. John after split from Dimantha Abeywardana",
        beforeData: { email: john.email, phoneNumber: john.phoneNumber },
        afterData: { email: EMAIL, phoneNumber: JOHN_PHONE },
        metadata: {
          reason: "shared_email_false_merge",
          takenFromContactId: DIMANTHA_ID,
        },
      },
    });
  });

  plan.dimanthaAfter = await snapshot(DIMANTHA_ID);
  plan.johnAfter = await snapshot(JOHN_ID);
  console.log(JSON.stringify(plan, null, 2));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
