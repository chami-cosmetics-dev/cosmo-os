/**
 * Export contacts with Previous phones (+ recently deduped) for manual review.
 * Usage: node scripts/with-env.mjs cosmo-prod node tmp/export-previous-contacts.cjs
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
const raw = process.env.DATABASE_URL || "";
const url = raw.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || raw;
const prisma = new PrismaClient({ datasources: { db: { url } } });

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function parseCsvLine(line) {
  const cols = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cols.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  cols.push(cur);
  return cols;
}

function readDedupedFromPlanCsv() {
  const tmpDir = path.join(__dirname);
  const files = fs
    .readdirSync(tmpDir)
    .filter((f) => f.startsWith("unmerge-phone-plan-") && f.endsWith(".csv"))
    .sort()
    .reverse();
  const applyFile = files.find((f) => {
    const content = fs.readFileSync(path.join(tmpDir, f), "utf8");
    return content.includes("dedupe_primary_variant");
  });
  if (!applyFile) return [];

  const lines = fs.readFileSync(path.join(tmpDir, applyFile), "utf8").split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const idx = (name) => header.indexOf(name);
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const get = (n) => cols[idx(n)] ?? "";
    if (get("action") !== "dedupe_primary_variant") continue;
    out.push({
      contactId: get("parentContactId"),
      name: get("parentName"),
      primaryPhone: get("primaryPhone"),
      previousPhone: get("secondaryPhone"),
      status: "deduped_2026-08-14",
      reason: get("reason"),
    });
  }
  return out;
}

function buildPhoneLookupVariants(raw) {
  const t = String(raw || "").trim();
  let d = String(raw || "").replace(/\D/g, "");
  const out = new Set();
  if (t) out.add(t);
  if (d.startsWith("00")) d = d.slice(2);
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
  return [...out].filter(Boolean);
}

async function countOrdersForPhone(companyId, phone) {
  const variants = buildPhoneLookupVariants(phone);
  if (!variants.length) return 0;
  return prisma.order.count({
    where: { companyId, customerPhone: { in: variants } },
  });
}

async function main() {
  const rows = await prisma.$queryRaw`
    SELECT
      cm.id,
      cm.name,
      cm."phoneNumber" AS primary_phone,
      cm.email,
      cm.source,
      cm."loyaltyAssignedTier" AS loyalty_tier,
      cm."assignedMerchant" AS assigned_merchant,
      cm."lastPurchaseAt" AS last_purchase_at,
      ARRAY_AGG(cp."phoneNumber" ORDER BY cp."createdAt") AS previous_phones,
      COUNT(cp.id)::int AS previous_count
    FROM "ContactMaster" cm
    INNER JOIN "ContactPhone" cp ON cp."contactId" = cm.id
    WHERE cm."companyId" = ${COMPANY_ID}
    GROUP BY cm.id
    ORDER BY COUNT(cp.id) DESC, cm.name ASC
  `;

  const deduped = readDedupedFromPlanCsv();
  const dedupedIds = new Set(deduped.map((r) => r.contactId));

  const contactIds = [...new Set([...rows.map((r) => r.id), ...deduped.map((r) => r.contactId)])];

  const orderCounts = new Map();
  const adaptCounts = new Map();
  for (const id of contactIds) {
    const cm = await prisma.contactMaster.findUnique({
      where: { id },
      select: { phoneNumber: true },
    });
    const [orders, adapt] = await Promise.all([
      countOrdersForPhone(COMPANY_ID, cm?.phoneNumber),
      prisma.adaptPurchaseHistory.count({ where: { companyId: COMPANY_ID, contactId: id } }),
    ]);
    orderCounts.set(id, orders);
    adaptCounts.set(id, adapt);
  }

  const outPath = path.join(__dirname, "previous-contacts-review.csv");
  const header = [
    "status",
    "contact_id",
    "name",
    "primary_phone",
    "previous_phones",
    "email",
    "source",
    "loyalty_tier",
    "assigned_merchant",
    "last_purchase_at",
    "cosmo_orders",
    "adapt_invoices",
    "notes",
  ];

  const csvRows = [header.join(",")];

  for (const r of rows) {
    csvRows.push(
      [
        "active_previous",
        r.id,
        r.name,
        r.primary_phone ?? "",
        (r.previous_phones || []).join("|"),
        r.email ?? "",
        r.source ?? "",
        r.loyalty_tier ?? "",
        r.assigned_merchant ?? "",
        r.last_purchase_at ? new Date(r.last_purchase_at).toISOString().slice(0, 10) : "",
        orderCounts.get(r.id) ?? 0,
        adaptCounts.get(r.id) ?? 0,
        "legit previous phone(s) — review if name-linked",
      ].map(csvEscape).join(","),
    );
  }

  for (const d of deduped) {
    if (rows.some((r) => r.id === d.contactId)) continue;
    const cm = await prisma.contactMaster.findUnique({
      where: { id: d.contactId },
      select: {
        email: true,
        source: true,
        loyaltyAssignedTier: true,
        assignedMerchant: true,
        lastPurchaseAt: true,
      },
    });
    csvRows.push(
      [
        d.status,
        d.contactId,
        d.name,
        d.primaryPhone,
        d.previousPhone,
        cm?.email ?? "",
        cm?.source ?? "",
        cm?.loyaltyAssignedTier ?? "",
        cm?.assignedMerchant ?? "",
        cm?.lastPurchaseAt ? new Date(cm.lastPurchaseAt).toISOString().slice(0, 10) : "",
        orderCounts.get(d.contactId) ?? 0,
        adaptCounts.get(d.contactId) ?? 0,
        "duplicate removed — same number as primary",
      ].map(csvEscape).join(","),
    );
  }

  fs.writeFileSync(outPath, csvRows.join("\n"), "utf8");
  console.log(
    JSON.stringify(
      {
        file: outPath,
        activePreviousContacts: rows.length,
        dedupedIncluded: deduped.length,
        totalRows: csvRows.length - 1,
      },
      null,
      2,
    ),
  );
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
