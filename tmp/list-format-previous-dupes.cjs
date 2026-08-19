/** List format-variant Previous phones (same number as primary, different format). */
const { PrismaClient } = require("@prisma/client");

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
const raw = process.env.DATABASE_URL || "";
const url = raw.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || raw;
const prisma = new PrismaClient({ datasources: { db: { url } } });

function phoneDigitsOnly(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  return d;
}

function buildPhoneLookupVariants(raw) {
  const t = String(raw || "").trim();
  const d = phoneDigitsOnly(raw);
  const out = new Set();
  if (t) out.add(t);
  if (d) {
    out.add(d);
    if (d.length === 9) {
      out.add(`0${d}`);
      out.add(`94${d}`);
    }
    if (d.length === 10 && d.startsWith("0")) {
      out.add(d.slice(1));
      out.add(`94${d.slice(1)}`);
      out.add(`940${d.slice(1)}`);
    }
    if (d.length === 11 && d.startsWith("94")) {
      out.add(`0${d.slice(2)}`);
      out.add(d.slice(2));
    }
  }
  return [...out];
}

function variantsMatch(a, b) {
  const va = new Set(buildPhoneLookupVariants(a));
  const vb = new Set(buildPhoneLookupVariants(b));
  for (const v of va) if (vb.has(v)) return true;
  return false;
}

async function main() {
  const rows = await prisma.$queryRaw`
    SELECT cm.id, cm.name, cm."phoneNumber" AS primary_phone, cm.source,
           cp.id AS contact_phone_id, cp."phoneNumber" AS previous_phone
    FROM "ContactMaster" cm
    INNER JOIN "ContactPhone" cp ON cp."contactId" = cm.id
    WHERE cm."companyId" = ${COMPANY_ID}
    ORDER BY cm.name
  `;

  const formatDupes = rows.filter((r) => variantsMatch(r.primary_phone, r.previous_phone));

  console.log(JSON.stringify({ count: formatDupes.length, rows: formatDupes }, null, 2));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
