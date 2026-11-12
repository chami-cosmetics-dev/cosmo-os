import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.erpnextInstance.findMany({
      select: {
        id: true,
        label: true,
        baseUrl: true,
        cashMop: true,
        codMop: true,
        cardDeliveryMop: true,
        bankTransferMop: true,
        webxpayMop: true,
      },
      orderBy: { label: "asc" },
    });
    console.log(JSON.stringify(rows, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
