/**
 * 1) Export Cosmo contacts with phone but no assignedMerchant (post allocation import leftovers).
 * 2) Fix ambiguous Excel phones by assigning merchant to ALL matching contacts.
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-prod node scripts/fix-ambiguous-and-export-unallocated.cjs \
 *     --company-id cmn2xcas1002crl5xtgoq28f5 \
 *     --report ./data/allocated-merchant-2026-08-10-report.json \
 *     --export ./data/cosmo-unallocated-with-phone-2026-08-10.xlsx
 */

const { writeFileSync, mkdirSync } = require("node:fs");
const { dirname } = require("node:path");
const { PrismaClient } = require("@prisma/client");
const XLSX = require("xlsx");

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
  const companyId =
    typeof args["company-id"] === "string"
      ? args["company-id"]
      : "cmn2xcas1002crl5xtgoq28f5";
  const reportPath =
    typeof args.report === "string"
      ? args.report
      : "./data/allocated-merchant-2026-08-10-report.json";
  const exportPath =
    typeof args.export === "string"
      ? args.export
      : "./data/cosmo-unallocated-with-phone-2026-08-10.xlsx";
  const dryRun = Boolean(args["dry-run"]);

  const report = require(require("node:path").resolve(reportPath));
  const ambiguous = (report.excelLeftovers || []).filter(
    (r) => r.reason === "ambiguous_multiple_contacts"
  );
  const unallocatedIds = (report.cosmoStillUnallocated || [])
    .filter((r) => r.reason === "contact_has_no_assigned_merchant")
    .map((r) => r.contactId);

  const rawUrl = process.env.DATABASE_URL ?? "";
  const prisma = new PrismaClient({
    datasources: {
      db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl },
    },
  });

  console.log(
    `[fix-export] company=${companyId} ambiguous=${ambiguous.length} unallocatedWithPhone=${unallocatedIds.length} dryRun=${dryRun}`
  );

  try {
    // --- Fix ambiguous: assign Excel merchant to ALL matching contacts ---
    let ambiguousContactsUpdated = 0;
    const ambiguousDetails = [];
    for (const row of ambiguous) {
      const merchant = String(row.allocatedMerchant || "").trim();
      const contactIds = Array.isArray(row.contactIds) ? row.contactIds : [];
      if (!merchant || contactIds.length === 0) continue;

      const contacts = await prisma.contactMaster.findMany({
        where: { companyId, id: { in: contactIds } },
        select: {
          id: true,
          name: true,
          phoneNumber: true,
          assignedMerchant: true,
          lastPurchaseAt: true,
          updatedAt: true,
        },
      });

      const toUpdate = contacts.filter(
        (c) =>
          !c.assignedMerchant ||
          c.assignedMerchant.trim().toLowerCase() !== merchant.toLowerCase()
      );

      ambiguousDetails.push({
        phone: row.phone,
        merchant,
        contacts: contacts.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phoneNumber,
          from: c.assignedMerchant,
          to: merchant,
        })),
        updateCount: toUpdate.length,
      });

      if (!dryRun && toUpdate.length > 0) {
        const ids = toUpdate.map((c) => c.id);
        await prisma.contactMaster.updateMany({
          where: { companyId, id: { in: ids } },
          data: { assignedMerchant: merchant },
        });
        await prisma.contactAllocationUpdate.createMany({
          data: ids.map((contactId) => ({
            companyId,
            contactId,
            merchantId: null,
            merchantName: merchant,
            category: "allocation",
          })),
        });
        ambiguousContactsUpdated += ids.length;
      } else if (dryRun) {
        ambiguousContactsUpdated += toUpdate.length;
      }
    }

    console.log(
      `[fix-export] ambiguous phones=${ambiguous.length} contactsUpdated=${ambiguousContactsUpdated}`
    );

    // --- Export unallocated-with-phone contacts to Excel ---
    const exportRows = [];
    const chunkSize = 500;
    for (let i = 0; i < unallocatedIds.length; i += chunkSize) {
      const chunk = unallocatedIds.slice(i, i + chunkSize);
      const contacts = await prisma.contactMaster.findMany({
        where: { companyId, id: { in: chunk } },
        select: {
          id: true,
          name: true,
          phoneNumber: true,
          email: true,
          assignedMerchant: true,
          recentMerchant: true,
          lastPurchaseAt: true,
          source: true,
          district: true,
          zone: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      for (const c of contacts) {
        // Skip if ambiguous fix (or anything else) already allocated them
        if (c.assignedMerchant?.trim()) continue;
        exportRows.push({
          PHONE_NUMBER: c.phoneNumber,
          CONTACT_NAME: c.name,
          CONTACT_ID: c.id,
          EMAIL: c.email,
          RECENT_MERCHANT: c.recentMerchant,
          LAST_PURCHASE_AT: c.lastPurchaseAt
            ? c.lastPurchaseAt.toISOString()
            : null,
          SOURCE: c.source,
          DISTRICT: c.district,
          ZONE: c.zone,
          CREATED_AT: c.createdAt.toISOString(),
          UPDATED_AT: c.updatedAt.toISOString(),
        });
      }
    }

    mkdirSync(dirname(exportPath), { recursive: true });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportRows);
    XLSX.utils.book_append_sheet(wb, ws, "Unallocated");
    XLSX.writeFile(wb, exportPath);

    const resultPath = exportPath.replace(/\.xlsx$/i, "-ambiguous-fix.json");
    writeFileSync(
      resultPath,
      `${JSON.stringify(
        {
          companyId,
          dryRun,
          ambiguousPhones: ambiguous.length,
          ambiguousContactsUpdated,
          ambiguousDetails,
          exportedUnallocatedWithPhone: exportRows.length,
          exportPath,
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    console.log(
      JSON.stringify(
        {
          ambiguousPhones: ambiguous.length,
          ambiguousContactsUpdated,
          exportedUnallocatedWithPhone: exportRows.length,
          exportPath,
          resultPath,
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
