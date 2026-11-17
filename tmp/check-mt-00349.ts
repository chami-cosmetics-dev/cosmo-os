import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";

const p = new PrismaClient();

async function main() {
  const names = [
    "MAT-STE-2026-00349",
    "MAT-STE-2026-00348",
    "MAT-STE-2026-00345",
    "MAT-STE-2026-00339",
    "MAT-STE-2026-00334",
  ];
  const rows = await p.materialTransfer.findMany({
    where: {
      OR: [{ erpName: { in: names } }, { erp2Name: { in: names } }],
    },
    select: {
      id: true,
      erpName: true,
      erp2Name: true,
      direction: true,
      status: true,
      sourceWarehouse: true,
      targetWarehouse: true,
      slot: true,
      createdAt: true,
      _count: { select: { lines: true } },
    },
  });
  const audits = await p.auditLog.findMany({
    where: { entityId: { in: names } },
    select: {
      action: true,
      entityId: true,
      summary: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const total = await p.materialTransfer.count();
  const recentOgf = await p.materialTransfer.findMany({
    where: {
      direction: "store_to_shop",
      targetWarehouse: { contains: "OGF" },
    },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: {
      erpName: true,
      status: true,
      sourceWarehouse: true,
      targetWarehouse: true,
      createdAt: true,
      _count: { select: { lines: true } },
    },
  });
  writeFileSync(
    "tmp/mt-check-00349.json",
    JSON.stringify({ rows, audits, total, recentOgf }, null, 2),
  );
}

main()
  .catch((e) => {
    writeFileSync("tmp/mt-check-00349-err.txt", String(e.stack || e));
    process.exitCode = 1;
  })
  .finally(async () => {
    await p.$disconnect();
  });
