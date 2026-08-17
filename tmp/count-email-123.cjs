const { PrismaClient } = require("@prisma/client");
const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
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

async function hits(email) {
  const primary = await prisma.contactMaster.findMany({
    where: {
      companyId: COMPANY_ID,
      email: { equals: email, mode: "insensitive" },
    },
    select: { id: true, name: true, phoneNumber: true, email: true },
  });
  const secondary = await prisma.contactEmail.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    select: {
      email: true,
      contact: {
        select: { id: true, name: true, phoneNumber: true, email: true, companyId: true },
      },
    },
  });
  const liveSecondary = secondary.filter((r) => r.contact.companyId === COMPANY_ID);
  const byId = new Map();
  for (const c of primary) byId.set(c.id, { ...c, where: "primary" });
  for (const r of liveSecondary) {
    if (!byId.has(r.contact.id)) {
      byId.set(r.contact.id, { ...r.contact, where: "secondary" });
    }
  }
  const live = [...byId.values()].filter((c) => c.phoneNumber || c.email);
  return {
    email,
    uniqueContacts: byId.size,
    liveWithPhoneOrEmail: live.length,
    primaryCount: primary.length,
    secondaryCount: liveSecondary.length,
    samples: [...byId.values()].slice(0, 8).map((c) => ({
      name: c.name,
      phone: c.phoneNumber,
      primaryEmail: c.email,
      where: c.where,
    })),
  };
}

async function main() {
  const emails = ["123@gamil.com", "123@gmail.com"];
  const out = [];
  for (const e of emails) out.push(await hits(e));
  console.log(JSON.stringify(out, null, 2));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
