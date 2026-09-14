const { PrismaClient } = require("@prisma/client");
const url = process.env.DATABASE_URL || "";
const p = new PrismaClient({
  datasources: { db: { url: url.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || url } },
});
(async () => {
  const instances = await p.erpnextInstance.findMany({
    select: {
      id: true,
      label: true,
      companyId: true,
      incomingWebhookSecret: true,
      baseUrl: true,
    },
  });
  console.log(JSON.stringify(instances.map((i) => ({
    label: i.label,
    companyId: i.companyId,
    hasWebhookSecret: Boolean(i.incomingWebhookSecret && String(i.incomingWebhookSecret).trim()),
    baseHost: (() => { try { return new URL(i.baseUrl).host; } catch { return null; } })(),
  })), null, 2));
  await p.$disconnect();
})().catch((e) => { console.error(String(e.message||e)); process.exit(1); });
