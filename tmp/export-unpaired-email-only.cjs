/**
 * Export the 87 email-only Cosmo contacts with no ERP email match.
 * Uses the paired IDs from the double-check CSV if present; else recompute quickly.
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

function normalizeEmail(value) {
  const t = String(value || "").trim().toLowerCase();
  if (!t || t === "none") return null;
  return t;
}

async function main() {
  const pairedPath = path.resolve("tmp/cosmo-email-only-vs-phone-doublecheck.csv");
  const pairedIds = new Set();
  if (fs.existsSync(pairedPath)) {
    const lines = fs.readFileSync(pairedPath, "utf8").trim().split(/\r?\n/).slice(1);
    for (const line of lines) {
      // column email_only_contact_id is index 7 in header order from script
      const cols = [];
      let cur = "";
      let q = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          q = !q;
          continue;
        }
        if (c === "," && !q) {
          cols.push(cur);
          cur = "";
          continue;
        }
        cur += c;
      }
      cols.push(cur);
      if (cols[7]) pairedIds.add(cols[7]);
    }
  }

  const cosmoEmailOnly = await prisma.contactMaster.findMany({
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
      lastPurchaseAt: true,
      emails: { select: { email: true } },
    },
  });

  const unpaired = cosmoEmailOnly.filter((c) => !pairedIds.has(c.id));
  const header = [
    "contact_id",
    "name",
    "primary_email",
    "alias_emails",
    "source",
    "last_purchase_at",
  ];
  const lines = [header.join(",")];
  for (const c of unpaired) {
    const row = [
      c.id,
      c.name,
      c.email ?? "",
      c.emails.map((e) => e.email).join("|"),
      c.source ?? "",
      c.lastPurchaseAt ? c.lastPurchaseAt.toISOString().slice(0, 10) : "",
    ];
    lines.push(row.map(csvEscape).join(","));
  }
  const out = path.resolve("tmp/cosmo-email-only-no-erp-match.csv");
  fs.writeFileSync(out, lines.join("\n"), "utf8");
  console.log(JSON.stringify({ unpaired: unpaired.length, csv: out }, null, 2));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
