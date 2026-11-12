import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await prisma.erpnextInstance.updateMany({
      data: { amexMop: "AMEX" },
    });
    const rows = await prisma.erpnextInstance.findMany({
      select: { id: true, label: true, amexMop: true, cardDeliveryMop: true },
      orderBy: { label: "asc" },
    });
    console.log(JSON.stringify({ updated: result.count, rows }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
