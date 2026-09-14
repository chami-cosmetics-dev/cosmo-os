const { PrismaClient } = require("@prisma/client");
const url = process.env.DATABASE_URL || "";
const p = new PrismaClient({
  datasources: { db: { url: url.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || url } },
});
const COMPANY = "cmp5k145c006irlhemjfidlb5";
(async () => {
  const total = await p.contactMaster.count({ where: { companyId: COMPANY } });
  const mer109 = await p.contactMaster.count({ where: { companyId: COMPANY, assignedMerchant: "MER109" } });
  const mer99 = await p.contactMaster.count({ where: { companyId: COMPANY, assignedMerchant: "MER99" } });
  const allocated = await p.contactMaster.count({ where: { companyId: COMPANY, assignedMerchant: { not: null } } });
  const vaultList = await p.contactMaster.count({
    where: { companyId: COMPANY, source: { startsWith: "vault-contact-list:" } },
  });
  console.log(JSON.stringify({ total, allocated, mer109, mer99, vaultListSource: vaultList }));
  await p.$disconnect();
})().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
