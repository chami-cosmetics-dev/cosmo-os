/**
 * Same customer email, 2+ different phones. After cosmetics/invalid strip.
 *   node scripts/with-env.mjs cosmo-prod node tmp/report-same-email-two-phones.cjs
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
const DOWNLOADS = "C:\\Users\\Bad-Boy\\Downloads";

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

const KNOWN_CASHIER = new Set([
  "sewwandikaushalya293@gmail.com",
  "hpg.inoka@gmail.com",
  "mnktrading24@gmail.com",
  "ajstradinglanka@gmail.com",
  "dilrukshi1994nil@gmail.com",
  "tharidudanushka1013@gmail.com",
  "sandalisemini17@gmail.com",
  "natiimasha111@gmail.com",
  "iroshinijayawardena7@gmail.com",
  "channa@lmj.lk",
  "maneeshagim@gmail.com",
  "lathansubashini@gmail.com",
  "achinikaushalya6@gmail.com",
  "achinikaushalya06@gmail.com",
  "i.shanu12@gmail.com",
  "yasadari123@gmail.com",
  "renuspj92@mail.com",
  "sandali.nirasha19991231@gmail.com",
  "asankabiz84@gmail.com",
  "lmjtab6@gmail.com",
  "sadeepaindunil123@gamil.com",
  "kiribathgodapos1@gmail.com",
  "coolplanetpos1@gmail.com",
]);

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCsv(file, header, rows) {
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(header.map((h) => csvEscape(row[h] ?? "")).join(","));
  }
  fs.writeFileSync(file, lines.join("\n") + "\n", "utf8");
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

function remainingStaffEmail(email) {
  const e = String(email || "").toLowerCase();
  if (KNOWN_CASHIER.has(e)) return true;
  if (e.endsWith("@cosmetics.lk") || e.endsWith("@lmj.lk")) return true;
  if (e.includes("cosmetic") || e.includes("cosmatics")) return true;
  if (e.includes("pos1@") || e.includes("pos2@")) return true;
  return false;
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(ms|mrs|mr|miss|dr)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const contacts = await prisma.contactMaster.findMany({
    where: { companyId: COMPANY_ID },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      source: true,
      emails: { select: { email: true } },
      phones: { select: { phoneNumber: true } },
    },
  });

  const adaptSums = await prisma.adaptPurchaseHistory.groupBy({
    by: ["contactId"],
    where: { companyId: COMPANY_ID },
    _sum: { ttlAmount: true },
    _count: { _all: true },
  });
  const adaptByContact = new Map(
    adaptSums.map((r) => [
      r.contactId,
      { count: r._count._all, amount: Number(r._sum.ttlAmount || 0) },
    ])
  );

  const byEmail = new Map();
  let liveWithEmail = 0;
  let leftoverStaffContacts = 0;

  for (const c of contacts) {
    const hasPhone = !!String(c.phoneNumber || "").trim();
    const hasEmail = !!String(c.email || "").trim();
    if (!hasPhone && !hasEmail) continue;

    const extras = [];
    for (const p of c.phones) {
      const extra = canonicalLocal(p.phoneNumber);
      const primary = canonicalLocal(c.phoneNumber);
      if (extra && extra !== primary) extras.push(extra);
    }

    const rawEmails = [c.email, ...c.emails.map((e) => e.email)].filter(Boolean);
    const uniqEmails = [...new Set(rawEmails.map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
    if (!uniqEmails.length) continue;
    liveWithEmail += 1;

    for (const email of uniqEmails) {
      if (remainingStaffEmail(email)) {
        leftoverStaffContacts += 1;
        continue;
      }
      if (!byEmail.has(email)) byEmail.set(email, []);
      byEmail.get(email).push({
        id: c.id,
        name: c.name,
        phone: canonicalLocal(c.phoneNumber),
        phoneRaw: c.phoneNumber || "",
        extras,
        source: c.source || "",
        adaptCount: adaptByContact.get(c.id)?.count || 0,
        adaptAmount: adaptByContact.get(c.id)?.amount || 0,
        emailOnly: !hasPhone,
      });
    }
  }

  const review = [];
  const leftoverShared = [];
  const oneCardTwoPhones = [];

  for (const [email, list] of byEmail) {
    const uniq = [...new Map(list.map((c) => [c.id, c])).values()];
    const phones = [];
    for (const c of uniq) {
      if (c.phone) phones.push(c.phone);
      for (const extra of c.extras) phones.push(extra);
    }
    const uniqPhones = [...new Set(phones)];
    if (uniqPhones.length < 2) continue;

    const names = [...new Set(uniq.map((c) => normalizeName(c.name)).filter(Boolean))];
    const namesSame = names.length <= 1 ? "YES" : "no";
    const extraOnCards = uniq.filter((c) => c.extras.length).length;

    const row = {
      confirm: "",
      email,
      cards: uniq.length,
      distinct_phones: uniqPhones.length,
      names_same: namesSame,
      names: uniq.map((c) => c.name).join(" | "),
      phones: uniqPhones.join(" | "),
      sources: uniq.map((c) => c.source || "").join(" | "),
      adapt_counts: uniq.map((c) => String(c.adaptCount)).join(" | "),
      adapt_amounts: uniq.map((c) => String(Math.round(c.adaptAmount))).join(" | "),
      ids: uniq.map((c) => c.id).join(" | "),
      extra_phone_on_card: extraOnCards ? "YES" : "",
      email_only_card: uniq.some((c) => c.emailOnly) ? "YES" : "",
      name_a: uniq[0]?.name || "",
      phone_a: uniq[0]?.phone || uniq[0]?.phoneRaw || "",
      id_a: uniq[0]?.id || "",
      name_b: uniq[1]?.name || "",
      phone_b: uniq[1]?.phone || uniq[1]?.phoneRaw || "",
      id_b: uniq[1]?.id || "",
    };

    if (uniq.length === 1) {
      oneCardTwoPhones.push(row);
      continue;
    }
    if (uniq.length >= 8) {
      leftoverShared.push(row);
      continue;
    }
    review.push(row);
  }

  const byLikely = (a, b) => {
    if (a.names_same !== b.names_same) return a.names_same === "YES" ? -1 : 1;
    if (a.cards !== b.cards) return a.cards - b.cards;
    return a.email.localeCompare(b.email);
  };
  review.sort(byLikely);
  leftoverShared.sort((a, b) => b.cards - a.cards);
  oneCardTwoPhones.sort((a, b) => a.email.localeCompare(b.email));

  const likelySameName = review.filter((r) => r.names_same === "YES");
  const differentName = review.filter((r) => r.names_same !== "YES");

  const outDir = path.resolve("tmp/audit-contacts");
  fs.mkdirSync(outDir, { recursive: true });
  const header = [
    "confirm",
    "email",
    "cards",
    "distinct_phones",
    "names_same",
    "names",
    "phones",
    "sources",
    "adapt_counts",
    "adapt_amounts",
    "ids",
    "extra_phone_on_card",
    "email_only_card",
    "name_a",
    "phone_a",
    "id_a",
    "name_b",
    "phone_b",
    "id_b",
  ];

  const reviewPath = path.join(outDir, "same-email-two-phones-REVIEW.csv");
  const leftoverPath = path.join(outDir, "same-email-two-phones-leftover-shared.csv");
  const oneCardPath = path.join(outDir, "same-email-one-card-two-phones.csv");
  writeCsv(reviewPath, header, review);
  writeCsv(leftoverPath, header, leftoverShared);
  writeCsv(oneCardPath, header, oneCardTwoPhones);

  for (const destName of [
    "same-email-two-phones-REVIEW.csv",
    "same-email-two-phones-leftover-shared.csv",
    "same-email-one-card-two-phones.csv",
  ]) {
    fs.copyFileSync(path.join(outDir, destName), path.join(DOWNLOADS, destName));
  }

  const summary = {
    liveContactsWithEmail: liveWithEmail,
    leftoverStaffEmailHitsSkipped: leftoverStaffContacts,
    reviewRows: review.length,
    likelySameNameTwoPhones: likelySameName.length,
    differentNameSameEmail: differentName.length,
    leftoverSharedEmail8PlusCards: leftoverShared.length,
    alreadyOneCardTwoPhones: oneCardTwoPhones.length,
    files: {
      review: reviewPath,
      leftover: leftoverPath,
      oneCard: oneCardPath,
      downloads: DOWNLOADS,
    },
  };
  fs.writeFileSync(path.join(outDir, "same-email-two-phones-summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
