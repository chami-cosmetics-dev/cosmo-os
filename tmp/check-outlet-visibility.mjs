import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const warehouses = await prisma.materialTransfer.groupBy({
  by: ["direction", "slot", "targetWarehouse", "status"],
  _count: { _all: true },
});

const gcc = warehouses.filter(
  (row) =>
    /gcc|chami|galle|negombo|nittambu|spk/i.test(row.targetWarehouse) ||
    /gcc|chami|galle|negombo|nittambu|spk/i.test(row.direction),
);

const allTargets = [...new Set(warehouses.map((w) => w.targetWarehouse))].sort();

console.log(
  JSON.stringify(
    {
      allTargets,
      gccNegomboSpk: warehouses.filter((row) =>
        /gcc|chami|galle|negombo|nittambu|spk|thilakma/i.test(row.targetWarehouse),
      ),
    },
    null,
    2,
  ),
);

await prisma.$disconnect();
