const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

const CONTACT_ID = "cmsepvn6b45exwcygkom8umpf";
const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";

async function main() {
  const users = await p.user.findMany({
    where: {
      OR: [
        { name: { contains: "kaushalya", mode: "insensitive" } },
        { knownName: { contains: "kaushalya", mode: "insensitive" } },
        { email: { contains: "hpg.inoka", mode: "insensitive" } },
        { email: { contains: "inoka", mode: "insensitive" } },
        { mobile: { contains: "768229455" } },
      ],
    },
    select: {
      id: true,
      name: true,
      knownName: true,
      email: true,
      mobile: true,
      companyId: true,
      couponCodes: true,
    },
    take: 40,
  });
  console.log("USERS", JSON.stringify(users, null, 2));

  const hpgCount = await p.contactMaster.count({
    where: {
      companyId: COMPANY_ID,
      email: { equals: "hpg.inoka@gmail.com", mode: "insensitive" },
    },
  });
  console.log("HPG_INOKA_CONTACT_COUNT", hpgCount);

  const order = await p.order.findFirst({
    where: { erpnextInvoiceId: "400-000315" },
    select: {
      id: true,
      createdAt: true,
      customerPhone: true,
      customerEmail: true,
      sourceName: true,
      shippingAddress: true,
      billingAddress: true,
      rawPayload: true,
      assignedMerchant: { select: { name: true, knownName: true } },
    },
  });
  console.log(
    "POS_ORDER",
    JSON.stringify(
      {
        ...order,
        rawSnippet:
          order?.rawPayload && typeof order.rawPayload === "object"
            ? summarizeRaw(order.rawPayload)
            : null,
        rawPayload: undefined,
      },
      null,
      2
    )
  );
}

function summarizeRaw(raw) {
  const r = raw;
  return {
    customer: r.customer,
    customer_name: r.customer_name,
    customer_name2: r.customer_name,
    mobile_no: r.mobile_no,
    contact_mobile: r.contact_mobile,
    posting_date: r.posting_date,
    name: r.name,
    owner: r.owner,
    company: r.company,
  };
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
