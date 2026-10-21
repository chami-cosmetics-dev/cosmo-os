import { PrismaClient } from "@prisma/client";

const rawUrl = process.env.DATABASE_URL ?? "";
const prisma = new PrismaClient({
  datasources: { db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl } },
});

const rows = await prisma.companyLocation.findMany({
  where: {
    OR: [
      { name: { contains: "USP", mode: "insensitive" } },
      { name: { contains: "KAD", mode: "insensitive" } },
      { name: { contains: "Udara", mode: "insensitive" } },
    ],
  },
  select: {
    name: true,
    erpnextCompany: true,
    createdAt: true,
    updatedAt: true,
  },
});

const audits = await prisma.auditLog.findMany({
  where: {
    OR: [
      { summary: { contains: "USP", mode: "insensitive" } },
      { entityType: { contains: "Location", mode: "insensitive" } },
    ],
  },
  select: { createdAt: true, action: true, summary: true, entityType: true, entityId: true },
  orderBy: { createdAt: "desc" },
  take: 30,
});

console.log(JSON.stringify({ rows, audits }, null, 2));
await prisma.$disconnect();
