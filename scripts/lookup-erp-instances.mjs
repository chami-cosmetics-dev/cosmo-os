import { PrismaClient } from "@prisma/client";

const rawUrl = process.env.DATABASE_URL ?? "";
const directUrl = rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2");
const prisma = new PrismaClient({
  datasources: { db: { url: directUrl || rawUrl } },
});

const instances = await prisma.erpnextInstance.findMany({
  select: {
    id: true,
    label: true,
    baseUrl: true,
    incomingWebhookSecret: true,
    apiKey: true,
  },
});

const locations = await prisma.companyLocation.findMany({
  where: { name: { contains: "SupplementVault", mode: "insensitive" } },
  select: {
    name: true,
    erpnextCompany: true,
    erpnextInstanceId: true,
    erpnextInstance: {
      select: { label: true, baseUrl: true, incomingWebhookSecret: true },
    },
  },
});

console.log(JSON.stringify({ instances, locations }, null, 2));
await prisma.$disconnect();
