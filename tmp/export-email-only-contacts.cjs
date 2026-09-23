/**
 * List Contact Master rows with email but no phone (primary or secondary).
 *
 *   node scripts/with-env.mjs cosmo-prod node tmp/export-email-only-contacts.cjs
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
const raw = process.env.DATABASE_URL || "";
const prisma = new PrismaClient({
  datasources: { db: { url: raw.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || raw } },
});

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const rows = await prisma.contactMaster.findMany({
    where: {
      companyId: COMPANY_ID,
      AND: [
        { OR: [{ phoneNumber: null }, { phoneNumber: "" }] },
        { OR: [{ email: { not: null } }, { emails: { some: {} } }] },
      ],
      phones: { none: {} },
    },
    select: {
      id: true,
      name: true,
      email: true,
      source: true,
      assignedMerchant: true,
      lastPurchaseAt: true,
      emails: { select: { email: true } },
    },
    orderBy: { name: "asc" },
  });

  const header = [
    "contact_id",
    "name",
    "primary_email",
    "alias_emails",
    "source",
    "assigned_merchant",
    "last_purchase_at",
  ];
  const lines = [header.join(",")];
  for (const c of rows) {
    const primary = (c.email || "").toLowerCase();
    const aliases = (c.emails || [])
      .map((e) => e.email)
      .filter((e) => e && e.toLowerCase() !== primary);
    lines.push(
      [
        csvEscape(c.id),
        csvEscape(c.name),
        csvEscape(c.email || ""),
        csvEscape(aliases.join("|")),
        csvEscape(c.source || ""),
        csvEscape(c.assignedMerchant || ""),
        csvEscape(c.lastPurchaseAt ? c.lastPurchaseAt.toISOString() : ""),
      ].join(",")
    );
  }

  const out = path.resolve("tmp/email-only-contacts.csv");
  fs.writeFileSync(out, `${lines.join("\n")}\n`);
  console.log(`email_only_count=${rows.length}`);
  console.log(`wrote=${out}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
