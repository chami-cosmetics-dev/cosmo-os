/**
 * Spot-check SAME-400 merge: emails on keep, losers stripped.
 *   node scripts/with-env.mjs cosmo-prod node tmp/verify-same-400-merge.cjs
 */
const fs = require("fs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  datasources: {
    db: { url: (process.env.DATABASE_URL || "").replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") },
  },
});

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (q && text[i + 1] === '"') {
        cur += '"';
        i++;
        continue;
      }
      q = !q;
      continue;
    }
    if (c === "," && !q) {
      row.push(cur);
      cur = "";
      continue;
    }
    if ((c === "\n" || c === "\r") && !q) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

async function main() {
  const table = parseCsv(fs.readFileSync("tmp/split-contacts-MERGED.csv", "utf8"));
  const h = table[0];
  const idx = Object.fromEntries(h.map((x, i) => [x, i]));
  let emailOnKeep = 0;
  let emailMissing = 0;
  let loserStillHasEmail = 0;
  let loserGone = 0;
  const missing = [];

  for (const r of table.slice(1)) {
    const email = (r[idx.email_card_email] || "").trim().toLowerCase();
    const keepId = r[idx.phone_card_id];
    const loserId = r[idx.email_card_id];
    const keep = await prisma.contactMaster.findUnique({
      where: { id: keepId },
      select: { id: true, email: true, phoneNumber: true, emails: { select: { email: true } } },
    });
    const loser = await prisma.contactMaster.findUnique({
      where: { id: loserId },
      select: { id: true, email: true, phoneNumber: true },
    });
    if (!loser) loserGone += 1;
    else if (loser.email || loser.phoneNumber) loserStillHasEmail += 1;

    const keepEmails = new Set(
      [keep?.email, ...(keep?.emails || []).map((e) => e.email)]
        .filter(Boolean)
        .map((e) => e.toLowerCase())
    );
    if (keepEmails.has(email)) emailOnKeep += 1;
    else {
      emailMissing += 1;
      if (missing.length < 8) {
        missing.push({
          email,
          keepId,
          keepEmail: keep?.email || null,
          keepPhone: keep?.phoneNumber || null,
          loserEmail: loser?.email || null,
        });
      }
    }
  }

  const emailOnly = await prisma.contactMaster.count({
    where: {
      companyId: "cmn2xcas1002crl5xtgoq28f5",
      phoneNumber: null,
      email: { not: null },
    },
  });

  console.log(
    JSON.stringify(
      {
        mergedRows: table.length - 1,
        emailOnKeep,
        emailMissing,
        loserStillHasEmail,
        loserGone,
        remainingEmailOnly: emailOnly,
        missingSample: missing,
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
