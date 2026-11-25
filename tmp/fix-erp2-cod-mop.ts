import { PrismaClient } from "@prisma/client";

const ERP2_ID = "cmpur1ooq0001js0499scpn6g";

async function main() {
  const prisma = new PrismaClient();
  try {
    const before = await prisma.erpnextInstance.findUnique({
      where: { id: ERP2_ID },
      select: { id: true, label: true, codMop: true, cashMop: true },
    });
    console.log("before", JSON.stringify(before));

    const after = await prisma.erpnextInstance.update({
      where: { id: ERP2_ID },
      data: { codMop: "Cash" },
      select: { id: true, label: true, codMop: true, cashMop: true },
    });
    console.log("after", JSON.stringify(after));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
