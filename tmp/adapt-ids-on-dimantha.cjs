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

async function main() {
  const dimantha = await prisma.contactMaster.findUnique({
    where: { id: DIMANTHA_ID },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      address: true,
      city: true,
      district: true,
      phones: { select: { phoneNumber: true } },
    },
  });
  const john = await prisma.contactMaster.findUnique({
    where: { id: JOHN_ID },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      address: true,
      city: true,
      district: true,
    },
  });

  const rows = await prisma.adaptPurchaseHistory.findMany({
    where: { companyId: COMPANY_ID, contactId: DIMANTHA_ID },
    select: {
      id: true,
      salesInvoiceNo: true,
      invoiceDate: true,
      ttlAmount: true,
      locationName: true,
      merchantKnownName: true,
      adaptCustomerMasterId: true,
      origin: true,
    },
    orderBy: { invoiceDate: "asc" },
  });

  const ids = [...new Set(rows.map((r) => r.adaptCustomerMasterId).filter(Boolean))];
  const spread = [];
  for (const adaptId of ids) {
    const grouped = await prisma.adaptPurchaseHistory.groupBy({
      by: ["contactId"],
      where: { companyId: COMPANY_ID, adaptCustomerMasterId: adaptId },
      _count: { _all: true },
      _sum: { ttlAmount: true },
    });
    spread.push({
      adaptCustomerMasterId: adaptId,
      contacts: grouped.length,
      onDimantha: grouped.find((g) => g.contactId === DIMANTHA_ID)?._count._all ?? 0,
      otherContacts: grouped.filter((g) => g.contactId !== DIMANTHA_ID).length,
      otherContactSample: grouped
        .filter((g) => g.contactId !== DIMANTHA_ID)
        .slice(0, 3)
        .map((g) => ({ contactId: g.contactId, n: g._count._all })),
    });
  }

  const orders = {
    dimantha: await prisma.order.findMany({
      where: {
        companyId: COMPANY_ID,
        OR: [
          { customerPhone: { in: ["+94763520381", "0763520381", "94763520381", "763520381"] } },
          { erpnextCustomerId: "0763520381" },
        ],
      },
      select: {
        name: true,
        orderNumber: true,
        customerPhone: true,
        customerEmail: true,
        totalPrice: true,
        createdAt: true,
        sourceName: true,
        erpnextCustomerId: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    john: await prisma.order.findMany({
      where: {
        companyId: COMPANY_ID,
        OR: [
          { customerPhone: { in: ["0776169135", "+94776169135", "94776169135", "776169135"] } },
          { erpnextCustomerId: "0776169135" },
        ],
      },
      select: {
        name: true,
        orderNumber: true,
        customerPhone: true,
        customerEmail: true,
        totalPrice: true,
        createdAt: true,
        sourceName: true,
        erpnextCustomerId: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  };

  console.log(
    JSON.stringify(
      {
        dimantha,
        john,
        adaptCount: rows.length,
        adaptById: ids.map((adaptId) => {
          const subset = rows.filter((r) => r.adaptCustomerMasterId === adaptId);
          const sum = subset.reduce((a, r) => a + Number(r.ttlAmount), 0);
          return {
            adaptId,
            n: subset.length,
            sum,
            first: subset[0]?.invoiceDate,
            last: subset[subset.length - 1]?.invoiceDate,
            invoices: subset.map((r) => r.salesInvoiceNo),
            merchants: [...new Set(subset.map((r) => r.merchantKnownName))],
          };
        }),
        spread,
        orders,
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
