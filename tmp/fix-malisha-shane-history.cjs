/**
 * Finish the two skipped ERP phones with purchase history.
 * Malisha: keep 0701797374 contact, move Adapt invoice from the 071 card, add 071 as Previous.
 * Shane: already created + Cosmo/ERP order; no POS email attach.
 */
const { PrismaClient } = require("@prisma/client");
const raw = process.env.DATABASE_URL || "";
const prisma = new PrismaClient({
  datasources: { db: { url: raw.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || raw } },
});

const MALISHA_070 = "cmplzwk1n001njy049q1ddujb";
const MALISHA_071 = "cmseiad592dc9wcygs4nya7rg";
const SHANE = "cmst1pscs0001wcn0k5vw8mw5";

async function main() {
  const old = await prisma.contactMaster.findUnique({
    where: { id: MALISHA_071 },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      lastPurchaseAt: true,
      emails: { select: { id: true, email: true } },
      phones: { select: { id: true, phoneNumber: true } },
      _count: { select: { adaptPurchases: true } },
    },
  });
  const neu = await prisma.contactMaster.findUnique({
    where: { id: MALISHA_070 },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      lastPurchaseAt: true,
    },
  });
  const shane = await prisma.contactMaster.findUnique({
    where: { id: SHANE },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      lastPurchaseAt: true,
    },
  });
  const shaneOrders = await prisma.order.findMany({
    where: { customerPhone: "0740332575" },
    select: { name: true, erpnextInvoiceId: true, totalPrice: true, createdAt: true },
  });

  if (!neu || neu.phoneNumber !== "0701797374") {
    throw new Error("Malisha 070 contact missing or phone not set");
  }
  if (!old || old.phoneNumber !== "0713909515") {
    throw new Error("Malisha 071 contact missing or unexpected phone");
  }

  const moved = await prisma.adaptPurchaseHistory.updateMany({
    where: { contactId: MALISHA_071 },
    data: { contactId: MALISHA_070 },
  });

  const existingPrev = await prisma.contactPhone.findFirst({
    where: { contactId: MALISHA_070, phoneNumber: "0713909515" },
    select: { id: true },
  });
  if (!existingPrev) {
    await prisma.contactPhone.create({
      data: {
        contactId: MALISHA_070,
        phoneNumber: "0713909515",
        isPrimary: false,
      },
    });
  }

  await prisma.contactMaster.update({
    where: { id: MALISHA_070 },
    data: {
      lastPurchaseAt: old.lastPurchaseAt ?? new Date("2020-10-20T18:30:00.000Z"),
    },
  });

  await prisma.contactEmail.deleteMany({ where: { contactId: MALISHA_071 } });
  await prisma.contactPhone.deleteMany({ where: { contactId: MALISHA_071 } });
  await prisma.contactMaster.update({
    where: { id: MALISHA_071 },
    data: { phoneNumber: null, email: null },
  });

  const after070 = await prisma.contactMaster.findUnique({
    where: { id: MALISHA_070 },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      lastPurchaseAt: true,
      phones: { select: { phoneNumber: true, isPrimary: true } },
      _count: { select: { adaptPurchases: true } },
    },
  });
  const after071 = await prisma.contactMaster.findUnique({
    where: { id: MALISHA_071 },
    select: { id: true, name: true, phoneNumber: true, email: true },
  });

  console.log(
    JSON.stringify(
      {
        malishaBefore: { old, neu },
        adaptRowsMoved: moved.count,
        malishaAfter: after070,
        malishaOldStripped: after071,
        shane,
        shaneOrders,
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
