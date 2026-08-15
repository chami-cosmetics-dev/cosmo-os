/**
 * For Cosmo email-only contacts with phones filled in the user's CSV:
 * - phone already on exactly one other Cosmo contact → fill blank Order.customerPhone on that email's orders
 * - phone not in Cosmo → set phone on the existing email-only contact (do not create a 2nd card)
 * Never use shared merchant emails. Never overwrite an order that already has a phone.
 *
 *   node scripts/with-env.mjs cosmo-prod node tmp/apply-email-only-phones-from-csv.cjs --dry-run
 *   node scripts/with-env.mjs cosmo-prod node tmp/apply-email-only-phones-from-csv.cjs --apply
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
const apply = process.argv.includes("--apply");
const CSV =
  process.argv.find((a) => a.startsWith("--file="))?.slice("--file=".length) ??
  "C:\\Users\\Bad-Boy\\Downloads\\cosmo-email-only-no-erp-match.csv";

const SHARED = new Set([
  "sales@cosmetics.lk",
  "info@lmj.lk",
  "info@cosmetics.lk",
]);
const SHARED_SUFFIX = ["@cosmetics.lk", ".cosmetics@outlook.com", ".cosmetics@gmail.com"];

const raw = process.env.DATABASE_URL || "";
const prisma = new PrismaClient({
  datasources: { db: { url: raw.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || raw } },
});

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

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

function phoneDigitsOnly(value) {
  let d = String(value || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  return d;
}

function canonicalLocal(rawPhone) {
  let d = phoneDigitsOnly(rawPhone);
  if (d.startsWith("94") && d.length >= 11) d = d.slice(2);
  if (d.startsWith("0") && d.length > 10) d = d.replace(/^0+/, "0");
  if (d.length === 9) d = `0${d}`;
  return d;
}

function isJunkPhone(rawPhone) {
  const d = canonicalLocal(rawPhone);
  if (d.length < 9) return true;
  if (d.length !== 10 || !d.startsWith("0")) return true;
  if (/^0?1{5,}$/.test(d)) return true;
  if (/^0?(\d)\1{8,}$/.test(d)) return true;
  if (["0123456789", "0123456780", "0123455555"].includes(d)) return true;
  return false;
}

function variants(rawPhone) {
  const t = String(rawPhone || "").trim();
  let d = phoneDigitsOnly(rawPhone);
  const out = new Set();
  if (t) out.add(t);
  if (d) {
    out.add(d);
    if (d.length === 9) {
      out.add(`0${d}`);
      out.add(`94${d}`);
    }
    if (d.length === 10 && d.startsWith("0")) {
      out.add(d.slice(1));
      out.add(`94${d.slice(1)}`);
      out.add(`+94${d.slice(1)}`);
    }
    if (d.length === 11 && d.startsWith("94")) {
      out.add(`0${d.slice(2)}`);
      out.add(d.slice(2));
    }
  }
  const canon = canonicalLocal(rawPhone);
  if (canon) {
    out.add(canon);
    out.add(canon.slice(1));
    out.add(`94${canon.slice(1)}`);
    out.add(`+94${canon.slice(1)}`);
  }
  return [...out].filter(Boolean);
}

function isSharedEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return false;
  if (SHARED.has(e)) return true;
  return SHARED_SUFFIX.some((s) => e.endsWith(s));
}

function normalizeEmail(value) {
  const t = String(value || "").trim().toLowerCase();
  return t || null;
}

async function main() {
  const rows = parseCsv(fs.readFileSync(CSV, "utf8"));
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const iId = header.findIndex((h) => h === "contact_id");
  const iName = header.findIndex((h) => h === "name");
  const iEmail = header.findIndex((h) => h === "primary_email");
  const iPhone = header.findIndex((h) => h.includes("phone"));
  if (iId < 0 || iPhone < 0) throw new Error("CSV missing contact_id or Phone number");

  const allContacts = await prisma.contactMaster.findMany({
    where: { companyId: COMPANY_ID },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      lastPurchaseAt: true,
      phones: { select: { phoneNumber: true } },
    },
  });
  const byId = new Map(allContacts.map((c) => [c.id, c]));
  const phoneToIds = new Map();
  for (const c of allContacts) {
    for (const phone of [c.phoneNumber, ...c.phones.map((p) => p.phoneNumber)]) {
      if (!phone) continue;
      for (const v of variants(phone)) {
        const set = phoneToIds.get(v) ?? new Set();
        set.add(c.id);
        phoneToIds.set(v, set);
      }
    }
  }

  function uniqueContactForPhone(phone) {
    const ids = new Set();
    for (const v of variants(phone)) {
      const set = phoneToIds.get(v);
      if (!set) continue;
      for (const id of set) ids.add(id);
    }
    return [...ids];
  }

  const plan = [];

  for (const r of rows.slice(1)) {
    const contactId = (r[iId] || "").trim();
    const csvName = (r[iName] || "").trim();
    const csvEmail = normalizeEmail(r[iEmail]);
    const rawPhone = (r[iPhone] || "").trim();
    const contact = byId.get(contactId);

    const base = {
      contact_id: contactId,
      csv_name: csvName,
      csv_email: csvEmail ?? "",
      csv_phone_raw: rawPhone,
      canon_phone: rawPhone ? canonicalLocal(rawPhone) : "",
    };

    if (!contact) {
      plan.push({ ...base, action: "skip", reason: "contact_not_found" });
      continue;
    }
    if (!rawPhone) {
      plan.push({ ...base, action: "skip", reason: "no_phone_in_csv" });
      continue;
    }
    if (isJunkPhone(rawPhone)) {
      plan.push({ ...base, action: "skip", reason: "junk_or_invalid_phone" });
      continue;
    }
    if (isSharedEmail(csvEmail) || isSharedEmail(contact.email)) {
      plan.push({ ...base, action: "skip", reason: "shared_merchant_email" });
      continue;
    }

    const phone = canonicalLocal(rawPhone);
    const owners = uniqueContactForPhone(phone).filter((id) => id !== contactId);
    const selfHasPhone = uniqueContactForPhone(phone).includes(contactId);

    if (owners.length >= 2) {
      plan.push({
        ...base,
        action: "skip",
        reason: "phone_on_two_or_more_other_contacts",
        other_ids: owners.join("|"),
      });
      continue;
    }

    if (owners.length === 1) {
      const other = byId.get(owners[0]);
      plan.push({
        ...base,
        action: "fill_orders_on_existing_phone_contact",
        reason: "phone_already_in_cosmo",
        other_id: other.id,
        other_name: other.name,
        other_phone: other.phoneNumber || phone,
        target_contact_id: other.id,
      });
      continue;
    }

    if (selfHasPhone && String(contact.phoneNumber || "").trim()) {
      plan.push({
        ...base,
        action: "fill_orders_only",
        reason: "phone_already_on_this_contact",
        target_contact_id: contactId,
      });
      continue;
    }

    plan.push({
      ...base,
      action: "add_phone_to_existing_email_contact",
      reason: "phone_not_in_cosmo",
      target_contact_id: contactId,
    });
  }

  const fillRows = [];
  let contactsPhoned = 0;
  let lastPurchasePatched = 0;
  let ordersPatched = 0;

  for (const row of plan) {
    if (row.action === "skip") continue;
    const email = row.csv_email;
    const phone = row.canon_phone;
    const targetId = row.target_contact_id;
    if (!email || !phone || !targetId) continue;

    const orders = await prisma.order.findMany({
      where: {
        companyId: COMPANY_ID,
        customerEmail: { equals: email, mode: "insensitive" },
      },
      select: {
        id: true,
        name: true,
        customerPhone: true,
        createdAt: true,
      },
    });

    const blank = orders.filter((o) => !String(o.customerPhone || "").trim());
    const skippedHasPhone = orders.length - blank.length;
    row.orders_matched_by_email = orders.length;
    row.orders_blank_phone_to_fill = blank.length;
    row.orders_already_have_phone = skippedHasPhone;

    const latest = orders.reduce((acc, o) => (!acc || o.createdAt > acc ? o.createdAt : acc), null);

    if (apply) {
      if (row.action === "add_phone_to_existing_email_contact") {
        await prisma.contactMaster.update({
          where: { id: row.contact_id },
          data: { phoneNumber: phone },
        });
        contactsPhoned += 1;
        for (const v of variants(phone)) {
          const set = phoneToIds.get(v) ?? new Set();
          set.add(row.contact_id);
          phoneToIds.set(v, set);
        }
      }
      for (const o of blank) {
        await prisma.order.update({
          where: { id: o.id },
          data: { customerPhone: phone },
        });
        ordersPatched += 1;
      }
      if (latest) {
        const target = byId.get(targetId);
        if (!target?.lastPurchaseAt || target.lastPurchaseAt < latest) {
          await prisma.contactMaster.update({
            where: { id: targetId },
            data: { lastPurchaseAt: latest },
          });
          lastPurchasePatched += 1;
        }
      }
    }

    fillRows.push({
      ...row,
      latest_order_at: latest ? latest.toISOString() : "",
    });
  }

  const out = path.resolve("tmp/email-only-phone-apply-plan.csv");
  const cols = [
    "action",
    "reason",
    "contact_id",
    "csv_name",
    "csv_email",
    "csv_phone_raw",
    "canon_phone",
    "other_id",
    "other_name",
    "other_phone",
    "orders_matched_by_email",
    "orders_blank_phone_to_fill",
    "orders_already_have_phone",
    "latest_order_at",
  ];
  const lines = [cols.join(",")];
  for (const row of [...plan]) {
    const extra = fillRows.find((f) => f.contact_id === row.contact_id) ?? row;
    lines.push(cols.map((c) => csvEscape(extra[c] ?? "")).join(","));
  }
  fs.writeFileSync(out, lines.join("\n"), "utf8");

  const summary = {
    mode: apply ? "apply" : "dry-run",
    csv: CSV,
    rows: plan.length,
    addPhoneToExistingEmailContact: plan.filter((p) => p.action === "add_phone_to_existing_email_contact").length,
    fillOrdersOnExistingPhoneContact: plan.filter((p) => p.action === "fill_orders_on_existing_phone_contact").length,
    fillOrdersOnly: plan.filter((p) => p.action === "fill_orders_only").length,
    skipped: plan.filter((p) => p.action === "skip").length,
    skipReasons: {},
    ordersWouldFill: fillRows.reduce((n, r) => n + (r.orders_blank_phone_to_fill || 0), 0),
    contactsPhoned,
    ordersPatched,
    lastPurchasePatched,
    planCsv: out,
  };
  for (const p of plan.filter((x) => x.action === "skip")) {
    summary.skipReasons[p.reason] = (summary.skipReasons[p.reason] || 0) + 1;
  }

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
