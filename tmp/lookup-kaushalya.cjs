const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  const byPhone = await p.contactMaster.findMany({
    where: { phoneNumber: { contains: "768229455" } },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      lastPurchaseAt: true,
      city: true,
      address: true,
      companyId: true,
      assignedMerchant: true,
      updatedAt: true,
      phones: { select: { phoneNumber: true, isPrimary: true } },
    },
  });
  console.log("BY_PHONE", JSON.stringify(byPhone, null, 2));

  const byAliasPhone = await p.contactPhone.findMany({
    where: { phoneNumber: { contains: "768229455" } },
    include: {
      contact: {
        select: {
          id: true,
          name: true,
          phoneNumber: true,
          email: true,
          lastPurchaseAt: true,
          city: true,
          address: true,
          companyId: true,
          assignedMerchant: true,
        },
      },
    },
  });
  console.log("BY_ALIAS_PHONE", JSON.stringify(byAliasPhone, null, 2));

  const byNameEmail = await p.contactMaster.findMany({
    where: {
      AND: [
        { name: { contains: "kaushalya", mode: "insensitive" } },
        { email: { equals: "hpg.inoka@gmail.com", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      lastPurchaseAt: true,
      city: true,
      address: true,
      companyId: true,
      assignedMerchant: true,
      phones: { select: { phoneNumber: true, isPrimary: true } },
    },
    take: 30,
  });
  console.log("BY_NAME_EMAIL", JSON.stringify(byNameEmail, null, 2));

  const fromAlias = byAliasPhone.map((r) => r.contact);
  const targets = byPhone.length
    ? byPhone
    : fromAlias.length
      ? fromAlias
      : byNameEmail;
  for (const c of targets) {
    const digits = String(c.phoneNumber || "").replace(/\D/g, "");
    const variants = [
      ...new Set(
        [
          c.phoneNumber,
          digits,
          digits.slice(-9),
          "0" + digits.slice(-9),
          "+94" + digits.slice(-9),
          "94" + digits.slice(-9),
        ].filter(Boolean)
      ),
    ];
    console.log("\n===", c.id, c.name, "variants", variants);

    const ordersByPhone = await p.order.findMany({
      where: {
        companyId: c.companyId,
        customerPhone: { in: variants },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        createdAt: true,
        orderNumber: true,
        name: true,
        erpnextInvoiceId: true,
        totalPrice: true,
        cancelledAt: true,
        customerPhone: true,
        customerEmail: true,
        sourceName: true,
      },
    });
    console.log("ORDERS_BY_PHONE", ordersByPhone.length);
    console.log(JSON.stringify(ordersByPhone.slice(0, 15), null, 2));

    const ordersByEmail = c.email
      ? await p.order.findMany({
          where: {
            companyId: c.companyId,
            customerEmail: { equals: c.email, mode: "insensitive" },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            createdAt: true,
            orderNumber: true,
            erpnextInvoiceId: true,
            totalPrice: true,
            customerPhone: true,
            customerEmail: true,
            sourceName: true,
          },
        })
      : [];
    console.log("ORDERS_BY_EMAIL", ordersByEmail.length);
    console.log(JSON.stringify(ordersByEmail.slice(0, 10), null, 2));

    // Find what order has createdAt matching lastPurchaseAt
    if (c.lastPurchaseAt) {
      const around = await p.order.findMany({
        where: {
          companyId: c.companyId,
          createdAt: {
            gte: new Date(new Date(c.lastPurchaseAt).getTime() - 60_000),
            lte: new Date(new Date(c.lastPurchaseAt).getTime() + 60_000),
          },
        },
        take: 20,
        select: {
          id: true,
          createdAt: true,
          orderNumber: true,
          erpnextInvoiceId: true,
          customerPhone: true,
          customerEmail: true,
          customerName: true,
          sourceName: true,
          totalPrice: true,
        },
      });
      console.log(
        "ORDERS_NEAR_LAST_PURCHASE",
        c.lastPurchaseAt,
        around.length
      );
      console.log(JSON.stringify(around, null, 2));
    }

    const adapt = await p.adaptPurchaseHistory.findMany({
      where: { contactId: c.id },
      orderBy: { invoiceDate: "desc" },
      take: 10,
    });
    console.log("ADAPT", adapt.length, JSON.stringify(adapt, null, 2));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
