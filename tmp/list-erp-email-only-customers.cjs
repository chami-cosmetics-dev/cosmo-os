/**
 * List ERP customers missed by phone-only backfill:
 * no usable mobile_no, but have email_id.
 *
 *   node scripts/with-env.mjs cosmo-prod node tmp/list-erp-email-only-customers.cjs
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
  if (d.startsWith("94") && d.length >= 11) d = `0${d.slice(2)}`;
  if (d.length === 9) d = `0${d}`;
  return d;
}

function isJunkOrMissingPhone(rawPhone) {
  const t = String(rawPhone || "").trim();
  if (!t) return true;
  const d = canonicalLocal(rawPhone);
  if (d.length < 9) return true;
  if (/^0?1{5,}$/.test(d)) return true;
  if (/^0?(\d)\1{8,}$/.test(d)) return true;
  if (["0123456789", "0123456780", "0123455555"].includes(d)) return true;
  return false;
}

function normalizeEmail(value) {
  const t = String(value || "").trim().toLowerCase();
  if (!t || t === "none") return null;
  return t;
}

function resolveSlots(instances) {
  const erp1 = instances.find((i) => /erp[_\s-]*1\b/i.test(i.label ?? ""));
  const erp2 = instances.find((i) => /erp[_\s-]*2\b/i.test(i.label ?? ""));
  return [
    ...(erp1 ? [{ ...erp1, slot: "erp1" }] : []),
    ...(erp2 ? [{ ...erp2, slot: "erp2" }] : []),
  ];
}

async function fetchErpCustomers(inst) {
  const base = inst.baseUrl.replace(/\/$/, "");
  const auth = `token ${inst.apiKey}:${inst.apiSecret}`;
  const all = [];
  for (let page = 0; page < 200; page++) {
    const fields = JSON.stringify(["name", "customer_name", "mobile_no", "email_id", "disabled"]);
    const res = await fetch(
      `${base}/api/resource/Customer?fields=${encodeURIComponent(fields)}&limit_page_length=500&limit_start=${page * 500}&order_by=name asc`,
      { headers: { Authorization: auth, Accept: "application/json" } }
    );
    if (!res.ok) throw new Error(`${inst.slot} Customer HTTP ${res.status}`);
    const json = await res.json();
    const batch = json.data ?? [];
    all.push(...batch);
    if (batch.length < 500) break;
  }
  return all;
}

async function main() {
  fs.mkdirSync("tmp", { recursive: true });

  const contacts = await prisma.contactMaster.findMany({
    where: { companyId: COMPANY_ID },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      emails: { select: { email: true } },
    },
  });

  const emailToContacts = new Map();
  const registerEmail = (email, contact) => {
    const key = normalizeEmail(email);
    if (!key) return;
    const list = emailToContacts.get(key) ?? [];
    list.push(contact);
    emailToContacts.set(key, list);
  };
  for (const c of contacts) {
    registerEmail(c.email, c);
    for (const e of c.emails) registerEmail(e.email, c);
  }

  const instances = await prisma.erpnextInstance.findMany({
    where: { companyId: COMPANY_ID },
    orderBy: { createdAt: "asc" },
    select: { label: true, baseUrl: true, apiKey: true, apiSecret: true },
  });

  const rows = [];
  const stats = {
    erp1: { scanned: 0, emailOnly: 0 },
    erp2: { scanned: 0, emailOnly: 0 },
    cosmoEmailMatch0: 0,
    cosmoEmailMatch1: 0,
    cosmoEmailMatch2Plus: 0,
    sharedMerchantLikely: 0,
  };

  const SHARED_HINTS = [
    "pos",
    "kiribathgoda",
    "cosmetics",
    "ajstrading",
    "chami",
    "coolplanet",
    "showroom",
    "merchant",
  ];

  for (const inst of resolveSlots(instances)) {
    const customers = await fetchErpCustomers(inst);
    stats[inst.slot].scanned = customers.length;
    for (const cust of customers) {
      if (cust.disabled) continue;
      const phone = String(cust.mobile_no ?? "").trim();
      const email = normalizeEmail(cust.email_id);
      if (!email) continue;
      if (!isJunkOrMissingPhone(phone)) continue;

      stats[inst.slot].emailOnly += 1;
      const owners = emailToContacts.get(email) ?? [];
      const matchCount = owners.length;
      if (matchCount === 0) stats.cosmoEmailMatch0 += 1;
      else if (matchCount === 1) stats.cosmoEmailMatch1 += 1;
      else stats.cosmoEmailMatch2Plus += 1;

      const sharedLikely = SHARED_HINTS.some((h) => email.includes(h)) || matchCount >= 5;
      if (sharedLikely) stats.sharedMerchantLikely += 1;

      rows.push({
        slot: inst.slot,
        erp_customer_id: cust.name,
        customer_name: cust.customer_name ?? "",
        erp_mobile: phone,
        erp_email: email,
        cosmo_email_match_count: matchCount,
        cosmo_contact_ids: owners.map((o) => o.id).join("|"),
        cosmo_names: owners.map((o) => o.name).join("|"),
        cosmo_phones: owners.map((o) => o.phoneNumber || "").join("|"),
        likely_shared_email: sharedLikely ? "yes" : "no",
        note:
          matchCount === 0
            ? "no_cosmo_email_match"
            : matchCount === 1
              ? "single_cosmo_email_match"
              : "email_on_multiple_cosmo_contacts",
      });
    }
  }

  rows.sort(
    (a, b) =>
      a.slot.localeCompare(b.slot) ||
      Number(b.cosmo_email_match_count) - Number(a.cosmo_email_match_count) ||
      a.erp_email.localeCompare(b.erp_email)
  );

  const out = path.resolve("tmp/erp-email-only-customers.csv");
  writeCsv(
    out,
    [
      "slot",
      "erp_customer_id",
      "customer_name",
      "erp_mobile",
      "erp_email",
      "cosmo_email_match_count",
      "cosmo_contact_ids",
      "cosmo_names",
      "cosmo_phones",
      "likely_shared_email",
      "note",
    ],
    rows
  );

  console.log(
    JSON.stringify(
      {
        ...stats,
        totalEmailOnlyRows: rows.length,
        csv: out,
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
