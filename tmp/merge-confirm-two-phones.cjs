/**
 * Merge CONFIRM.csv pairs: keep later-purchase card as Primary,
 * attach other phone as Previous (ContactPhone).
 *
 *   node scripts/with-env.mjs cosmo-prod node tmp/merge-confirm-two-phones.cjs --dry-run
 *   node scripts/with-env.mjs cosmo-prod node tmp/merge-confirm-two-phones.cjs --apply
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
const apply = process.argv.includes("--apply");
const SRC = path.resolve(
  "tmp/same-email-two-phones/same-email-two-phones-CONFIRM.csv"
);

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

const SRC_RANK = { erp1: 3, erp2: 2, adapt: 1 };

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

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(ms|mrs|mr|miss|dr)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isStoreName(name) {
  const n = normalizeName(name);
  return STORE_HINTS.some((h) => n.includes(h));
}

function isSharedEmail(email) {
  const e = String(email || "").toLowerCase();
  return (
    e.endsWith("@cosmetics.lk") ||
    e.includes("cosmetic") ||
    e.includes("cosmatics") ||
    e.includes("pos1@") ||
    e.includes("pos2@")
  );
}

function pickKeep(a, b, adaptByContact) {
  const aT = a.lastPurchaseAt ? a.lastPurchaseAt.getTime() : 0;
  const bT = b.lastPurchaseAt ? b.lastPurchaseAt.getTime() : 0;
  if (aT !== bT) return aT > bT ? a : b;
  const aa = adaptByContact.get(a.id) || { count: 0, amount: 0 };
  const ba = adaptByContact.get(b.id) || { count: 0, amount: 0 };
  if (aa.amount !== ba.amount) return aa.amount >= ba.amount ? a : b;
  if (aa.count !== ba.count) return aa.count >= ba.count ? a : b;
  const ar = SRC_RANK[a.source] || 0;
  const br = SRC_RANK[b.source] || 0;
  if (ar !== br) return ar >= br ? a : b;
  return a;
}

async function attachPreviousPhone(keepId, keepPrimary, previousRaw) {
  const previous = canonicalLocal(previousRaw);
  const primary = canonicalLocal(keepPrimary);
  if (!previous || previous === primary) return false;
  const existing = await prisma.contactPhone.findFirst({
    where: { contactId: keepId, phoneNumber: previous },
    select: { id: true },
  });
  if (existing) return false;
  await prisma.contactPhone.create({
    data: { contactId: keepId, phoneNumber: previous, isPrimary: false },
  });
  return true;
}

async function main() {
  const table = parseCsv(fs.readFileSync(SRC, "utf8"));
  const header = table[0];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const get = (r, k) => r[idx[k]] ?? "";

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

  const livePhones = await prisma.contactMaster.findMany({
    where: { companyId: COMPANY_ID, phoneNumber: { not: null } },
    select: { id: true, phoneNumber: true },
  });
  const byPhone = new Map();
  for (const c of livePhones) {
    const canon = canonicalLocal(c.phoneNumber);
    if (!canon) continue;
    if (!byPhone.has(canon)) byPhone.set(canon, []);
    byPhone.get(canon).push(c.id);
  }

  const mergeList = [];
  const skipList = [];

  for (const r of table.slice(1)) {
    const idA = get(r, "id_a");
    const idB = get(r, "id_b");
    const email = String(get(r, "email") || "").toLowerCase();
    const base = {
      email,
      names: get(r, "names"),
      phones: get(r, "phones"),
      id_a: idA,
      id_b: idB,
    };
    if (!idA || !idB) {
      skipList.push({ ...base, skip_reason: "missing_ids" });
      continue;
    }

    const [cardA, cardB] = await Promise.all([
      prisma.contactMaster.findUnique({
        where: { id: idA },
        select: {
          id: true,
          name: true,
          phoneNumber: true,
          email: true,
          source: true,
          lastPurchaseAt: true,
          emails: { select: { email: true } },
          phones: { select: { phoneNumber: true } },
        },
      }),
      prisma.contactMaster.findUnique({
        where: { id: idB },
        select: {
          id: true,
          name: true,
          phoneNumber: true,
          email: true,
          source: true,
          lastPurchaseAt: true,
          emails: { select: { email: true } },
          phones: { select: { phoneNumber: true } },
        },
      }),
    ]);

    if (!cardA || !cardB) {
      skipList.push({ ...base, skip_reason: "card_already_gone" });
      continue;
    }
    if (isStoreName(cardA.name) || isStoreName(cardB.name)) {
      skipList.push({ ...base, skip_reason: "shop_or_pos_card" });
      continue;
    }
    if (normalizeName(cardA.name) !== normalizeName(cardB.name)) {
      skipList.push({
        ...base,
        skip_reason: "live_names_no_longer_same",
        live_names: `${cardA.name} | ${cardB.name}`,
      });
      continue;
    }

    const phoneA = canonicalLocal(cardA.phoneNumber);
    const phoneB = canonicalLocal(cardB.phoneNumber);
    if (!phoneA || !phoneB) {
      skipList.push({ ...base, skip_reason: "missing_live_phone" });
      continue;
    }
    if (phoneA === phoneB) {
      skipList.push({ ...base, skip_reason: "same_phone_already" });
      continue;
    }

    const thirdA = (byPhone.get(phoneA) || []).filter((id) => id !== idA && id !== idB);
    const thirdB = (byPhone.get(phoneB) || []).filter((id) => id !== idA && id !== idB);
    if (thirdA.length || thirdB.length) {
      skipList.push({ ...base, skip_reason: "phone_on_third_card" });
      continue;
    }

    const keep = pickKeep(cardA, cardB, adaptByContact);
    const loser = keep.id === cardA.id ? cardB : cardA;
    const keepPhone = canonicalLocal(keep.phoneNumber);
    const loserPhone = canonicalLocal(loser.phoneNumber);

    mergeList.push({
      email,
      keep_name: keep.name,
      loser_name: loser.name,
      primary_phone: keepPhone,
      previous_phone: loserPhone,
      keep_source: keep.source || "",
      loser_source: loser.source || "",
      keep_adapt: String(adaptByContact.get(keep.id)?.count || 0),
      loser_adapt: String(adaptByContact.get(loser.id)?.count || 0),
      keep_id: keep.id,
      loser_id: loser.id,
    });
  }

  let merged = 0;
  let adaptMoved = 0;
  let previousAttached = 0;
  let lastPurchasePatched = 0;
  let emailsCopied = 0;
  let errors = 0;

  if (apply) {
    for (const p of mergeList) {
      try {
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
            phones: { select: { phoneNumber: true } },
          },
        });
        if (!keep || !loser) continue;
        const keepPhone = canonicalLocal(keep.phoneNumber);
        const loserPhone = canonicalLocal(loser.phoneNumber);
        if (!keepPhone || !loserPhone || keepPhone === loserPhone) continue;

        if (String(keep.phoneNumber) !== keepPhone) {
          await prisma.contactMaster.update({
            where: { id: keep.id },
            data: { phoneNumber: keepPhone },
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

        const attached = await attachPreviousPhone(keep.id, keepPhone, loserPhone);
        if (attached) previousAttached += 1;
        for (const extra of loser.phones) {
          const ok = await attachPreviousPhone(keep.id, keepPhone, extra.phoneNumber);
          if (ok) previousAttached += 1;
        }

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
          const n = String(email || "")
            .trim()
            .toLowerCase();
          if (!n || keepEmails.has(n) || isSharedEmail(n)) continue;
          if (!keep.email || isSharedEmail(keep.email)) {
            await prisma.contactMaster.update({
              where: { id: keep.id },
              data: { email: n },
            });
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
        if (merged % 50 === 0) console.error(`progress ${merged}/${mergeList.length}`);
      } catch (err) {
        errors += 1;
        console.error(`FAIL ${p.keep_id} ${p.email}: ${err.message}`);
      }
    }
  }

  const outDir = path.resolve("tmp/same-email-two-phones");
  const mergePath = path.join(outDir, "CONFIRM-MERGED.csv");
  const skipPath = path.join(outDir, "CONFIRM-SKIP.csv");
  writeCsv(
    mergePath,
    [
      "email",
      "keep_name",
      "primary_phone",
      "previous_phone",
      "keep_source",
      "loser_source",
      "keep_adapt",
      "loser_adapt",
      "keep_id",
      "loser_id",
    ],
    mergeList
  );
  writeCsv(
    skipPath,
    ["skip_reason", "email", "names", "phones", "id_a", "id_b"],
    skipList
  );

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        wouldMerge: mergeList.length,
        skip: skipList.length,
        skipReasons: skipList.reduce((a, r) => {
          a[r.skip_reason] = (a[r.skip_reason] || 0) + 1;
          return a;
        }, {}),
        merged,
        adaptMoved,
        previousAttached,
        lastPurchasePatched,
        emailsCopied,
        errors,
        mergeCsv: mergePath,
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
