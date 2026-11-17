import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";

const p = new PrismaClient();

async function main() {
  const row = await p.materialTransfer.findFirst({
    where: {
      erpName: "MAT-STE-2026-00350",
      slot: "erp1",
      targetWarehouse: { contains: "Cool Planet" },
    },
    include: {
      createdBy: { select: { name: true, email: true } },
      lines: { select: { itemCode: true, sentQty: true }, take: 5 },
      _count: { select: { lines: true } },
    },
  });

  const recentStore = await p.materialTransfer.findMany({
    where: { direction: "store_to_shop", slot: "erp1" },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: {
      erpName: true,
      status: true,
      targetWarehouse: true,
      createdAt: true,
      direction: true,
    },
  });

  writeFileSync(
    "tmp/mt-check-00350-detail.json",
    JSON.stringify(
      {
        row: row
          ? {
              id: row.id,
              erpName: row.erpName,
              direction: row.direction,
              status: row.status,
              companyId: row.companyId,
              sourceWarehouse: row.sourceWarehouse,
              targetWarehouse: row.targetWarehouse,
              createdAt: row.createdAt,
              createdBy: row.createdBy,
              lineCount: row._count.lines,
              sampleLines: row.lines,
            }
          : null,
        recentStore,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    writeFileSync("tmp/mt-check-00350-detail-err.txt", String(e.stack || e));
    process.exitCode = 1;
  })
  .finally(async () => p.$disconnect());
