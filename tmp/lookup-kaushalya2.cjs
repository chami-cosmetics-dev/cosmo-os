const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

const CONTACT_ID = "cmsepvn6b45exwcygkom8umpf";
const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";

async function main() {
  const contact = await p.contactMaster.findUnique({
    where: { id: CONTACT_ID },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      lastPurchaseAt: true,
      updatedAt: true,
      createdAt: true,
    },
  });
  console.log("CONTACT", contact);

  // All Cosmo orders that could feed history (phone variants)
  const phoneVariants = [
    "0768229455",
    "768229455",
    "+94768229455",
    "94768229455",
  ];
  const phoneOrders = await p.order.findMany({
    where: {
      companyId: COMPANY_ID,
      OR: [
        { customerPhone: { in: phoneVariants } },
        { erpnextCustomerId: { in: phoneVariants } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      name: true,
      orderNumber: true,
      erpnextInvoiceId: true,
      totalPrice: true,
      cancelledAt: true,
      financialStatus: true,
      fulfillmentStage: true,
      customerPhone: true,
      customerEmail: true,
      sourceName: true,
    },
  });
  console.log("PHONE_ORDERS", phoneOrders.length, JSON.stringify(phoneOrders, null, 2));

  const adapt = await p.adaptPurchaseHistory.findMany({
    where: { contactId: CONTACT_ID },
    orderBy: { invoiceDate: "desc" },
    select: {
      id: true,
      invoiceDate: true,
      salesInvoiceNo: true,
      ttlAmount: true,
      phone: true,
      email: true,
    },
  });
  console.log("ADAPT", adapt.length, JSON.stringify(adapt, null, 2));

  // The 7/22 shared-email order
  const july22 = await p.order.findUnique({
    where: { id: "cmrvznovs000zk004xsan7uev" },
    select: {
      id: true,
      createdAt: true,
      name: true,
      orderNumber: true,
      erpnextInvoiceId: true,
      totalPrice: true,
      customerPhone: true,
      customerEmail: true,
      sourceName: true,
      shippingAddress: true,
    },
  });
  console.log("JULY22_ORDER", july22);

  // How many contacts share lastPurchaseAt exactly equal to that order time?
  const polluted = await p.contactMaster.count({
    where: {
      companyId: COMPANY_ID,
      lastPurchaseAt: new Date("2026-07-22T11:17:53.000Z"),
      email: { equals: "hpg.inoka@gmail.com", mode: "insensitive" },
    },
  });
  console.log("CONTACTS_WITH_JULY22_LAST_PURCHASE_AND_EMAIL", polluted);

  const emailContacts = await p.contactMaster.count({
    where: {
      companyId: COMPANY_ID,
      email: { equals: "hpg.inoka@gmail.com", mode: "insensitive" },
    },
  });
  console.log("TOTAL_CONTACTS_WITH_HPG_INOKA_EMAIL", emailContacts);

  // Audit / allocation? Check if ContactMasterHistory or similar exists - skip
  // Sum lifetime from phone orders + adapt
  const phoneSum = phoneOrders.reduce((s, o) => s + Number(o.totalPrice || 0), 0);
  const adaptSum = adapt.reduce((s, a) => s + Number(a.ttlAmount || 0), 0);
  console.log("SUMS", {
    phoneOrders: phoneOrders.length,
    phoneSum,
    adaptRows: adapt.length,
    adaptSum,
    combined: phoneSum + adaptSum,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
