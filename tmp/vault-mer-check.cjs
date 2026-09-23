const { PrismaClient } = require("@prisma/client");
const url = process.env.DATABASE_URL || "";
const p = new PrismaClient({
  datasources: { db: { url: url.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || url } },
});
const COMPANY = "cmp5k145c006irlhemjfidlb5";
(async () => {
  const targets = await p.user.findMany({
    where: {
      companyId: COMPANY,
      OR: [
        { knownName: { contains: "Nimthera", mode: "insensitive" } },
        { knownName: { contains: "Dinuli", mode: "insensitive" } },
        { name: { contains: "Nimthera", mode: "insensitive" } },
        { name: { contains: "Dinuli", mode: "insensitive" } },
      ],
    },
    select: { knownName: true, name: true, couponCodes: true },
  });
  console.log(JSON.stringify(targets.map((u) => ({
    knownName: u.knownName,
    name: u.name,
    couponCodes: u.couponCodes,
  }))));

  // counts by MER for those two if we know codes
  for (const u of targets) {
    const keys = [];
    if (u.knownName) keys.push(u.knownName);
    for (const c of u.couponCodes || []) {
      const m = String(c).match(/MER\s*(\d+)/i);
      if (m) keys.push("MER" + m[1]);
      keys.push(c);
    }
    for (const k of [...new Set(keys)]) {
      const n = await p.contactMaster.count({
        where: { companyId: COMPANY, assignedMerchant: { equals: k, mode: "insensitive" } },
      });
      if (n > 0) console.log("alloc_count", k, n);
    }
  }
  await p.$disconnect();
})().catch((e) => { console.error(String(e.message||e)); process.exit(1); });
