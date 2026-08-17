/**
 * Full contact-duplicate / split-purchase audit.
 *   node scripts/with-env.mjs cosmo-prod node tmp/audit-contact-duplicates.cjs
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
const JUNK = new Set(["0123455555", "0000000000", "0123456789"]);

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

function isSharedEmail(email) {
  const e = String(email || "").toLowerCase();
  return (
    !e ||
    e.endsWith("@cosmetics.lk") ||
    e.includes(".cosmetics@") ||
    e.includes("pos1@gmail.com") ||
    e.includes("pos2@gmail.com") ||
    e.includes("cosmetics")
  );
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
      lastPurchaseAt: true,
      emails: { select: { email: true } },
      phones: { select: { phoneNumber: true } },
      _count: { select: { adaptPurchases: true } },
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

  let live = 0;
  let strippedShells = 0;
  let emailOnly = 0;
  let phoneCards = 0;

  const byPhone = new Map();
  const byEmail = new Map();
  const idMap = new Map();

  for (const c of contacts) {
    idMap.set(c.id, c);
    const hasPhone = !!String(c.phoneNumber || "").trim();
    const hasEmail = !!String(c.email || "").trim();
    if (!hasPhone && !hasEmail) {
      strippedShells += 1;
      continue;
    }
    live += 1;
    if (hasPhone) phoneCards += 1;
    else emailOnly += 1;

    if (hasPhone) {
      const canon = canonicalLocal(c.phoneNumber);
      if (canon && !JUNK.has(canon)) {
        if (!byPhone.has(canon)) byPhone.set(canon, []);
        byPhone.get(canon).push(c);
      }
    }
    const emails = [c.email, ...c.emails.map((e) => e.email)].filter(Boolean);
    for (const raw of emails) {
      const e = String(raw).trim().toLowerCase();
      if (isSharedEmail(e)) continue;
      if (!byEmail.has(e)) byEmail.set(e, []);
      byEmail.get(e).push(c);
    }
  }

  const samePhone = [];
  for (const [phone, list] of byPhone) {
    const uniq = [...new Map(list.map((c) => [c.id, c])).values()];
    if (uniq.length < 2) continue;
    samePhone.push({
      phone,
      count: uniq.length,
      names: uniq.map((c) => c.name).join(" | "),
      sources: uniq.map((c) => c.source || "").join(" | "),
      emails: uniq.map((c) => c.email || "").join(" | "),
      phones_raw: uniq.map((c) => c.phoneNumber || "").join(" | "),
      adapt_counts: uniq.map((c) => String(adaptByContact.get(c.id)?.count || 0)).join(" | "),
      adapt_amounts: uniq.map((c) => String(adaptByContact.get(c.id)?.amount || 0)).join(" | "),
      ids: uniq.map((c) => c.id).join(" | "),
    });
  }

  const sameEmail = [];
  for (const [email, list] of byEmail) {
    const uniq = [...new Map(list.map((c) => [c.id, c])).values()];
    if (uniq.length < 2) continue;
    const withId = uniq.filter(
      (c) => String(c.phoneNumber || "").trim() || String(c.email || "").trim()
    );
    if (withId.length < 2) continue;
    sameEmail.push({
      email,
      count: withId.length,
      names: withId.map((c) => c.name).join(" | "),
      phones: withId.map((c) => c.phoneNumber || "none").join(" | "),
      sources: withId.map((c) => c.source || "").join(" | "),
      adapt_counts: withId.map((c) => String(adaptByContact.get(c.id)?.count || 0)).join(" | "),
      adapt_amounts: withId.map((c) => String(adaptByContact.get(c.id)?.amount || 0)).join(" | "),
      ids: withId.map((c) => c.id).join(" | "),
    });
  }

  const emailSplits = [];
  for (const [email, list] of byEmail) {
    const uniq = [...new Map(list.map((c) => [c.id, c])).values()].filter(
      (c) => String(c.phoneNumber || "").trim() || String(c.email || "").trim()
    );
    const emailOnlyCards = uniq.filter((c) => !String(c.phoneNumber || "").trim());
    const phoneCardsForEmail = uniq.filter((c) => String(c.phoneNumber || "").trim());
    if (emailOnlyCards.length === 0 || phoneCardsForEmail.length === 0) continue;
    for (const eCard of emailOnlyCards) {
      for (const pCard of phoneCardsForEmail) {
        emailSplits.push({
          email,
          email_name: eCard.name,
          phone_name: pCard.name,
          phone: pCard.phoneNumber,
          names_same: normalizeName(eCard.name) === normalizeName(pCard.name) ? "YES" : "no",
          email_adapt: adaptByContact.get(eCard.id)?.count || 0,
          phone_adapt: adaptByContact.get(pCard.id)?.count || 0,
          phone_adapt_amount: adaptByContact.get(pCard.id)?.amount || 0,
          email_card_id: eCard.id,
          phone_card_id: pCard.id,
          risk: "split_total_if_web_orders_on_email_and_adapt_on_phone",
        });
      }
    }
  }

  const previousPhones = [];
  const secondaryClash = [];
  for (const c of contacts) {
    const primary = String(c.phoneNumber || "").trim();
    if (!c.phones.length) continue;
    const primaryCanon = canonicalLocal(primary);
    for (const row of c.phones) {
      const extra = String(row.phoneNumber || "").trim();
      if (!extra) continue;
      const extraCanon = canonicalLocal(extra);
      const sameAsPrimary = extraCanon && primaryCanon && extraCanon === primaryCanon;
      if (sameAsPrimary) {
        if (extra !== primary) {
          previousPhones.push({
            name: c.name,
            primary_phone: primary,
            extra_phone: extra,
            kind: "same_number_old_format",
            contact_id: c.id,
          });
        }
        continue;
      }
      previousPhones.push({
        name: c.name,
        primary_phone: primary || "none",
        extra_phone: extra,
        kind: "other_number_on_card",
        contact_id: c.id,
      });
      if (extraCanon && byPhone.has(extraCanon)) {
        const others = byPhone.get(extraCanon).filter((o) => o.id !== c.id);
        if (others.length) {
          secondaryClash.push({
            this_name: c.name,
            this_phone: primary || "none",
            extra_phone: extra,
            other_name: others.map((o) => o.name).join(" | "),
            other_phone: others.map((o) => o.phoneNumber).join(" | "),
            this_id: c.id,
            other_ids: others.map((o) => o.id).join(" | "),
            risk: "order_total_may_pull_other_customer_phone",
          });
        }
      }
    }
  }

  const outDir = path.resolve("tmp/audit-contacts");
  fs.mkdirSync(outDir, { recursive: true });
  writeCsv(
    path.join(outDir, "same-phone.csv"),
    [
      "phone",
      "count",
      "names",
      "sources",
      "emails",
      "phones_raw",
      "adapt_counts",
      "adapt_amounts",
      "ids",
    ],
    samePhone.sort((a, b) => b.count - a.count)
  );
  writeCsv(
    path.join(outDir, "same-email.csv"),
    [
      "email",
      "count",
      "names",
      "phones",
      "sources",
      "adapt_counts",
      "adapt_amounts",
      "ids",
    ],
    sameEmail.sort((a, b) => b.count - a.count)
  );
  writeCsv(
    path.join(outDir, "email-phone-split.csv"),
    [
      "email",
      "email_name",
      "phone_name",
      "phone",
      "names_same",
      "email_adapt",
      "phone_adapt",
      "phone_adapt_amount",
      "email_card_id",
      "phone_card_id",
      "risk",
    ],
    emailSplits
  );
  writeCsv(
    path.join(outDir, "previous-or-extra-phones.csv"),
    ["name", "primary_phone", "extra_phone", "kind", "contact_id"],
    previousPhones
  );
  writeCsv(
    path.join(outDir, "secondary-phone-clash.csv"),
    [
      "this_name",
      "this_phone",
      "extra_phone",
      "other_name",
      "other_phone",
      "this_id",
      "other_ids",
      "risk",
    ],
    secondaryClash
  );

  const summary = {
    contactsTotal: contacts.length,
    liveWithPhoneOrEmail: live,
    phoneCards,
    emailOnlyLive: emailOnly,
    strippedShellsNoPhoneNoEmail: strippedShells,
    samePhoneGroups: samePhone.length,
    sameEmailGroups: sameEmail.length,
    emailPhoneSplits: emailSplits.length,
    extraPhonesOnCards: previousPhones.length,
    extraSameFormat: previousPhones.filter((r) => r.kind === "same_number_old_format").length,
    extraOtherNumber: previousPhones.filter((r) => r.kind === "other_number_on_card").length,
    secondaryPhoneClash: secondaryClash.length,
    files: outDir,
  };
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
