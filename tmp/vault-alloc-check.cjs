const { PrismaClient } = require("@prisma/client");
const url = process.env.DATABASE_URL || "";
console.log("db host", (url.match(/@([^/]+)/) || [])[1] || "(none)");
const p = new PrismaClient({
  datasources: { db: { url: url.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || url } },
});
(async () => {
  const companies = await p.company.findMany({ select: { id: true, name: true } });
  console.log("company_count", companies.length);
  for (const c of companies) {
    const total = await p.contactMaster.count({ where: { companyId: c.id } });
    const withAlloc = await p.contactMaster.count({
      where: { companyId: c.id, NOT: { assignedMerchant: null } },
    });
    const nim = await p.user.count({
      where: {
        companyId: c.id,
        OR: [
          { knownName: { equals: "Nimthera", mode: "insensitive" } },
          { name: { contains: "Nimthera", mode: "insensitive" } },
        ],
      },
    });
    const din = await p.user.count({
      where: {
        companyId: c.id,
        OR: [
          { knownName: { equals: "Dinuli", mode: "insensitive" } },
          { name: { contains: "Dinuli", mode: "insensitive" } },
        ],
      },
    });
    const distinctMerchants = await p.contactMaster.findMany({
      where: { companyId: c.id, assignedMerchant: { not: null } },
      distinct: ["assignedMerchant"],
      select: { assignedMerchant: true },
      take: 50,
    });
    console.log(JSON.stringify({
      companyId: c.id,
      companyName: c.name,
      contacts: total,
      allocated: withAlloc,
      nimtheraUsers: nim,
      dinuliUsers: din,
      distinctAssignedMerchantCount: distinctMerchants.length,
      distinctAssignedMerchants: distinctMerchants.map((r) => r.assignedMerchant).sort(),
    }));
  }
  await p.$disconnect();
})().catch((e) => {
  console.error(String(e && e.message ? e.message : e));
  process.exit(1);
});
