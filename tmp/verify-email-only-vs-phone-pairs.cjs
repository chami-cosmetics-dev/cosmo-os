/**
 * Double-check: Cosmo email-only contacts vs ERP-matched phone contacts.
 * Are they the same person?
 *
 *   node scripts/with-env.mjs cosmo-prod node tmp/verify-email-only-vs-phone-pairs.cjs
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

function normalizeEmail(value) {
  const t = String(value || "").trim().toLowerCase();
  if (!t || t === "none") return null;
  return t;
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

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(ms|mrs|mr|miss|dr)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameTokens(value) {
  return normalizeName(value)
    .split(" ")
    .filter((t) => t.length >= 2);
}

function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 && B.size === 0) return 1;
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  return inter / new Set([...A, ...B]).size;
}

function tokenOverlapCount(a, b) {
  const B = new Set(b);
  let n = 0;
  for (const x of new Set(a)) if (B.has(x)) n += 1;
  return n;
}

function nameVerdict(emailName, phoneName, erpName) {
  const a = nameTokens(emailName);
  const b = nameTokens(phoneName);
  const e = nameTokens(erpName);
  const scorePhone = jaccard(a, b);
  const scoreErp = jaccard(a, e);
  const overlapPhone = tokenOverlapCount(a, b);
  const overlapErp = tokenOverlapCount(a, e);
  const exact =
    normalizeName(emailName) &&
    (normalizeName(emailName) === normalizeName(phoneName) ||
      normalizeName(emailName) === normalizeName(erpName));

  let same_person_likely = "review";
  if (exact || scorePhone >= 0.67 || (overlapPhone >= 2 && scorePhone >= 0.4)) {
    same_person_likely = "yes";
  } else if (scoreErp >= 0.67 || (overlapErp >= 2 && scoreErp >= 0.4)) {
    same_person_likely = "yes";
  } else if (overlapPhone === 0 && overlapErp === 0 && scorePhone < 0.2 && scoreErp < 0.2) {
    same_person_likely = "no";
  } else if (overlapPhone >= 1 || overlapErp >= 1) {
    same_person_likely = "maybe";
  }

  return {
    name_score_vs_phone: Number(scorePhone.toFixed(3)),
    name_score_vs_erp: Number(scoreErp.toFixed(3)),
    token_overlap_vs_phone: overlapPhone,
    token_overlap_vs_erp: overlapErp,
    same_person_likely,
  };
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

function likelySharedEmail(email, ownerCount) {
  const e = email.toLowerCase();
  if (ownerCount >= 5) return true;
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
      source: true,
      emails: { select: { email: true } },
    },
  });

  const emailToEmailOnly = new Map();
  for (const c of cosmoEmailOnly) {
    const emails = new Set();
    const pe = normalizeEmail(c.email);
    if (pe) emails.add(pe);
    for (const row of c.emails) {
      const e = normalizeEmail(row.email);
      if (e) emails.add(e);
    }
    for (const email of emails) {
      const list = emailToEmailOnly.get(email) ?? [];
      list.push(c);
      emailToEmailOnly.set(email, list);
    }
  }

  const allContacts = await prisma.contactMaster.findMany({
    where: { companyId: COMPANY_ID },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      source: true,
      lastPurchaseAt: true,
      phones: { select: { phoneNumber: true } },
      emails: { select: { email: true } },
    },
  });
  const byId = new Map(allContacts.map((c) => [c.id, c]));

  const phoneToIds = new Map();
  const emailOwnerCount = new Map();
  for (const c of allContacts) {
    const phones = [c.phoneNumber, ...c.phones.map((p) => p.phoneNumber)].filter(Boolean);
    for (const phone of phones) {
      for (const v of buildPhoneLookupVariants(phone)) {
        const set = phoneToIds.get(v) ?? new Set();
        set.add(c.id);
        phoneToIds.set(v, set);
      }
    }
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

  function contactsForPhone(phone) {
    const ids = new Set();
    for (const v of buildPhoneLookupVariants(phone)) {
      const set = phoneToIds.get(v);
      if (!set) continue;
      for (const id of set) ids.add(id);
    }
    return [...ids].map((id) => byId.get(id)).filter(Boolean);
  }

  const instances = await prisma.erpnextInstance.findMany({
    where: { companyId: COMPANY_ID },
    orderBy: { createdAt: "asc" },
    select: { label: true, baseUrl: true, apiKey: true, apiSecret: true },
  });

  /** One row per email-only contact + best phone contact (dedupe ERP1/ERP2). */
  const pairMap = new Map(); // emailOnlyId -> best row

  for (const inst of resolveSlots(instances)) {
    const customers = await fetchErpCustomers(inst);
    for (const cust of customers) {
      if (cust.disabled) continue;
      const email = normalizeEmail(cust.email_id);
      if (!email) continue;
      const emailOnlyHits = emailToEmailOnly.get(email);
      if (!emailOnlyHits?.length) continue;

      const erpPhone = String(cust.mobile_no ?? "").trim();
      if (isJunkOrMissingPhone(erpPhone)) continue;
      const phoneContacts = contactsForPhone(erpPhone).filter((c) => c.phoneNumber || c.phones.length);

      for (const emailOnly of emailOnlyHits) {
        for (const phoneContact of phoneContacts) {
          if (phoneContact.id === emailOnly.id) continue;
          const verdict = nameVerdict(emailOnly.name, phoneContact.name, cust.customer_name);
          const shared = likelySharedEmail(email, emailOwnerCount.get(email) ?? 0);
          const candidate = {
            email_only_contact_id: emailOnly.id,
            email_only_name: emailOnly.name,
            email_only_email: email,
            email_only_source: emailOnly.source ?? "",
            email_only_last_purchase: emailOnly.lastPurchaseAt
              ? emailOnly.lastPurchaseAt.toISOString().slice(0, 10)
              : "",
            phone_contact_id: phoneContact.id,
            phone_contact_name: phoneContact.name,
            phone_contact_phone: phoneContact.phoneNumber || phoneContact.phones[0]?.phoneNumber || "",
            phone_contact_email: phoneContact.email || "",
            phone_contact_source: phoneContact.source ?? "",
            phone_contact_last_purchase: phoneContact.lastPurchaseAt
              ? phoneContact.lastPurchaseAt.toISOString().slice(0, 10)
              : "",
            erp_slot: inst.slot,
            erp_customer_id: cust.name,
            erp_customer_name: cust.customer_name ?? "",
            erp_mobile: erpPhone,
            email_owner_count: emailOwnerCount.get(email) ?? 0,
            likely_shared_email: shared ? "yes" : "no",
            ...verdict,
            names_equal_normalized:
              normalizeName(emailOnly.name) === normalizeName(phoneContact.name) ? "yes" : "no",
            phone_contact_already_has_same_email:
              normalizeEmail(phoneContact.email) === email ||
              phoneContact.emails.some((e) => normalizeEmail(e.email) === email)
                ? "yes"
                : "no",
          };

          const prev = pairMap.get(emailOnly.id);
          const rank = (r) => {
            const v =
              r.same_person_likely === "yes" ? 3 : r.same_person_likely === "maybe" ? 2 : r.same_person_likely === "review" ? 1 : 0;
            return v * 10 + r.name_score_vs_phone;
          };
          if (!prev || rank(candidate) > rank(prev)) {
            pairMap.set(emailOnly.id, candidate);
          }
        }
      }
    }
  }

  const pairs = [...pairMap.values()];

  // Order evidence: email-only email orders, phone-contact phone orders
  const BATCH = 100;
  for (let i = 0; i < pairs.length; i += BATCH) {
    const chunk = pairs.slice(i, i + BATCH);
    const emails = [...new Set(chunk.map((p) => p.email_only_email))];
    const phoneVariants = new Set();
    for (const p of chunk) {
      for (const v of buildPhoneLookupVariants(p.phone_contact_phone)) phoneVariants.add(v);
    }

    const [emailOrders, phoneOrders] = await Promise.all([
      prisma.order.findMany({
        where: {
          companyId: COMPANY_ID,
          customerEmail: { in: emails, mode: "insensitive" },
        },
        select: { customerEmail: true, customerPhone: true, name: true, createdAt: true },
      }),
      prisma.order.findMany({
        where: {
          companyId: COMPANY_ID,
          customerPhone: { in: [...phoneVariants] },
        },
        select: { customerPhone: true, name: true, createdAt: true },
      }),
    ]);

    const emailOrderCount = new Map();
    const emailOrderBlankPhone = new Map();
    for (const o of emailOrders) {
      const e = normalizeEmail(o.customerEmail);
      if (!e) continue;
      emailOrderCount.set(e, (emailOrderCount.get(e) ?? 0) + 1);
      if (!String(o.customerPhone || "").trim()) {
        emailOrderBlankPhone.set(e, (emailOrderBlankPhone.get(e) ?? 0) + 1);
      }
    }

    const phoneOrderCount = new Map();
    for (const o of phoneOrders) {
      const phone = String(o.customerPhone || "").trim();
      for (const p of chunk) {
        const variants = new Set(buildPhoneLookupVariants(p.phone_contact_phone));
        if (variants.has(phone)) {
          phoneOrderCount.set(p.phone_contact_id, (phoneOrderCount.get(p.phone_contact_id) ?? 0) + 1);
        }
      }
    }

    const adaptCounts = await prisma.adaptPurchaseHistory.groupBy({
      by: ["contactId"],
      where: {
        companyId: COMPANY_ID,
        contactId: { in: chunk.flatMap((p) => [p.email_only_contact_id, p.phone_contact_id]) },
      },
      _count: { _all: true },
    });
    const adaptMap = new Map(adaptCounts.map((a) => [a.contactId, a._count._all]));

    for (const p of chunk) {
      p.email_only_cosmo_order_count = emailOrderCount.get(p.email_only_email) ?? 0;
      p.email_only_orders_blank_phone = emailOrderBlankPhone.get(p.email_only_email) ?? 0;
      p.phone_contact_cosmo_order_count = phoneOrderCount.get(p.phone_contact_id) ?? 0;
      p.email_only_adapt_count = adaptMap.get(p.email_only_contact_id) ?? 0;
      p.phone_contact_adapt_count = adaptMap.get(p.phone_contact_id) ?? 0;

      // Strengthen / weaken verdict with shared email flag
      if (p.likely_shared_email === "yes") {
        p.same_person_likely = "no";
        p.merge_recommendation = "do_not_merge_shared_email";
      } else if (p.same_person_likely === "yes") {
        p.merge_recommendation = "candidate_merge_into_phone_contact";
      } else if (p.same_person_likely === "maybe") {
        p.merge_recommendation = "manual_review";
      } else if (p.same_person_likely === "no") {
        p.merge_recommendation = "do_not_merge_name_mismatch";
      } else {
        p.merge_recommendation = "manual_review";
      }
    }
  }

  pairs.sort(
    (a, b) =>
      a.same_person_likely.localeCompare(b.same_person_likely) ||
      a.email_only_name.localeCompare(b.email_only_name)
  );

  const header = [
    "same_person_likely",
    "merge_recommendation",
    "name_score_vs_phone",
    "name_score_vs_erp",
    "token_overlap_vs_phone",
    "token_overlap_vs_erp",
    "names_equal_normalized",
    "email_only_contact_id",
    "email_only_name",
    "email_only_email",
    "email_only_source",
    "email_only_last_purchase",
    "email_only_cosmo_order_count",
    "email_only_orders_blank_phone",
    "email_only_adapt_count",
    "phone_contact_id",
    "phone_contact_name",
    "phone_contact_phone",
    "phone_contact_email",
    "phone_contact_source",
    "phone_contact_last_purchase",
    "phone_contact_cosmo_order_count",
    "phone_contact_adapt_count",
    "phone_contact_already_has_same_email",
    "erp_slot",
    "erp_customer_id",
    "erp_customer_name",
    "erp_mobile",
    "email_owner_count",
    "likely_shared_email",
  ];

  const out = path.resolve("tmp/cosmo-email-only-vs-phone-doublecheck.csv");
  writeCsv(out, header, pairs);

  const summary = {
    emailOnlyTotal: cosmoEmailOnly.length,
    paired: pairs.length,
    unpairedEmailOnly: cosmoEmailOnly.length - pairs.length,
    byLikely: {},
    byRecommendation: {},
  };
  for (const p of pairs) {
    summary.byLikely[p.same_person_likely] = (summary.byLikely[p.same_person_likely] || 0) + 1;
    summary.byRecommendation[p.merge_recommendation] =
      (summary.byRecommendation[p.merge_recommendation] || 0) + 1;
  }

  console.log(JSON.stringify({ ...summary, csv: out }, null, 2));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
