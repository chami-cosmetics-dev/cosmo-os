/**
 * List Cosmo OS contacts eligible for loyalty (lifetime ≥ 100k) but not
 * registered (loyaltyAssignedTier null). Cross-check ERP Gold/Platinum phones.
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-prod node scripts/list-eligible-unregistered-loyalty.mjs
 *   node scripts/with-env.mjs cosmo-dev node scripts/list-eligible-unregistered-loyalty.mjs
 *   node scripts/with-env.mjs cosmo-prod node scripts/list-eligible-unregistered-loyalty.mjs --out=tmp/eligible-unregistered-loyalty.json
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const GOLD_MIN = 100_000;
const args = process.argv.slice(2);
const outArg = args.find((a) => a.startsWith("--out="))?.split("=")[1] ?? null;
const companyIdArg = args.find((a) => a.startsWith("--company-id="))?.split("=")[1] ?? null;
const limitArg = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 0);

const rawUrl = process.env.DATABASE_URL ?? "";
const prisma = new PrismaClient({
  datasources: {
    db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl },
  },
});

const LIFETIME_STAGES = ["delivery_complete", "invoice_complete"];

function toNum(v) {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function phoneVariants(raw) {
  if (!raw) return [];
  const t = String(raw).trim();
  let d = t.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
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
    }
    if (d.length === 11 && d.startsWith("94")) {
      out.add(`0${d.slice(2)}`);
      out.add(d.slice(2));
    }
  }
  return [...out];
}

function canonicalPhone(raw) {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("94") && d.length >= 11) return `0${d.slice(2)}`;
  if (d.length === 9) return `0${d}`;
  return d.startsWith("0") ? d : d;
}

async function resolveCompanyId() {
  if (companyIdArg) return companyIdArg;
  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 20,
  });
  if (companies.length === 0) throw new Error("No companies found");
  if (companies.length === 1) return companies[0].id;
  const preferred =
    companies.find((c) => /cosmetic/i.test(c.name)) ??
    companies.find((c) => /cosmo/i.test(c.name)) ??
    companies[0];
  console.error(
    `[company] using ${preferred.name} (${preferred.id}); others: ${companies
      .map((c) => c.name)
      .join(", ")}`
  );
  return preferred.id;
}

async function loadErpConfigsFromDb(companyId) {
  const locations = await prisma.companyLocation.findMany({
    where: { companyId, erpnextInstanceId: { not: null } },
    select: {
      erpnextInstance: {
        select: { id: true, label: true, baseUrl: true, apiKey: true, apiSecret: true },
      },
    },
  });
  const seen = new Set();
  const out = [];
  for (const loc of locations) {
    const inst = loc.erpnextInstance;
    if (!inst?.baseUrl || !inst.apiKey || !inst.apiSecret) continue;
    if (seen.has(inst.id)) continue;
    seen.add(inst.id);
    out.push({
      label: inst.label || inst.id,
      baseUrl: String(inst.baseUrl).replace(/\/$/, ""),
      apiKey: inst.apiKey,
      apiSecret: inst.apiSecret,
    });
  }
  return out;
}

/** Aggregate Cosmo completed-order spend by customerPhone; return phones ≥ floor. */
async function highSpendOrderPhones(companyId, floor) {
  const rows = await prisma.$queryRaw`
    SELECT "customerPhone" AS phone, SUM("totalPrice")::float AS total
    FROM "Order"
    WHERE "companyId" = ${companyId}
      AND "cancelledAt" IS NULL
      AND COALESCE(LOWER("financialStatus"), '') <> 'voided'
      AND "fulfillmentStage" IN ('delivery_complete', 'invoice_complete')
      AND "customerPhone" IS NOT NULL
      AND TRIM("customerPhone") <> ''
    GROUP BY "customerPhone"
    HAVING SUM("totalPrice") >= ${floor}
  `;
  return rows;
}

async function fetchErpLoyaltyPhones(baseUrl, apiKey, apiSecret) {
  const phones = new Set();
  const emails = new Set();
  for (const group of ["Gold", "Platinum", "loyalcs", "loyalcs2"]) {
    let start = 0;
    const pageSize = 500;
    for (;;) {
      const url = new URL("/api/resource/Customer", baseUrl);
      url.searchParams.set(
        "fields",
        JSON.stringify(["name", "mobile_no", "email_id", "customer_group"])
      );
      url.searchParams.set("filters", JSON.stringify([["customer_group", "=", group]]));
      url.searchParams.set("limit_start", String(start));
      url.searchParams.set("limit_page_length", String(pageSize));
      const res = await fetch(url, {
        headers: {
          Authorization: `token ${apiKey}:${apiSecret}`,
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        console.error(`[erp] ${baseUrl} group=${group} HTTP ${res.status}`);
        break;
      }
      const json = await res.json();
      const rows = json.data ?? [];
      for (const row of rows) {
        for (const v of phoneVariants(row.mobile_no || row.name)) {
          const c = canonicalPhone(v);
          if (c) phones.add(c);
        }
        const email = String(row.email_id ?? "")
          .trim()
          .toLowerCase();
        if (email) emails.add(email);
      }
      if (rows.length < pageSize) break;
      start += pageSize;
    }
  }
  return { phones, emails };
}

async function main() {
  const companyId = await resolveCompanyId();

  console.error("[1/5] adapt totals…");
  const adaptGrouped = await prisma.adaptPurchaseHistory.groupBy({
    by: ["contactId"],
    where: { companyId },
    _sum: { ttlAmount: true },
  });
  const adaptTotals = new Map();
  const candidateIds = new Set();
  for (const row of adaptGrouped) {
    const sum = toNum(row._sum.ttlAmount);
    adaptTotals.set(row.contactId, sum);
    if (sum >= GOLD_MIN * 0.5) candidateIds.add(row.contactId);
  }

  console.error("[2/5] Cosmo order high-spend phones…");
  const orderPhoneRows = await highSpendOrderPhones(companyId, GOLD_MIN * 0.5);
  const orderPhoneSpend = new Map();
  const highPhones = new Set();
  for (const row of orderPhoneRows) {
    const phone = String(row.phone ?? "").trim();
    if (!phone) continue;
    orderPhoneSpend.set(phone, toNum(row.total));
    for (const v of phoneVariants(phone)) highPhones.add(v);
  }

  // Match high-spend phones → contacts (primary + alias)
  const phoneMatched = highPhones.size
    ? await prisma.contactMaster.findMany({
        where: {
          companyId,
          loyaltyAssignedTier: null,
          OR: [
            { phoneNumber: { in: [...highPhones] } },
            { phones: { some: { phoneNumber: { in: [...highPhones] } } } },
          ],
        },
        select: { id: true },
      })
    : [];
  for (const c of phoneMatched) candidateIds.add(c.id);

  console.error(`[2/5] candidates so far: ${candidateIds.size}`);

  const flagged = await prisma.contactMaster.findMany({
    where: {
      companyId,
      loyaltyAssignedTier: null,
      OR: [
        { loyaltyOutreachStatus: { in: ["eligible", "contacted", "responded", "not_responded"] } },
        { id: { in: [...candidateIds] } },
      ],
    },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      assignedMerchant: true,
      loyaltyOutreachStatus: true,
      emails: { select: { email: true } },
      phones: { select: { phoneNumber: true } },
    },
  });
  console.error(`[3/5] unassigned candidates loaded: ${flagged.length}`);

  const phoneToContacts = new Map();
  const emailToContacts = new Map();
  for (const c of flagged) {
    const phones = [c.phoneNumber, ...c.phones.map((p) => p.phoneNumber)].filter(Boolean);
    const emails = [c.email, ...c.emails.map((e) => e.email)].filter(Boolean);
    for (const p of phones) {
      for (const v of phoneVariants(p)) {
        const list = phoneToContacts.get(v) ?? [];
        list.push(c.id);
        phoneToContacts.set(v, list);
      }
    }
    if (phones.length === 0) {
      for (const e of emails) {
        const key = e.trim().toLowerCase();
        if (!key) continue;
        const list = emailToContacts.get(key) ?? [];
        list.push(c.id);
        emailToContacts.set(key, list);
      }
    }
  }

  const orderTotals = new Map();
  // Attribute from pre-aggregated phone spend where exact phone key matches
  for (const [phone, total] of orderPhoneSpend) {
    for (const contactId of phoneToContacts.get(phone) ?? []) {
      orderTotals.set(contactId, (orderTotals.get(contactId) ?? 0) + total);
    }
  }

  // Email-only contacts: fetch their orders
  const allEmailKeys = [...emailToContacts.keys()];
  const EMAIL_CHUNK = 800;
  for (let i = 0; i < allEmailKeys.length; i += EMAIL_CHUNK) {
    const slice = allEmailKeys.slice(i, i + EMAIL_CHUNK);
    const orders = await prisma.order.findMany({
      where: {
        companyId,
        cancelledAt: null,
        financialStatus: { not: "voided" },
        fulfillmentStage: { in: LIFETIME_STAGES },
        customerEmail: { in: slice, mode: "insensitive" },
      },
      select: { customerEmail: true, totalPrice: true },
    });
    for (const o of orders) {
      const email = (o.customerEmail ?? "").trim().toLowerCase();
      const amount = toNum(o.totalPrice);
      for (const contactId of emailToContacts.get(email) ?? []) {
        orderTotals.set(contactId, (orderTotals.get(contactId) ?? 0) + amount);
      }
    }
  }

  const rows = [];
  for (const c of flagged) {
    const lifetime = (adaptTotals.get(c.id) ?? 0) + (orderTotals.get(c.id) ?? 0);
    if (lifetime < GOLD_MIN) continue;
    const tier = lifetime >= 250_000 ? "platinum" : "gold";
    rows.push({
      contactId: c.id,
      name: c.name,
      phone: c.phoneNumber ?? "",
      email: c.email ?? "",
      assignedMerchant: c.assignedMerchant ?? "",
      outreachStatus: c.loyaltyOutreachStatus ?? "",
      lifetimeTotal: Math.round(lifetime * 100) / 100,
      suggestedTier: tier,
      inErpLoyalty: false,
      osAssigned: false,
    });
  }
  rows.sort((a, b) => b.lifetimeTotal - a.lifetimeTotal);
  console.error(`[4/5] eligible (≥${GOLD_MIN}) + OS unassigned: ${rows.length}`);

  let erpConfigs = await loadErpConfigsFromDb(companyId);
  if (erpConfigs.length === 0) {
    erpConfigs = [
      {
        label: "ERP1-env",
        baseUrl: (process.env.ERPNEXT_BASE_URL || "").replace(/\/$/, ""),
        apiKey: process.env.ERPNEXT_API_KEY,
        apiSecret: process.env.ERPNEXT_API_SECRET,
      },
    ].filter((c) => c.baseUrl && c.apiKey && c.apiSecret);
  }

  const erpPhones = new Set();
  const erpEmails = new Set();
  for (const cfg of erpConfigs) {
    console.error(`[erp] loyalty phones ← ${cfg.label}…`);
    try {
      const { phones, emails } = await fetchErpLoyaltyPhones(
        cfg.baseUrl,
        cfg.apiKey,
        cfg.apiSecret
      );
      for (const p of phones) erpPhones.add(p);
      for (const e of emails) erpEmails.add(e);
      console.error(`[erp] ${cfg.label}: ${phones.size} phones, ${emails.size} emails`);
    } catch (err) {
      console.error(`[erp] ${cfg.label} failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  for (const row of rows) {
    const phoneHit = phoneVariants(row.phone).some((v) =>
      erpPhones.has(canonicalPhone(v))
    );
    const emailHit = row.email
      ? erpEmails.has(row.email.trim().toLowerCase())
      : false;
    row.inErpLoyalty = phoneHit || emailHit;
  }

  const unregistered = rows.filter((r) => !r.inErpLoyalty);
  const limited = limitArg > 0 ? unregistered.slice(0, limitArg) : unregistered;

  const summary = {
    companyId,
    goldMin: GOLD_MIN,
    scannedCandidates: flagged.length,
    eligibleUnassignedOs: rows.length,
    alreadyInErpLoyalty: rows.filter((r) => r.inErpLoyalty).length,
    eligibleNotInErp: unregistered.length,
    erpLoyaltyPhones: erpPhones.size,
    erpInstancesChecked: erpConfigs.map((c) => c.label),
    note:
      "Eligible = OS lifetime (Adapt + Cosmo delivery/invoice-complete) ≥ 100000. Registered = ERP customer_group Gold/Platinum (or loyalcs/loyalcs2). Shopify tags not checked live — assign flow sets both ERP group + Shopify tag together.",
    generatedAt: new Date().toISOString(),
    rows: limited,
  };

  const payload = JSON.stringify(summary, null, 2);
  if (outArg) {
    const path = resolve(outArg);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, payload);
    console.error(`[out] wrote ${limited.length} rows → ${path}`);
  } else {
    console.log(payload);
  }

  console.error(
    `[done] eligible+unassigned OS=${rows.length}; not in ERP loyalty=${unregistered.length}; already ERP=${rows.filter((r) => r.inErpLoyalty).length}`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
