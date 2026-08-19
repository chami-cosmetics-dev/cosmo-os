/**
 * Same-name, two different phones.
 *   node scripts/with-env.mjs cosmo-prod node tmp/list-two-phones.cjs
 */
const fs = require("fs");
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

const SKIP_NAMES = new Set([
  "unknown",
  "ms",
  "local customer",
  "foreign customer",
  "foreigner",
]);

function phoneDigitsOnly(value) {
  let d = String(value || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  return d;
}

function canonicalLocal(raw) {
  let d = phoneDigitsOnly(raw);
  if (d.startsWith("94") && d.length >= 11) d = d.slice(2);
  if (d.length === 9) d = `0${d}`;
  if (d.length === 10 && d.startsWith("0")) return d;
  return null;
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(ms|mrs|mr|miss|dr)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isStaffEmail(email) {
  const e = String(email || "").toLowerCase();
  return (
    e.endsWith("@cosmetics.lk") ||
    e.includes("cosmetic") ||
    e.includes("pos1@") ||
    e.includes("pos2@") ||
    e.includes("cosmatics")
  );
}

function tokens(n) {
  return normalizeName(n).split(" ").filter((t) => t.length >= 2);
}

async function main() {
  const contacts = await prisma.contactMaster.findMany({
    where: { companyId: COMPANY_ID, phoneNumber: { not: null } },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      phones: { select: { phoneNumber: true } },
    },
  });

  const extras = [];
  const byName = new Map();

  for (const c of contacts) {
    const primary = canonicalLocal(c.phoneNumber);
    if (!primary) continue;
    const extrasCanon = [];
    for (const p of c.phones) {
      const e = canonicalLocal(p.phoneNumber);
      if (e && e !== primary) extrasCanon.push(e);
    }
    if (extrasCanon.length) {
      extras.push({
        name: c.name,
        phones: [primary, ...extrasCanon],
        email: c.email || "",
        how: "second_number_on_same_card",
      });
    }
    const n = normalizeName(c.name);
    if (!n || SKIP_NAMES.has(n) || tokens(n).length < 2) continue;
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push({
      name: c.name,
      phone: primary,
      raw: c.phoneNumber,
      email: c.email || "",
    });
  }

  const twoCards = [];
  for (const [n, list] of byName) {
    const uniqPhone = new Map();
    for (const row of list) {
      if (!uniqPhone.has(row.phone)) uniqPhone.set(row.phone, row);
    }
    if (uniqPhone.size < 2) continue;
    if (uniqPhone.size > 6) continue;
    const rows = [...uniqPhone.values()];
    const emails = rows.map((r) => r.email.toLowerCase()).filter(Boolean);
    const realEmails = emails.filter((e) => !isStaffEmail(e));
    const sharedReal =
      realEmails.length >= 2 && new Set(realEmails).size === 1 ? realEmails[0] : "";
    twoCards.push({
      name: rows[0].name,
      phones: rows.map((r) => r.phone),
      email: sharedReal || realEmails[0] || "",
      how: sharedReal ? "same_name_same_customer_email" : "same_name_two_cards",
    });
  }

  const extraOnly = extras.map((e) => ({
    name: e.name,
    phones: e.phones,
    email: e.email,
    how: e.how,
  }));

  fs.writeFileSync(
    "tmp/audit-contacts/same-person-two-phones.json",
    JSON.stringify(
      {
        extraOnCard: extraOnly.length,
        sameNameTwoCards: twoCards.length,
        extraOnCardRows: extraOnly,
        sameNameTwoCardsRows: twoCards,
      },
      null,
      2
    )
  );
  console.log(
    JSON.stringify(
      {
        extraOnCard: extraOnly.length,
        sameNameTwoCards: twoCards.length,
        extraOnCardRows: extraOnly,
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
