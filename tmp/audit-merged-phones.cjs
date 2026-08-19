/**
 * Audit contacts with secondary phones (UI: Primary + Previous).
 * Usage: node scripts/with-env.mjs cosmo-prod node tmp/audit-merged-phones.cjs [--company-id <id>]
 */
const { PrismaClient } = require("@prisma/client");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const companyIdFilter =
    typeof args["company-id"] === "string" ? args["company-id"] : null;

  const rawUrl = process.env.DATABASE_URL ?? "";
  const prisma = new PrismaClient({
    datasources: {
      db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl },
    },
  });

  try {
    const companies = await prisma.company.findMany({
      where: companyIdFilter ? { id: companyIdFilter } : undefined,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    const report = [];

    for (const company of companies) {
      const totalContacts = await prisma.contactMaster.count({
        where: { companyId: company.id },
      });

      // Contacts that have ≥1 secondary ContactPhone row
      const withSecondary = await prisma.$queryRaw`
        SELECT
          cm.id,
          cm.name,
          cm."phoneNumber" AS primary_phone,
          cm.email,
          cm."loyaltyAssignedTier" AS loyalty_tier,
          COUNT(cp.id)::int AS secondary_count,
          ARRAY_AGG(cp."phoneNumber" ORDER BY cp."createdAt") AS secondary_phones
        FROM "ContactMaster" cm
        INNER JOIN "ContactPhone" cp ON cp."contactId" = cm.id
        WHERE cm."companyId" = ${company.id}
        GROUP BY cm.id
        ORDER BY COUNT(cp.id) DESC, cm.name ASC
      `;

      const buckets = { "1": 0, "2": 0, "3+": 0 };
      for (const row of withSecondary) {
        const n = Number(row.secondary_count);
        if (n === 1) buckets["1"] += 1;
        else if (n === 2) buckets["2"] += 1;
        else buckets["3+"] += 1;
      }

      const withSecondaryEmails = await prisma.$queryRaw`
        SELECT COUNT(*)::int AS count
        FROM (
          SELECT cm.id
          FROM "ContactMaster" cm
          INNER JOIN "ContactEmail" ce ON ce."contactId" = cm.id
          WHERE cm."companyId" = ${company.id}
          GROUP BY cm.id
          HAVING COUNT(ce.id) >= 1
        ) t
      `;

      // Recent contact_merged audit events (if any)
      let mergeAuditCount = 0;
      try {
        mergeAuditCount = await prisma.auditLog.count({
          where: {
            companyId: company.id,
            action: "contact_merged",
          },
        });
      } catch {
        mergeAuditCount = -1;
      }

      report.push({
        companyId: company.id,
        companyName: company.name,
        totalContacts,
        contactsWithSecondaryPhones: withSecondary.length,
        pctOfContacts:
          totalContacts > 0
            ? Number(((withSecondary.length / totalContacts) * 100).toFixed(2))
            : 0,
        secondaryPhoneBuckets: buckets,
        contactsWithSecondaryEmails: withSecondaryEmails[0]?.count ?? 0,
        contactMergedAuditEvents: mergeAuditCount,
        topBySecondaryCount: withSecondary.slice(0, 40).map((r) => ({
          id: r.id,
          name: r.name,
          primary: r.primary_phone,
          secondaries: r.secondary_count,
          previousPhones: r.secondary_phones,
          email: r.email,
          loyalty: r.loyalty_tier,
        })),
        // Decision risk: ≥2 previous phones (like Hansanie), or merchant-ish email glue
        likeHansanieOrWorse: withSecondary
          .filter((r) => Number(r.secondary_count) >= 2)
          .map((r) => ({
            id: r.id,
            name: r.name,
            primary: r.primary_phone,
            secondaries: r.secondary_count,
            previousPhones: r.secondary_phones,
            email: r.email,
            loyalty: r.loyalty_tier,
            merchantishEmail: /cosmetics|@cosmetics\.|merchant/i.test(String(r.email || "")),
          })),
      });
    }

    // Write CSV of all multi-phone contacts for ops review
    const allRows = report.flatMap((c) =>
      c.likeHansanieOrWorse.map((r) => ({
        company: c.companyName,
        ...r,
      }))
    );
    const fs = require("fs");
    const path = require("path");
    const csvPath = path.join(__dirname, "merged-phones-2plus.csv");
    const header = [
      "company",
      "id",
      "name",
      "primary",
      "secondaries",
      "previousPhones",
      "email",
      "loyalty",
      "merchantishEmail",
    ];
    const csv = [
      header.join(","),
      ...allRows.map((r) =>
        [
          r.company,
          r.id,
          JSON.stringify(r.name ?? ""),
          r.primary ?? "",
          r.secondaries,
          JSON.stringify((r.previousPhones || []).join("|")),
          JSON.stringify(r.email ?? ""),
          r.loyalty ?? "",
          r.merchantishEmail,
        ].join(",")
      ),
    ].join("\n");
    fs.writeFileSync(csvPath, csv, "utf8");
    console.error(`[audit] wrote ${csvPath} (${allRows.length} rows with ≥2 previous phones)`);

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
