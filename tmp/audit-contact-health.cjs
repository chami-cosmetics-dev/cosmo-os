/**
 * Full contact DB health + ERP sync snapshot.
 * Usage: node scripts/with-env.mjs cosmo-prod node tmp/audit-contact-health.cjs
 */
const { PrismaClient } = require("@prisma/client");

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
const raw = process.env.DATABASE_URL || "";
const url = raw.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || raw;
const prisma = new PrismaClient({ datasources: { db: { url } } });

function phoneDigitsOnly(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  return d;
}

function buildPhoneLookupVariants(raw) {
  const t = String(raw || "").trim();
  const d = phoneDigitsOnly(raw);
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
  return [...out];
}

function variantsMatch(a, b) {
  const va = new Set(buildPhoneLookupVariants(a));
  const vb = new Set(buildPhoneLookupVariants(b));
  for (const v of va) if (vb.has(v)) return true;
  return false;
}

async function main() {
  const totalContacts = await prisma.contactMaster.count({ where: { companyId: COMPANY_ID } });

  const bySource = await prisma.$queryRaw`
    SELECT COALESCE(NULLIF(TRIM(source), ''), '(blank)') AS source, COUNT(*)::int AS count
    FROM "ContactMaster"
    WHERE "companyId" = ${COMPANY_ID}
    GROUP BY 1
    ORDER BY count DESC
  `;

  const withSecondary = await prisma.$queryRaw`
    SELECT
      cm.id,
      cm.name,
      cm."phoneNumber" AS primary_phone,
      cm.source,
      COUNT(cp.id)::int AS secondary_count,
      ARRAY_AGG(cp."phoneNumber" ORDER BY cp."createdAt") AS secondary_phones
    FROM "ContactMaster" cm
    INNER JOIN "ContactPhone" cp ON cp."contactId" = cm.id
    WHERE cm."companyId" = ${COMPANY_ID}
    GROUP BY cm.id
    ORDER BY COUNT(cp.id) DESC, cm.name ASC
  `;

  const noPrimaryPhone = await prisma.contactMaster.count({
    where: { companyId: COMPANY_ID, OR: [{ phoneNumber: null }, { phoneNumber: "" }] },
  });

  const duplicatePrimaryPhones = await prisma.$queryRaw`
    SELECT "phoneNumber", COUNT(*)::int AS count
    FROM "ContactMaster"
    WHERE "companyId" = ${COMPANY_ID}
      AND "phoneNumber" IS NOT NULL AND TRIM("phoneNumber") <> ''
    GROUP BY "phoneNumber"
    HAVING COUNT(*) > 1
    ORDER BY count DESC
    LIMIT 20
  `;

  const unmergeSource = await prisma.contactMaster.count({
    where: { companyId: COMPANY_ID, source: "unmerge-phone" },
  });

  const adaptContacts = await prisma.contactMaster.count({
    where: { companyId: COMPANY_ID, source: { startsWith: "adapt" } },
  });

  const erp1Contacts = await prisma.contactMaster.count({
    where: { companyId: COMPANY_ID, source: "erp1" },
  });
  const erp2Contacts = await prisma.contactMaster.count({
    where: { companyId: COMPANY_ID, source: "erp2" },
  });

  const erpInstances = await prisma.erpnextInstance.findMany({
    where: { companyId: COMPANY_ID },
    select: { id: true, label: true, baseUrl: true, incomingWebhookSecret: true },
    orderBy: { createdAt: "asc" },
  });

  // Format-variant duplicate secondaries (same number as primary, different format)
  let formatDupes = 0;
  let legitSecondaries = 0;
  const suspicious = [];
  for (const row of withSecondary) {
    const primary = row.primary_phone;
    const secondaries = row.secondary_phones || [];
    let allFormatDupes = true;
    for (const sec of secondaries) {
      if (variantsMatch(primary, sec)) formatDupes += 1;
      else {
        allFormatDupes = false;
        legitSecondaries += 1;
      }
    }
    if (!allFormatDupes && Number(row.secondary_count) >= 2) {
      suspicious.push({
        id: row.id,
        name: row.name,
        primary: row.primary_phone,
        previous: secondaries,
        source: row.source,
        count: row.secondary_count,
      });
    } else if (!allFormatDupes && Number(row.secondary_count) === 1) {
      suspicious.push({
        id: row.id,
        name: row.name,
        primary: row.primary_phone,
        previous: secondaries,
        source: row.source,
        count: row.secondary_count,
      });
    }
  }

  const buckets = { "1": 0, "2": 0, "3+": 0 };
  for (const row of withSecondary) {
    const n = Number(row.secondary_count);
    if (n === 1) buckets["1"] += 1;
    else if (n === 2) buckets["2"] += 1;
    else buckets["3+"] += 1;
  }

  console.log(
    JSON.stringify(
      {
        companyId: COMPANY_ID,
        totalContacts,
        noPrimaryPhone,
        contactsWithPreviousPhones: withSecondary.length,
        previousPhoneBuckets: buckets,
        formatVariantPreviousRows: formatDupes,
        nonFormatPreviousRows: legitSecondaries,
        unmergeSplitContacts: unmergeSource,
        adaptSourceContacts: adaptContacts,
        erp1TaggedContacts: erp1Contacts,
        erp2TaggedContacts: erp2Contacts,
        bySource,
        duplicatePrimaryPhonesSample: duplicatePrimaryPhones,
        erpInstances: erpInstances.map((i) => ({
          label: i.label,
          baseUrl: i.baseUrl,
          webhookConfigured: Boolean(i.incomingWebhookSecret?.trim()),
        })),
        allPreviousPhoneContacts: suspicious,
        extremeMultiPrevious: withSecondary
          .filter((r) => Number(r.secondary_count) >= 3)
          .map((r) => ({
            name: r.name,
            primary: r.primary_phone,
            previous: r.secondary_phones,
            count: r.secondary_count,
          })),
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
