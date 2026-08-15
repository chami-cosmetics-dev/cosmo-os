/**
 * Fold ERP2 Cosmo twin into ERP1 when same canonical phone + same name.
 *
 *   node scripts/with-env.mjs cosmo-prod node tmp/merge-erp1-erp2-phone-dupes.cjs --dry-run
 *   node scripts/with-env.mjs cosmo-prod node tmp/merge-erp1-erp2-phone-dupes.cjs --apply
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
const apply = process.argv.includes("--apply");

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

const JUNK_PHONES = new Set(["0123455555", "0000000000", "0123456789"]);
const STORE_HINTS = [
  "one galleface",
  "galle face",
  "kiribathgoda",
  "cool planet",
  "cosmetics.lk",
  "showroom",
  "chami trading",
  "pepiliyana",
  "local customer",
  "foreigner",
  "foriegner",
  "foreign customer",
];

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCsv(file, header, rows) {
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(header.map((h) => csvEscape(row[h] ?? "")).join(","));
  }
  fs.writeFileSync(file, lines.join("\n"), "utf8");
}

function phoneDigitsOnly(value) {
  let d = String(value || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  return d;
}

function canonicalLocal(rawPhone) {
  let d = phoneDigitsOnly(rawPhone);
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

function tokens(value) {
  return normalizeName(value).split(" ").filter((t) => t.length >= 2);
}

function jaccard(a, b) {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  return inter / new Set([...A, ...B]).size;
}

function isStoreName(name) {
  const n = normalizeName(name);
  return STORE_HINTS.some((h) => n.includes(h));
}

function isSharedEmail(email) {
  const e = String(email || "").toLowerCase();
  return (
    e.endsWith("@cosmetics.lk") ||
    e.includes(".cosmetics@") ||
    e.includes("pos1@gmail.com") ||
    e.includes("pos2@gmail.com")
  );
}

function namesSame(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na && na === nb) return true;
  if (jaccard(a, b) >= 0.67) return true;
  const overlap = tokens(a).filter((t) => tokens(b).includes(t)).length;
  return overlap >= 2 && jaccard(a, b) >= 0.4;
}

async function main() {
  const contacts = await prisma.contactMaster.findMany({
    where: { companyId: COMPANY_ID, phoneNumber: { not: null } },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      source: true,
      lastPurchaseAt: true,
      emails: { select: { email: true } },
    },
  });

  const byCanon = new Map();
  for (const c of contacts) {
    const canon = canonicalLocal(c.phoneNumber);
    if (!canon) continue;
    if (!byCanon.has(canon)) byCanon.set(canon, []);
    byCanon.get(canon).push(c);
  }

  const mergeList = [];
  const skipList = [];

  for (const [phone, list] of byCanon) {
    if (list.length < 2) continue;
    const erp1 = list.filter((c) => c.source === "erp1");
    const erp2 = list.filter((c) => c.source === "erp2");
    if (list.length !== 2 || erp1.length !== 1 || erp2.length !== 1) {
      skipList.push({
        phone,
        keep_reason: "not_simple_erp1_erp2_pair",
        names: list.map((c) => c.name).join(" | "),
        sources: list.map((c) => c.source || "").join(" | "),
        ids: list.map((c) => c.id).join(" | "),
      });
      continue;
    }
    if (JUNK_PHONES.has(phone)) {
      skipList.push({
        phone,
        keep_reason: "junk_phone",
        names: list.map((c) => c.name).join(" | "),
        sources: "erp1 | erp2",
        ids: `${erp1[0].id} | ${erp2[0].id}`,
      });
      continue;
    }
    if (isStoreName(erp1[0].name) || isStoreName(erp2[0].name)) {
      skipList.push({
        phone,
        keep_reason: "shop_or_pos_card",
        names: `${erp1[0].name} | ${erp2[0].name}`,
        sources: "erp1 | erp2",
        ids: `${erp1[0].id} | ${erp2[0].id}`,
      });
      continue;
    }
    if (!namesSame(erp1[0].name, erp2[0].name)) {
      skipList.push({
        phone,
        keep_reason: "names_do_not_match",
        names: `${erp1[0].name} | ${erp2[0].name}`,
        sources: "erp1 | erp2",
        ids: `${erp1[0].id} | ${erp2[0].id}`,
      });
      continue;
    }

    mergeList.push({
      phone,
      keep_id: erp1[0].id,
      loser_id: erp2[0].id,
      keep_name: erp1[0].name,
      loser_name: erp2[0].name,
      keep_email: erp1[0].email || "",
      loser_email: erp2[0].email || "",
      keep_source: erp1[0].source,
      loser_source: erp2[0].source,
    });
  }

  let merged = 0;
  let adaptMoved = 0;
  let lastPurchasePatched = 0;
  let emailsCopied = 0;

  if (apply) {
    for (const p of mergeList) {
      const keep = await prisma.contactMaster.findUnique({
        where: { id: p.keep_id },
        select: {
          id: true,
          email: true,
          lastPurchaseAt: true,
          phoneNumber: true,
        },
      });
      const loser = await prisma.contactMaster.findUnique({
        where: { id: p.loser_id },
        select: {
          id: true,
          email: true,
          lastPurchaseAt: true,
          phoneNumber: true,
          emails: { select: { email: true } },
        },
      });
      if (!keep || !loser) continue;
      if (!keep.phoneNumber || !loser.phoneNumber) continue;
      if (canonicalLocal(keep.phoneNumber) !== canonicalLocal(loser.phoneNumber)) continue;

      const canon = canonicalLocal(keep.phoneNumber) || p.phone;
      if (canon && String(keep.phoneNumber) !== canon) {
        await prisma.contactMaster.update({
          where: { id: keep.id },
          data: { phoneNumber: canon },
        });
      }

      const moved = await prisma.adaptPurchaseHistory.updateMany({
        where: { contactId: loser.id, companyId: COMPANY_ID },
        data: { contactId: keep.id },
      });
      adaptMoved += moved.count;

      await prisma.contactAllocationUpdate.updateMany({
        where: { contactId: loser.id },
        data: { contactId: keep.id },
      });

      const keepEmails = new Set(
        [
          keep.email,
          ...(
            await prisma.contactEmail.findMany({
              where: { contactId: keep.id },
              select: { email: true },
            })
          ).map((e) => e.email.toLowerCase()),
        ]
          .filter(Boolean)
          .map((e) => String(e).toLowerCase())
      );
      for (const email of [loser.email, ...loser.emails.map((e) => e.email)]) {
        const n = String(email || "").trim().toLowerCase();
        if (!n || keepEmails.has(n) || isSharedEmail(n)) continue;
        if (!keep.email) {
          await prisma.contactMaster.update({ where: { id: keep.id }, data: { email: n } });
          keep.email = n;
        } else {
          await prisma.contactEmail
            .create({ data: { contactId: keep.id, email: n, isPrimary: false } })
            .catch(() => {});
        }
        keepEmails.add(n);
        emailsCopied += 1;
      }

      const latest =
        keep.lastPurchaseAt && loser.lastPurchaseAt
          ? keep.lastPurchaseAt > loser.lastPurchaseAt
            ? keep.lastPurchaseAt
            : loser.lastPurchaseAt
          : keep.lastPurchaseAt || loser.lastPurchaseAt;
      if (latest && (!keep.lastPurchaseAt || keep.lastPurchaseAt < latest)) {
        await prisma.contactMaster.update({
          where: { id: keep.id },
          data: { lastPurchaseAt: latest },
        });
        lastPurchasePatched += 1;
      }

      await prisma.contactEmail.deleteMany({ where: { contactId: loser.id } });
      await prisma.contactPhone.deleteMany({ where: { contactId: loser.id } });
      await prisma.contactMaster.update({
        where: { id: loser.id },
        data: { phoneNumber: null, email: null },
      });
      merged += 1;
    }
  }

  const keepPath = path.resolve("tmp/erp1-erp2-MERGED.csv");
  const skipPath = path.resolve("tmp/erp1-erp2-SKIP.csv");
  writeCsv(
    keepPath,
    [
      "phone",
      "keep_name",
      "loser_name",
      "keep_email",
      "loser_email",
      "keep_id",
      "loser_id",
    ],
    mergeList
  );
  writeCsv(
    skipPath,
    ["keep_reason", "phone", "names", "sources", "ids"],
    skipList
  );

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        wouldMerge: mergeList.length,
        skip: skipList.length,
        skipReasons: skipList.reduce((a, r) => {
          a[r.keep_reason] = (a[r.keep_reason] || 0) + 1;
          return a;
        }, {}),
        merged,
        adaptMoved,
        lastPurchasePatched,
        emailsCopied,
        keepCsv: keepPath,
        skipCsv: skipPath,
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
