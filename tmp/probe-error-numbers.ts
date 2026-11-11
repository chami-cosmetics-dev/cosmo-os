import { PrismaClient } from "@prisma/client";

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";

async function main() {
  const rawUrl = process.env.DATABASE_URL ?? "";
  const prisma = new PrismaClient({
    datasources: {
      db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl },
    },
  });
  try {
    const samples = [
      { name: "Kanchana Manawadu", phone: "1" },
      { name: "Dayananda supper", phone: "0" },
      { name: "Rudra Chowdhury", phone: "22" },
      { name: "Akila Wanniarahchi", phone: "1213" },
      { name: "ms Deshani Gamage", phone: "0" },
      { name: "Ms. Dulari", phone: "0" },
    ];
    for (const s of samples) {
      const byName = await prisma.contactMaster.findMany({
        where: { companyId: COMPANY_ID, name: { equals: s.name, mode: "insensitive" } },
        select: {
          id: true,
          name: true,
          phoneNumber: true,
          assignedMerchant: true,
          createdAt: true,
        },
        take: 8,
      });
      const byPhone = await prisma.contactMaster.findMany({
        where: { companyId: COMPANY_ID, phoneNumber: s.phone },
        select: { id: true, name: true, phoneNumber: true },
        take: 8,
      });
      const byContains = await prisma.contactMaster.findMany({
        where: {
          companyId: COMPANY_ID,
          name: { contains: s.name.split(/\s+/).slice(-1)[0] ?? s.name, mode: "insensitive" },
          phoneNumber: { contains: s.phone },
        },
        select: { id: true, name: true, phoneNumber: true },
        take: 8,
      });
      console.log(
        JSON.stringify(
          {
            sample: s,
            byName,
            byPhoneCount: byPhone.length,
            byPhone,
            byContains,
          },
          null,
          2,
        ),
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
