/**
 * Broader miss scan:
 * A) ERP customers with blank/junk mobile (with or without email)
 * B) Cosmo contacts with email but no phone
 *
 *   node scripts/with-env.mjs cosmo-prod node tmp/list-no-phone-gaps.cjs
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

  const instances = await prisma.erpnextInstance.findMany({
    where: { companyId: COMPANY_ID },
    orderBy: { createdAt: "asc" },
    select: { label: true, baseUrl: true, apiKey: true, apiSecret: true },
  });

  const erpNoPhone = [];
  const stats = {
    erpScanned: { erp1: 0, erp2: 0 },
    erpNoPhone: { erp1: 0, erp2: 0 },
    erpNoPhoneWithEmail: { erp1: 0, erp2: 0 },
    erpNoPhoneNoEmail: { erp1: 0, erp2: 0 },
    erpHasPhone: { erp1: 0, erp2: 0 },
    erpHasPhoneNoEmail: { erp1: 0, erp2: 0 },
  };

  for (const inst of resolveSlots(instances)) {
    const customers = await fetchErpCustomers(inst);
    stats.erpScanned[inst.slot] = customers.length;
    for (const cust of customers) {
      if (cust.disabled) continue;
      const phone = String(cust.mobile_no ?? "").trim();
      const email = normalizeEmail(cust.email_id);
      if (isJunkOrMissingPhone(phone)) {
        stats.erpNoPhone[inst.slot] += 1;
        if (email) stats.erpNoPhoneWithEmail[inst.slot] += 1;
        else stats.erpNoPhoneNoEmail[inst.slot] += 1;
        erpNoPhone.push({
          slot: inst.slot,
          erp_customer_id: cust.name,
          customer_name: cust.customer_name ?? "",
          erp_mobile: phone,
          erp_email: email ?? "",
          has_email: email ? "yes" : "no",
        });
      } else {
        stats.erpHasPhone[inst.slot] += 1;
        if (!email) stats.erpHasPhoneNoEmail[inst.slot] += 1;
      }
    }
  }

  const cosmoEmailNoPhone = await prisma.contactMaster.findMany({
    where: {
      companyId: COMPANY_ID,
      AND: [
        {
          OR: [
            { phoneNumber: null },
            { phoneNumber: "" },
          ],
        },
        {
          OR: [
            { email: { not: null } },
            { emails: { some: {} } },
          ],
        },
      ],
      phones: { none: {} },
    },
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      source: true,
      lastPurchaseAt: true,
      emails: { select: { email: true } },
    },
    take: 5000,
  });

  const cosmoRows = cosmoEmailNoPhone.map((c) => ({
    contact_id: c.id,
    name: c.name,
    primary_email: c.email ?? "",
    alias_emails: c.emails.map((e) => e.email).join("|"),
    source: c.source ?? "",
    last_purchase_at: c.lastPurchaseAt ? c.lastPurchaseAt.toISOString().slice(0, 10) : "",
  }));

  writeCsv(
    path.resolve("tmp/erp-customers-no-phone.csv"),
    ["slot", "erp_customer_id", "customer_name", "erp_mobile", "erp_email", "has_email"],
    erpNoPhone
  );
  writeCsv(
    path.resolve("tmp/cosmo-email-no-phone-contacts.csv"),
    ["contact_id", "name", "primary_email", "alias_emails", "source", "last_purchase_at"],
    cosmoRows
  );

  console.log(
    JSON.stringify(
      {
        stats,
        erpNoPhoneRows: erpNoPhone.length,
        cosmoEmailNoPhoneCount: cosmoRows.length,
        files: {
          erpNoPhone: path.resolve("tmp/erp-customers-no-phone.csv"),
          cosmoEmailNoPhone: path.resolve("tmp/cosmo-email-no-phone-contacts.csv"),
        },
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
