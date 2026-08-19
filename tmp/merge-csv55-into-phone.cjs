/**
 * Merge CSV "phone already on another card" pairs into the phone contact.
 * Same-name only. Skip shop/POS names and name mismatches.
 *
 *   node scripts/with-env.mjs cosmo-prod node tmp/merge-csv55-into-phone.cjs --dry-run
 *   node scripts/with-env.mjs cosmo-prod node tmp/merge-csv55-into-phone.cjs --apply
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
const apply = process.argv.includes("--apply");
const PLAN = path.resolve("tmp/email-only-phone-apply-plan.csv");

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
  "web",
  "chami trading",
  "pepiliyana",
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
  return e.endsWith("@cosmetics.lk") || e.includes(".cosmetics@") || e.endsWith("pos1@gmail.com");
}

async function main() {
  const rows = parseCsv(fs.readFileSync(PLAN, "utf8"));
  const header = rows[0];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const get = (r, k) => r[idx[k]] ?? "";

  const plan = [];
  for (const r of rows.slice(1)) {
    if (get(r, "action") !== "fill_orders_on_existing_phone_contact") continue;
    const emailName = get(r, "csv_name");
    const phoneName = get(r, "other_name");
    const emailId = get(r, "contact_id");
    const phoneId = get(r, "other_id");
    const email = get(r, "csv_email");
    const score = jaccard(emailName, phoneName);
    const same = normalizeName(emailName) === normalizeName(phoneName);
    const overlap = tokens(emailName).filter((t) => tokens(phoneName).includes(t)).length;

    let action = "merge_email_into_phone";
    let reason = "names_match";
    if (isStoreName(phoneName) || isStoreName(emailName)) {
      action = "skip";
      reason = "phone_is_shop_or_pos_card";
    } else if (isSharedEmail(email)) {
      action = "skip";
      reason = "shared_email";
    } else if (!same && score < 0.4 && overlap < 2) {
      action = "skip";
      reason = "name_mismatch";
    } else if (!same && score < 0.67 && overlap < 2) {
      action = "skip";
      reason = "name_maybe";
    }

    plan.push({
      action,
      reason,
      email_card_id: emailId,
      email_card_name: emailName,
      email: email,
      phone_card_id: phoneId,
      phone_card_name: phoneName,
      phone: get(r, "other_phone") || get(r, "canon_phone"),
      name_score: Number(score.toFixed(3)),
    });
  }

  let merged = 0;
  let adaptMoved = 0;
  if (apply) {
    for (const p of plan.filter((x) => x.action === "merge_email_into_phone")) {
      const keep = await prisma.contactMaster.findUnique({
        where: { id: p.phone_card_id },
        select: { id: true, email: true, lastPurchaseAt: true },
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

  const out = path.resolve("tmp/csv55-merge-plan.csv");
  const cols = [
    "action",
    "reason",
    "email_card_name",
    "phone_card_name",
    "name_score",
    "email",
    "phone",
    "email_card_id",
    "phone_card_id",
  ];
  const lines = [cols.join(",")];
  for (const p of plan) lines.push(cols.map((c) => csvEscape(p[c] ?? "")).join(","));
  fs.writeFileSync(out, lines.join("\n"), "utf8");

  const summary = { mode: apply ? "apply" : "dry-run", total: plan.length, by: {}, merged, adaptMoved, csv: out };
  for (const p of plan) {
    const k = `${p.action}:${p.reason}`;
    summary.by[k] = (summary.by[k] || 0) + 1;
  }
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
