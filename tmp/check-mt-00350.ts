import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";

const p = new PrismaClient();

async function main() {
  const names = ["MAT-STE-2026-00350", "MAT-STE-2026-00349"];
  const rows = await p.materialTransfer.findMany({
    where: { OR: [{ erpName: { in: names } }, { erp2Name: { in: names } }] },
    select: {
      id: true,
      erpName: true,
      slot: true,
      status: true,
      sourceWarehouse: true,
      targetWarehouse: true,
      createdAt: true,
      _count: { select: { lines: true } },
    },
  });
  const audits = await p.auditLog.findMany({
    where: { entityId: { in: names } },
    select: { action: true, entityId: true, summary: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  writeFileSync("tmp/mt-check-00350.json", JSON.stringify({ rows, audits }, null, 2));
}

main()
  .catch((e) => {
    writeFileSync("tmp/mt-check-00350-err.txt", String(e.stack || e));
    process.exitCode = 1;
  })
  .finally(async () => {
    await p.$disconnect();
  });
