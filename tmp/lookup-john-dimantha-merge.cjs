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
const IDS = [
  "cmpl4bqnz003tla04zpnq63lb",
  "cmsk2sf1r003yj80ao4fov2hk",
  "cmscx8z3g0019jx04tdzcu4ox",
];
const PHONES = [
  "0776169135",
  "776169135",
  "+94776169135",
  "94776169135",
  "0763520381",
  "763520381",
  "+94763520381",
  "94763520381",
];

async function main() {
  const contacts = await prisma.contactMaster.findMany({
    where: {
      companyId: COMPANY_ID,
      OR: [
        { id: { in: IDS } },
        { phoneNumber: { in: PHONES } },
        { email: { equals: "johnck@gmail.com", mode: "insensitive" } },
        { emails: { some: { email: { equals: "johnck@gmail.com", mode: "insensitive" } } } },
        { phones: { some: { phoneNumber: { in: PHONES } } } },
        { name: { contains: "Dimantha", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      source: true,
      assignedMerchant: true,
      recentMerchant: true,
      loyaltyAssignedTier: true,
      lastPurchaseAt: true,
      purchaseOrderCount: true,
      purchaseTotalValue: true,
      createdAt: true,
      updatedAt: true,
      emails: { select: { id: true, email: true, isPrimary: true, createdAt: true } },
      phones: {
        select: { id: true, phoneNumber: true, isPrimary: true, createdAt: true },
      },
      _count: { select: { adaptPurchases: true } },
    },
  });

  const contactIds = contacts.map((c) => c.id);
  const audit = await prisma.auditLog.findMany({
    where: {
      companyId: COMPANY_ID,
      OR: [
        { entityId: { in: [...contactIds, ...IDS] } },
        { summary: { contains: "johnck", mode: "insensitive" } },
        { summary: { contains: "0776169135" } },
        { summary: { contains: "0763520381" } },
        { summary: { contains: "94763520381" } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 80,
    select: {
      id: true,
      action: true,
      summary: true,
      entityId: true,
      actorUserId: true,
      createdAt: true,
      beforeData: true,
      afterData: true,
      metadata: true,
    },
  });

  const orders = await prisma.order.findMany({
    where: {
      companyId: COMPANY_ID,
      OR: [
        { customerEmail: { equals: "johnck@gmail.com", mode: "insensitive" } },
        { customerPhone: { in: PHONES } },
        { erpnextCustomerId: { in: ["0776169135", "0763520381"] } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 80,
    select: {
      id: true,
      orderNumber: true,
      name: true,
      customerEmail: true,
      customerPhone: true,
      totalPrice: true,
      financialStatus: true,
      createdAt: true,
      erpnextCustomerId: true,
      sourceName: true,
      shippingAddress: true,
    },
  });

  const adapt = contactIds.length
    ? await prisma.adaptPurchaseHistory.findMany({
        where: { companyId: COMPANY_ID, contactId: { in: contactIds } },
        orderBy: { invoiceDate: "asc" },
        take: 80,
        select: {
          id: true,
          contactId: true,
          salesInvoiceNo: true,
          invoiceDate: true,
          ttlAmount: true,
          locationName: true,
          adaptCustomerMasterId: true,
          merchantKnownName: true,
          origin: true,
        },
      })
    : [];

  const adaptByCustomer = await prisma.adaptPurchaseHistory.groupBy({
    by: ["contactId", "adaptCustomerMasterId"],
    where: { companyId: COMPANY_ID, contactId: { in: contactIds } },
    _count: { _all: true },
    _sum: { ttlAmount: true },
  });

  console.log(
    JSON.stringify(
      {
        contacts,
        auditCount: audit.length,
        audit,
        orders,
        adaptSample: adapt.slice(0, 15),
        adaptByCustomer,
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
