const { PrismaClient } = require("@prisma/client");
const raw = process.env.DATABASE_URL || "";
const prisma = new PrismaClient({
  datasources: { db: { url: raw.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || raw } },
});

function variants(rawPhone) {
  const t = String(rawPhone || "").trim();
  let d = t.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  const out = new Set([t, d].filter(Boolean));
  if (d.length === 10 && d.startsWith("0")) {
    out.add(d.slice(1));
    out.add(`94${d.slice(1)}`);
    out.add(`+94${d.slice(1)}`);
  }
  return [...out];
}

async function lookup(label, phone, email) {
  const phones = variants(phone);
  const byPhone = await prisma.contactMaster.findMany({
    where: {
      companyId: "cmn2xcas1002crl5xtgoq28f5",
      OR: [
        { phoneNumber: { in: phones } },
        { phones: { some: { phoneNumber: { in: phones } } } },
      ],
    },
    select: { id: true, name: true, phoneNumber: true, email: true, source: true },
  });
  const byEmail = email
    ? await prisma.contactMaster.findMany({
        where: {
          companyId: "cmn2xcas1002crl5xtgoq28f5",
          OR: [
            { email: { equals: email, mode: "insensitive" } },
            { emails: { some: { email: { equals: email, mode: "insensitive" } } } },
          ],
        },
        select: { id: true, name: true, phoneNumber: true, email: true, source: true },
        take: 8,
      })
    : [];
  const emailCount = email
    ? await prisma.contactMaster.count({
        where: {
          companyId: "cmn2xcas1002crl5xtgoq28f5",
          OR: [
            { email: { equals: email, mode: "insensitive" } },
            { emails: { some: { email: { equals: email, mode: "insensitive" } } } },
          ],
        },
      })
    : 0;
  console.log(JSON.stringify({ label, phone, email, phoneHits: byPhone, emailContactCount: emailCount, emailSample: byEmail }, null, 2));
}

async function main() {
  await lookup("Malisha", "0701797374", "malishadealmeida@gmail.com");
  await lookup("Ms Shane", "0740332575", "kiribathgodapos1@gmail.com");
  await lookup("AYSHA", "0778682788", "sandalisemini17@gmail.com");
}

main().finally(() => prisma.$disconnect());
