const { PrismaClient } = require("@prisma/client");
const url = process.env.DATABASE_URL || "";
const p = new PrismaClient({
  datasources: { db: { url: url.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || url } },
});
const ids = ["cms8tkvdd004ejy04nkwtd7wz", "cmtr4wdyi0005l2041zqbekpi"];
const COMPANY = "cmp5k145c006irlhemjfidlb5";
(async () => {
  for (const id of ids) {
    const c = await p.contactMaster.findUnique({
      where: { id },
      include: {
        phones: true,
        emails: true,
        allocationUpdates: { orderBy: { createdAt: "desc" }, take: 5 },
        _count: { select: { allocationUpdates: true, phones: true, emails: true } },
      },
    });
    const orderCount = await p.order.count({
      where: {
        companyId: COMPANY,
        OR: [
          { customerEmail: c?.email ?? undefined },
          { customerPhone: c?.phoneNumber ?? undefined },
        ],
      },
    });
    console.log(JSON.stringify({
      id: c?.id,
      name: c?.name,
      phoneNumber: c?.phoneNumber,
      email: c?.email,
      assignedMerchant: c?.assignedMerchant,
      source: c?.source,
      lastPurchaseAt: c?.lastPurchaseAt,
      recentMerchant: c?.recentMerchant,
      createdAt: c?.createdAt,
      extraPhones: c?.phones?.map((x) => x.phoneNumber),
      extraEmails: c?.emails?.map((x) => x.email),
      counts: { ...c?._count, ordersApprox: orderCount },
      recentAlloc: c?.allocationUpdates?.map((a) => ({ merchantName: a.merchantName, category: a.category, at: a.createdAt })),
    }, null, 2));
  }
  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
