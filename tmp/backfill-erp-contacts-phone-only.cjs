/**
 * Phone-only Cosmo contact backfill from ERP1/ERP2.
 *
 * Rules:
 * - Identity = phone only (never match/merge by email)
 * - Skip if Cosmo already has that phone (primary or Previous)
 * - Skip if ERP email is on 2+ Cosmo contacts (ambiguous) — export list
 * - Skip duplicate-SI po_no / extra invoices (no SI replay)
 * - Create new ContactMaster only; do not attach Previous phones
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-prod node tmp/backfill-erp-contacts-phone-only.cjs --dry-run
 *   node scripts/with-env.mjs cosmo-prod node tmp/backfill-erp-contacts-phone-only.cjs --apply
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
const apply = process.argv.includes("--apply");
const dryRun = !apply;

const SKIP_PO_NOS = new Set(["60017254", "60017589"]);
const SKIP_SI_NAMES = new Set(["600-001483", "600-001484", "600-002133", "600-002134"]);

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
    lines.push(header.map((h) => csvEscape(row[h])).join(","));
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
  for (const variant of [...out]) {
    const digits = phoneDigitsOnly(variant);
    if (!digits) continue;
    out.add(`+${digits}`);
  }
  return [...out].filter(Boolean);
}

function canonicalLocal(rawPhone) {
  let d = phoneDigitsOnly(rawPhone);
  if (d.startsWith("94") && d.length >= 11) d = `0${d.slice(2)}`;
  if (d.length === 9) d = `0${d}`;
  return d;
}

function isJunkPhone(rawPhone) {
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
    const fields = JSON.stringify(["name", "customer_name", "mobile_no", "email_id"]);
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
  const slots = resolveSlots(instances);

  const contacts = await prisma.contactMaster.findMany({
    where: { companyId: COMPANY_ID },
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      source: true,
      phones: { select: { phoneNumber: true } },
      emails: { select: { email: true } },
    },
  });

  const phoneOwner = new Map();
  const registerPhone = (phone, contact) => {
    for (const v of buildPhoneLookupVariants(phone)) {
      if (!phoneOwner.has(v)) phoneOwner.set(v, contact);
    }
  };

  const emailToContacts = new Map();
  const registerEmail = (email, contact) => {
    const key = normalizeEmail(email);
    if (!key) return;
    const list = emailToContacts.get(key) ?? [];
    if (!list.some((c) => c.id === contact.id)) list.push(contact);
    emailToContacts.set(key, list);
  };

  for (const c of contacts) {
    if (c.phoneNumber) registerPhone(c.phoneNumber, c);
    for (const p of c.phones) registerPhone(p.phoneNumber, c);
    registerEmail(c.email, c);
    for (const e of c.emails) registerEmail(e.email, c);
  }

  const duplicateEmailRows = [];
  for (const [email, list] of emailToContacts.entries()) {
    if (list.length < 2) continue;
    for (const c of list) {
      duplicateEmailRows.push({
        email,
        contact_count: list.length,
        contact_id: c.id,
        name: c.name,
        primary_phone: c.phoneNumber ?? "",
        source: c.source ?? "",
      });
    }
  }
  duplicateEmailRows.sort((a, b) => a.email.localeCompare(b.email) || a.name.localeCompare(b.name));
  const duplicateEmails = new Set(duplicateEmailRows.map((r) => r.email));

  writeCsv(
    path.resolve("tmp/cosmo-duplicate-email-contacts.csv"),
    ["email", "contact_count", "contact_id", "name", "primary_phone", "source"],
    duplicateEmailRows
  );

  const skipEmailDup = [];
  const skipPhoneExists = [];
  const skipNoPhone = [];
  const skipJunk = [];
  const skipSiDupPo = [];
  const toCreate = [];

  for (const inst of slots) {
    const customers = await fetchErpCustomers(inst);
    for (const cust of customers) {
      const phone = String(cust.mobile_no ?? "").trim();
      const email = normalizeEmail(cust.email_id);
      const name = String(cust.customer_name ?? cust.name ?? "").trim();
      const erpId = String(cust.name ?? "").trim();

      const base = {
        slot: inst.slot,
        erp_customer_id: erpId,
        name,
        phone,
        email: email ?? "",
      };

      if (SKIP_PO_NOS.has(erpId) || SKIP_SI_NAMES.has(erpId)) {
        skipSiDupPo.push({ ...base, reason: "duplicate_si_po_skip" });
        continue;
      }

      if (!phone) {
        skipNoPhone.push({ ...base, reason: "no_phone" });
        continue;
      }
      if (isJunkPhone(phone)) {
        skipJunk.push({ ...base, reason: "junk_phone" });
        continue;
      }

      const existing = phoneOwner.get(phone) || buildPhoneLookupVariants(phone).map((v) => phoneOwner.get(v)).find(Boolean);
      if (existing) {
        skipPhoneExists.push({
          ...base,
          reason: "phone_already_in_cosmo",
          cosmo_contact_id: existing.id,
          cosmo_name: existing.name,
        });
        continue;
      }

      if (email && duplicateEmails.has(email)) {
        const owners = emailToContacts.get(email) ?? [];
        skipEmailDup.push({
          ...base,
          reason: "email_on_two_or_more_cosmo_contacts",
          cosmo_contact_ids: owners.map((c) => c.id).join("|"),
          cosmo_names: owners.map((c) => c.name).join("|"),
          cosmo_phones: owners.map((c) => c.phoneNumber ?? "").join("|"),
        });
        continue;
      }

      const emailAlreadyUsed = Boolean(email && (emailToContacts.get(email)?.length ?? 0) >= 1);
      toCreate.push({
        ...base,
        store_email: emailAlreadyUsed ? "" : email ?? "",
        email_omitted: emailAlreadyUsed ? "yes" : "no",
        reason: "create_by_phone",
      });
    }
  }

  writeCsv(
    path.resolve("tmp/erp-skip-duplicate-email.csv"),
    ["slot", "erp_customer_id", "name", "phone", "email", "reason", "cosmo_contact_ids", "cosmo_names", "cosmo_phones"],
    skipEmailDup
  );
  writeCsv(
    path.resolve("tmp/erp-phone-only-create-plan.csv"),
    ["slot", "erp_customer_id", "name", "phone", "email", "store_email", "email_omitted", "reason"],
    toCreate
  );

  let created = 0;
  if (apply) {
    for (const row of toCreate) {
      const createdRow = await prisma.contactMaster.create({
        data: {
          companyId: COMPANY_ID,
          name: row.name || row.phone,
          phoneNumber: row.phone,
          email: row.store_email || null,
          source: row.slot,
        },
        select: { id: true, phoneNumber: true },
      });
      registerPhone(createdRow.phoneNumber, { id: createdRow.id, name: row.name, phoneNumber: createdRow.phoneNumber });
      created += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        skippedSiDuplicates: {
          po_no: [...SKIP_PO_NOS],
          invoices: [...SKIP_SI_NAMES],
          note: "SI backfill not run. These extra submitted SIs skipped.",
        },
        cosmoEmailsOnTwoOrMoreContacts: duplicateEmails.size,
        cosmoContactsInEmailDupList: duplicateEmailRows.length,
        emailDupList: path.resolve("tmp/cosmo-duplicate-email-contacts.csv"),
        erpSkippedBecauseEmailOnTwoContacts: skipEmailDup.length,
        erpSkipEmailDupList: path.resolve("tmp/erp-skip-duplicate-email.csv"),
        skipPhoneAlreadyInCosmo: skipPhoneExists.length,
        skipNoPhone: skipNoPhone.length,
        skipJunkPhone: skipJunk.length,
        wouldCreate: toCreate.length,
        created,
        createPlan: path.resolve("tmp/erp-phone-only-create-plan.csv"),
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
