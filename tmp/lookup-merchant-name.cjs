const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

const CONTACT_ID = "cmsepvn6b45exwcygkom8umpf";
const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
const PHONE = "0768229455";

async function main() {
  const contact = await p.contactMaster.findUnique({
    where: { id: CONTACT_ID },
    include: {
      emails: true,
      phones: true,
      adaptPurchases: {
        orderBy: { invoiceDate: "desc" },
        take: 20,
      },
    },
  });
  console.log(
    "CONTACT",
    JSON.stringify(
      {
        id: contact?.id,
        name: contact?.name,
        phoneNumber: contact?.phoneNumber,
        email: contact?.email,
        source: contact?.source,
        origin: contact?.origin,
        assignedMerchant: contact?.assignedMerchant,
        recentMerchant: contact?.recentMerchant,
        lastPurchaseAt: contact?.lastPurchaseAt,
        createdAt: contact?.createdAt,
        updatedAt: contact?.updatedAt,
        city: contact?.city,
        address: contact?.address,
        emails: contact?.emails,
        phones: contact?.phones,
        adaptCount: contact?.adaptPurchases?.length,
        adapt: contact?.adaptPurchases?.map((a) => ({
          salesInvoiceNo: a.salesInvoiceNo,
          invoiceDate: a.invoiceDate,
          ttlAmount: a.ttlAmount,
          merchantKnownName: a.merchantKnownName,
          locationName: a.locationName,
        })),
      },
      null,
      2
    )
  );

  // Users/merchants named kaushalya or with this phone/email
  const users = await p.user.findMany({
    where: {
      OR: [
        { name: { contains: "kaushalya", mode: "insensitive" } },
        { email: { contains: "hpg.inoka", mode: "insensitive" } },
        { email: { contains: "inoka", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      merCode: true,
      companyId: true,
    },
    take: 30,
  });
  console.log("USERS", JSON.stringify(users, null, 2));

  // Company members with merchant role named kaushalya / inoka
  const members = await p.companyMember.findMany({
    where: {
      companyId: COMPANY_ID,
      OR: [
        { user: { name: { contains: "kaushalya", mode: "insensitive" } } },
        { user: { email: { contains: "inoka", mode: "insensitive" } } },
        { user: { phoneNumber: { contains: "768229455" } } },
      ],
    },
    select: {
      id: true,
      role: true,
      merCode: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phoneNumber: true,
          merCode: true,
        },
      },
    },
    take: 20,
  });
  console.log("MEMBERS", JSON.stringify(members, null, 2));

  // Orders with this phone — who named them?
  const orders = await p.order.findMany({
    where: {
      companyId: COMPANY_ID,
      OR: [
        { customerPhone: { contains: "768229455" } },
        { erpnextCustomerId: { contains: "768229455" } },
      ],
    },
    select: {
      id: true,
      createdAt: true,
      name: true,
      erpnextInvoiceId: true,
      customerPhone: true,
      customerEmail: true,
      sourceName: true,
      shippingAddress: true,
      billingAddress: true,
      assignedMerchant: { select: { name: true, merCode: true } },
      rawPayload: true,
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  console.log(
    "ORDERS",
    JSON.stringify(
      orders.map((o) => ({
        ...o,
        rawPayloadKeys:
          o.rawPayload && typeof o.rawPayload === "object"
            ? Object.keys(o.rawPayload)
            : null,
        customer_name_guess: guessName(o),
        rawPayload: undefined,
      })),
      null,
      2
    )
  );

  // How many contacts assigned to Ishadi with hpg.inoka email?
  const hpgCount = await p.contactMaster.count({
    where: {
      companyId: COMPANY_ID,
      email: { equals: "hpg.inoka@gmail.com", mode: "insensitive" },
    },
  });
  console.log("HPG_INOKA_CONTACT_COUNT", hpgCount);

  // Contacts with name like merchant and this pattern
  const merchantish = await p.contactMaster.findMany({
    where: {
      companyId: COMPANY_ID,
      OR: [
        { name: { equals: "Ms- kaushalya", mode: "insensitive" } },
        { name: { equals: "Ms kaushalya", mode: "insensitive" } },
        { name: { equals: "MS KAUSHALYA", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      assignedMerchant: true,
      source: true,
      createdAt: true,
      lastPurchaseAt: true,
    },
    take: 50,
  });
  console.log("MERCHANT_NAME_CONTACTS", JSON.stringify(merchantish, null, 2));
}

function guessName(o) {
  const ship = o.shippingAddress;
  const bill = o.billingAddress;
  if (ship && typeof ship === "object") {
    return ship.name || [ship.first_name, ship.last_name].filter(Boolean).join(" ");
  }
  if (bill && typeof bill === "object") {
    return bill.name || [bill.first_name, bill.last_name].filter(Boolean).join(" ");
  }
  return null;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
