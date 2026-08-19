/**
 * Match Cosmo email-no-phone contacts against ERP Customer emails.
 * If ERP has that email + a phone, report whether Cosmo already has that phone elsewhere.
 *
 *   node scripts/with-env.mjs cosmo-prod node tmp/match-cosmo-email-only-to-erp.cjs
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

function buildPhoneLookupVariants(rawPhone) {
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
      out.add(`940${d.slice(1)}`);
    }
    if (d.length === 11 && d.startsWith("94")) {
      out.add(`0${d.slice(2)}`);
      out.add(d.slice(2));
    }
  }
  for (const v of [...out]) {
    const digits = phoneDigitsOnly(v);
    if (digits) out.add(`+${digits}`);
  }
  return [...out].filter(Boolean);
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

const SHARED_HINTS = [
  "pos",
  "kiribathgoda",
  "cosmetics",
  "ajstrading",
  "chami",
  "coolplanet",
  "showroom",
  "merchant",
  "gmail.com", // too broad — only use with high match counts, not here
];

function likelySharedEmail(email, cosmoOwnerCount) {
  const e = email.toLowerCase();
  if (cosmoOwnerCount >= 5) return true;
  return ["pos", "kiribathgoda", "cosmetics.lk", "ajstrading", "coolplanet", "showroom"].some((h) =>
    e.includes(h)
  );
}

async function main() {
  fs.mkdirSync("tmp", { recursive: true });

  const cosmoEmailOnly = await prisma.contactMaster.findMany({
    where: {
      companyId: COMPANY_ID,
      AND: [
        { OR: [{ phoneNumber: null }, { phoneNumber: "" }] },
        { OR: [{ email: { not: null } }, { emails: { some: {} } }] },
      ],
      phones: { none: {} },
    },
    select: {
      id: true,
      name: true,
      email: true,
      lastPurchaseAt: true,
      emails: { select: { email: true } },
    },
  });

  const emailToCosmoEmailOnly = new Map();
  for (const c of cosmoEmailOnly) {
    const emails = new Set();
    const primary = normalizeEmail(c.email);
    if (primary) emails.add(primary);
    for (const row of c.emails) {
      const e = normalizeEmail(row.email);
      if (e) emails.add(e);
    }
    for (const email of emails) {
      const list = emailToCosmoEmailOnly.get(email) ?? [];
      list.push(c);
      emailToCosmoEmailOnly.set(email, list);
    }
  }

  // All Cosmo phones for "phone already elsewhere" check
  const allContacts = await prisma.contactMaster.findMany({
    where: { companyId: COMPANY_ID },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      phones: { select: { phoneNumber: true } },
    },
  });

  const phoneToContacts = new Map();
  const emailOwnerCount = new Map();
  const addPhone = (phone, contact) => {
    if (!phone) return;
    for (const v of buildPhoneLookupVariants(phone)) {
      const set = phoneToContacts.get(v) ?? new Set();
      set.add(contact.id);
      phoneToContacts.set(v, set);
    }
  };
  for (const c of allContacts) {
    addPhone(c.phoneNumber, c);
    for (const p of c.phones) addPhone(p.phoneNumber, c);
    for (const email of [c.email, ...c.phones.map(() => null)].filter(Boolean)) {
      /* noop */
    }
    const emails = new Set();
    const pe = normalizeEmail(c.email);
    if (pe) emails.add(pe);
  }
  // rebuild email owner counts properly
  for (const c of allContacts) {
    const emails = new Set();
    const pe = normalizeEmail(c.email);
    if (pe) emails.add(pe);
  }
  // need secondary emails too
  const withEmails = await prisma.contactMaster.findMany({
    where: { companyId: COMPANY_ID },
    select: {
      id: true,
      email: true,
      emails: { select: { email: true } },
    },
  });
  for (const c of withEmails) {
    const emails = new Set();
    const pe = normalizeEmail(c.email);
    if (pe) emails.add(pe);
    for (const row of c.emails) {
      const e = normalizeEmail(row.email);
      if (e) emails.add(e);
    }
    for (const email of emails) {
      emailOwnerCount.set(email, (emailOwnerCount.get(email) ?? 0) + 1);
    }
  }

  const contactById = new Map(allContacts.map((c) => [c.id, c]));

  function contactsForPhone(phone) {
    const ids = new Set();
    for (const v of buildPhoneLookupVariants(phone)) {
      const set = phoneToContacts.get(v);
      if (!set) continue;
      for (const id of set) ids.add(id);
    }
    return [...ids].map((id) => contactById.get(id)).filter(Boolean);
  }

  const instances = await prisma.erpnextInstance.findMany({
    where: { companyId: COMPANY_ID },
    orderBy: { createdAt: "asc" },
    select: { label: true, baseUrl: true, apiKey: true, apiSecret: true },
  });

  const matchRows = [];
  const seen = new Set(); // cosmoId|slot|erpId

  for (const inst of resolveSlots(instances)) {
    const customers = await fetchErpCustomers(inst);
    for (const cust of customers) {
      if (cust.disabled) continue;
      const email = normalizeEmail(cust.email_id);
      if (!email) continue;
      const cosmoHits = emailToCosmoEmailOnly.get(email);
      if (!cosmoHits?.length) continue;

      const erpPhone = String(cust.mobile_no ?? "").trim();
      const erpPhoneOk = !isJunkOrMissingPhone(erpPhone);
      const phoneOwners = erpPhoneOk ? contactsForPhone(erpPhone) : [];
      const shared = likelySharedEmail(email, emailOwnerCount.get(email) ?? 0);

      for (const cosmo of cosmoHits) {
        const key = `${cosmo.id}|${inst.slot}|${cust.name}`;
        if (seen.has(key)) continue;
        seen.add(key);

        let phoneStatus = "erp_no_usable_phone";
        if (erpPhoneOk) {
          if (phoneOwners.length === 0) phoneStatus = "erp_phone_not_in_cosmo";
          else if (phoneOwners.some((p) => p.id === cosmo.id)) phoneStatus = "phone_already_on_this_contact";
          else phoneStatus = "erp_phone_on_other_cosmo_contact";
        }

        matchRows.push({
          slot: inst.slot,
          cosmo_contact_id: cosmo.id,
          cosmo_name: cosmo.name,
          cosmo_email: email,
          cosmo_last_purchase: cosmo.lastPurchaseAt
            ? cosmo.lastPurchaseAt.toISOString().slice(0, 10)
            : "",
          erp_customer_id: cust.name,
          erp_customer_name: cust.customer_name ?? "",
          erp_mobile: erpPhone,
          phone_status: phoneStatus,
          other_cosmo_ids: phoneOwners
            .filter((p) => p.id !== cosmo.id)
            .map((p) => p.id)
            .join("|"),
          other_cosmo_names: phoneOwners
            .filter((p) => p.id !== cosmo.id)
            .map((p) => p.name)
            .join("|"),
          other_cosmo_phones: phoneOwners
            .filter((p) => p.id !== cosmo.id)
            .map((p) => p.phoneNumber || "")
            .join("|"),
          email_owner_count_in_cosmo: emailOwnerCount.get(email) ?? 0,
          likely_shared_email: shared ? "yes" : "no",
        });
      }
    }
  }

  matchRows.sort(
    (a, b) =>
      a.phone_status.localeCompare(b.phone_status) ||
      a.cosmo_email.localeCompare(b.cosmo_email) ||
      a.slot.localeCompare(b.slot)
  );

  const out = path.resolve("tmp/cosmo-email-only-erp-matches.csv");
  writeCsv(
    out,
    [
      "slot",
      "cosmo_contact_id",
      "cosmo_name",
      "cosmo_email",
      "cosmo_last_purchase",
      "erp_customer_id",
      "erp_customer_name",
      "erp_mobile",
      "phone_status",
      "other_cosmo_ids",
      "other_cosmo_names",
      "other_cosmo_phones",
      "email_owner_count_in_cosmo",
      "likely_shared_email",
    ],
    matchRows
  );

  const byStatus = {};
  const uniqueCosmo = new Set();
  let sharedCount = 0;
  for (const row of matchRows) {
    byStatus[row.phone_status] = (byStatus[row.phone_status] || 0) + 1;
    uniqueCosmo.add(row.cosmo_contact_id);
    if (row.likely_shared_email === "yes") sharedCount += 1;
  }

  console.log(
    JSON.stringify(
      {
        cosmoEmailOnlyContacts: cosmoEmailOnly.length,
        uniqueEmailsOnThose: emailToCosmoEmailOnly.size,
        matchRows: matchRows.length,
        uniqueCosmoContactsMatched: uniqueCosmo.size,
        byPhoneStatus: byStatus,
        sharedEmailRows: sharedCount,
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
