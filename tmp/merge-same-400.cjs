/**
 * Merge SIMPLE CSV verdict=SAME only, after live re-check.
 * Not-same / shop / missing → keep both, write review CSV.
 *
 *   node scripts/with-env.mjs cosmo-prod node tmp/merge-same-400.cjs --dry-run
 *   node scripts/with-env.mjs cosmo-prod node tmp/merge-same-400.cjs --apply
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
const apply = process.argv.includes("--apply");
const SRC = path.resolve("tmp/cosmo-split-contacts-SIMPLE.csv");

const raw = process.env.DATABASE_URL || "";
const prisma = new PrismaClient({
  datasources: { db: { url: raw.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || raw } },
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
];

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
  fs.writeFileSync(file, lines.join("\n"), "utf8");
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

function variants(rawPhone) {
  const canon = canonicalLocal(rawPhone);
  const out = new Set();
  const t = String(rawPhone || "").trim();
  if (t) out.add(t);
  if (canon) {
    out.add(canon);
    out.add(canon.slice(1));
    out.add(`94${canon.slice(1)}`);
    out.add(`+94${canon.slice(1)}`);
  }
  return [...out].filter(Boolean);
}

async function main() {
  const table = parseCsv(fs.readFileSync(SRC, "utf8"));
  const header = table[0];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const get = (r, k) => r[idx[k]] ?? "";

  const keepList = [];
  const mergeList = [];

  for (const r of table.slice(1)) {
    const verdict = get(r, "verdict");
    const base = {
      verdict,
      email_card_name: get(r, "email_card_name"),
      email_card_email: get(r, "email_card_email"),
      phone_card_name: get(r, "phone_card_name"),
      phone_card_phone: get(r, "phone_card_phone"),
      erp_name: get(r, "erp_name"),
      names_look_same: get(r, "names_look_same"),
      email_card_id: get(r, "email_card_id"),
      phone_card_id: get(r, "phone_card_id"),
      email_card_web_orders: get(r, "email_card_web_orders"),
      phone_card_adapt_invoices: get(r, "phone_card_adapt_invoices"),
    };

    if (verdict !== "SAME") {
      keepList.push({
        ...base,
        keep_reason:
          verdict === "MAYBE" ? "names_only_partly_match" : "names_do_not_match",
      });
      continue;
    }

    const emailCard = await prisma.contactMaster.findUnique({
      where: { id: base.email_card_id },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        email: true,
        lastPurchaseAt: true,
        emails: { select: { email: true } },
      },
    });
    const phoneCard = await prisma.contactMaster.findUnique({
      where: { id: base.phone_card_id },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        email: true,
        lastPurchaseAt: true,
        emails: { select: { email: true } },
      },
    });

    if (!emailCard || !phoneCard) {
      keepList.push({ ...base, keep_reason: "card_already_gone" });
      continue;
    }
    if (isStoreName(phoneCard.name) || isStoreName(emailCard.name)) {
      keepList.push({ ...base, keep_reason: "shop_or_pos_card" });
      continue;
    }
    if (isSharedEmail(base.email_card_email) || isSharedEmail(emailCard.email)) {
      keepList.push({ ...base, keep_reason: "shared_shop_email" });
      continue;
    }

    const liveScore = jaccard(emailCard.name, phoneCard.name);
    const liveSame = normalizeName(emailCard.name) === normalizeName(phoneCard.name);
    const overlap = tokens(emailCard.name).filter((t) => tokens(phoneCard.name).includes(t)).length;
    const stillSame = liveSame || liveScore >= 0.4 || overlap >= 2 || get(r, "names_look_same") === "YES";

    if (!stillSame) {
      keepList.push({ ...base, keep_reason: "live_names_no_longer_same", name_score: liveScore });
      continue;
    }

    const emailPhone = String(emailCard.phoneNumber || "").trim();
    if (emailPhone) {
      const c1 = canonicalLocal(emailPhone);
      const c2 = canonicalLocal(phoneCard.phoneNumber);
      if (c1 && c2 && c1 !== c2) {
        keepList.push({ ...base, keep_reason: "email_card_now_has_different_phone" });
        continue;
      }
    }

    mergeList.push({
      ...base,
      live_email_name: emailCard.name,
      live_phone_name: phoneCard.name,
      name_score: Number(liveScore.toFixed(3)),
      fill_phone: canonicalLocal(phoneCard.phoneNumber) || String(phoneCard.phoneNumber || "").trim(),
    });
  }

  let merged = 0;
  let adaptMoved = 0;
  let ordersFilled = 0;
  let lastPurchasePatched = 0;

  if (apply) {
    for (const p of mergeList) {
      const keep = await prisma.contactMaster.findUnique({
        where: { id: p.phone_card_id },
        select: { id: true, email: true, lastPurchaseAt: true, phoneNumber: true },
      });
      const loser = await prisma.contactMaster.findUnique({
        where: { id: p.email_card_id },
        select: {
          id: true,
          email: true,
          lastPurchaseAt: true,
          emails: { select: { email: true } },
        },
      });
      if (!keep || !loser) continue;

      const canon = canonicalLocal(keep.phoneNumber) || p.fill_phone;
      if (canon && !/^0\d{9}$/.test(String(keep.phoneNumber || ""))) {
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
      }

      const emailForOrders = p.email_card_email;
      if (emailForOrders && !isSharedEmail(emailForOrders) && canon) {
        const orders = await prisma.order.findMany({
          where: {
            companyId: COMPANY_ID,
            customerEmail: { equals: emailForOrders, mode: "insensitive" },
            OR: [{ customerPhone: null }, { customerPhone: "" }],
          },
          select: { id: true, createdAt: true },
        });
        for (const o of orders) {
          await prisma.order.update({ where: { id: o.id }, data: { customerPhone: canon } });
          ordersFilled += 1;
        }
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

  const keepPath = path.resolve("tmp/split-contacts-KEEP-DO-NOT-MERGE.csv");
  const mergePath = path.resolve("tmp/split-contacts-MERGED.csv");
  writeCsv(
    keepPath,
    [
      "keep_reason",
      "verdict",
      "email_card_name",
      "email_card_email",
      "phone_card_name",
      "phone_card_phone",
      "erp_name",
      "email_card_web_orders",
      "phone_card_adapt_invoices",
      "email_card_id",
      "phone_card_id",
    ],
    keepList
  );
  writeCsv(
    mergePath,
    [
      "email_card_name",
      "live_email_name",
      "email_card_email",
      "phone_card_name",
      "live_phone_name",
      "phone_card_phone",
      "fill_phone",
      "name_score",
      "email_card_id",
      "phone_card_id",
    ],
    mergeList
  );

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        wouldMerge: mergeList.length,
        keepForReview: keepList.length,
        keepReasons: keepList.reduce((a, r) => {
          a[r.keep_reason] = (a[r.keep_reason] || 0) + 1;
          return a;
        }, {}),
        merged,
        adaptMoved,
        ordersFilled,
        lastPurchasePatched,
        keepCsv: keepPath,
        mergedCsv: mergePath,
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
