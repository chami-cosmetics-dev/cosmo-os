const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: (process.env.DATABASE_URL || "").replace(
        /(ep-[^.]+)-pooler(\.[^/]+)/,
        "$1$2"
      ),
    },
  },
});

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";

function canon(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("94") && d.length >= 11) d = d.slice(2);
  if (d.length === 9) d = `0${d}`;
  if (d.length === 10 && d.startsWith("0")) return d;
  return null;
}

async function main() {
  const rows = await prisma.contactMaster.findMany({
    where: { companyId: COMPANY_ID, phoneNumber: { not: null } },
    select: { id: true, name: true, phoneNumber: true, email: true, source: true },
  });

  const byCanon = new Map();
  for (const r of rows) {
    const c = canon(r.phoneNumber);
    if (!c) continue;
    if (!byCanon.has(c)) byCanon.set(c, []);
    byCanon.get(c).push(r);
  }

  let dupPhones = 0;
  let dupCards = 0;
  let erp1erp2 = 0;
  let sameName = 0;
  const samples = [];

  for (const [phone, list] of byCanon) {
    if (list.length < 2) continue;
    dupPhones += 1;
    dupCards += list.length;
    const sources = new Set(list.map((x) => x.source || ""));
    const hasErp1 = list.some((x) => x.source === "erp1");
    const hasErp2 = list.some((x) => x.source === "erp2");
    if (hasErp1 && hasErp2) erp1erp2 += 1;

    const names = list.map((x) => String(x.name || "").toLowerCase().replace(/\b(ms|mrs|mr|miss|dr)\b/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim());
    const allSame = names.every((n) => n && n === names[0]);
    if (allSame) sameName += 1;

    if (samples.length < 12) {
      samples.push({
        phone,
        count: list.length,
        sameName: allSame,
        rows: list.map((x) => ({
          id: x.id,
          name: x.name,
          email: x.email,
          source: x.source,
          phone: x.phoneNumber,
        })),
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        contactsWithPhone: rows.length,
        phonesWith2PlusCards: dupPhones,
        cardsOnThosePhones: dupCards,
        phonesWithBothErp1AndErp2: erp1erp2,
        dupPhonesWhereNamesMatch: sameName,
        anjali: byCanon.get("0772014176")?.map((x) => ({
          id: x.id,
          name: x.name,
          email: x.email,
          source: x.source,
        })),
        samples,
      },
      null,
      2
    )
  );
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
