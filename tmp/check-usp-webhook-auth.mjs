import { PrismaClient } from "@prisma/client";

const rawUrl = process.env.DATABASE_URL ?? "";
const prisma = new PrismaClient({
  datasources: { db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl } },
});

const uspCompany = "USP Trading Lanka (Pvt) Ltd";
const spkCompany = "SPK Trading (Pvt) Ltd";

const [uspExact, spkExact, uspLoose, instances] = await Promise.all([
  prisma.companyLocation.findMany({
    where: { erpnextCompany: uspCompany },
    select: {
      id: true,
      name: true,
      erpnextCompany: true,
      erpnextInstanceId: true,
      erpnextInstance: { select: { id: true, label: true, incomingWebhookSecret: true } },
    },
  }),
  prisma.companyLocation.findMany({
    where: { erpnextCompany: spkCompany },
    select: {
      id: true,
      name: true,
      erpnextCompany: true,
      erpnextInstanceId: true,
      erpnextInstance: { select: { id: true, label: true, incomingWebhookSecret: true } },
    },
  }),
  prisma.companyLocation.findMany({
    where: {
      OR: [
        { name: { contains: "USP", mode: "insensitive" } },
        { erpnextCompany: { contains: "USP", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      erpnextCompany: true,
      erpnextInstanceId: true,
      erpnextInstance: { select: { id: true, label: true, incomingWebhookSecret: true } },
    },
  }),
  prisma.erpnextInstance.findMany({
    select: { id: true, label: true, incomingWebhookSecret: true },
  }),
]);

function secretMeta(secret) {
  const value = secret ?? "";
  return {
    present: Boolean(value),
    length: value.length,
    suffix: value ? value.slice(-4) : null,
  };
}

console.log(
  JSON.stringify(
    {
      uspExact: uspExact.map((row) => ({
        id: row.id,
        name: row.name,
        erpnextCompany: row.erpnextCompany,
        instanceId: row.erpnextInstanceId,
        instanceLabel: row.erpnextInstance?.label ?? null,
        secret: secretMeta(row.erpnextInstance?.incomingWebhookSecret),
      })),
      spkExact: spkExact.map((row) => ({
        id: row.id,
        name: row.name,
        erpnextCompany: row.erpnextCompany,
        instanceId: row.erpnextInstanceId,
        instanceLabel: row.erpnextInstance?.label ?? null,
        secret: secretMeta(row.erpnextInstance?.incomingWebhookSecret),
      })),
      uspLoose: uspLoose.map((row) => ({
        id: row.id,
        name: row.name,
        erpnextCompany: JSON.stringify(row.erpnextCompany),
        companyLen: row.erpnextCompany?.length ?? 0,
        instanceId: row.erpnextInstanceId,
        instanceLabel: row.erpnextInstance?.label ?? null,
        secret: secretMeta(row.erpnextInstance?.incomingWebhookSecret),
      })),
      instances: instances.map((row) => ({
        id: row.id,
        label: row.label,
        secret: secretMeta(row.incomingWebhookSecret),
      })),
      envFallback: secretMeta(process.env.ERPNEXT_INCOMING_WEBHOOK_SECRET),
    },
    null,
    2,
  ),
);
await prisma.$disconnect();
