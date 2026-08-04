/**
 * Cleanup Adapt contact contamination on Cosmo:
 * - Strip secondary phones/emails glued on by Adapt import snowball
 * - Optionally purge AdaptPurchaseHistory so a fixed re-import can rebuild cleanly
 *
 * Usage (one line):
 *   node scripts/with-env.mjs cosmo-prod node scripts/cleanup-adapt-contact-contamination.cjs --company-id <id> --dry-run
 *   node scripts/with-env.mjs cosmo-prod node scripts/cleanup-adapt-contact-contamination.cjs --company-id <id> --purge-adapt-history
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

const CONTAMINATED_PHONE_ALIAS_MIN = 3;
const CONTAMINATED_EMAIL_ALIAS_MIN = 3;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const companyId = typeof args["company-id"] === "string" ? args["company-id"] : null;
  const dryRun = Boolean(args["dry-run"]);
  const purgeAdaptHistory = Boolean(args["purge-adapt-history"]);

  if (!companyId) {
    console.error(
      "Usage: node scripts/cleanup-adapt-contact-contamination.cjs --company-id <cuid> [--dry-run] [--purge-adapt-history]"
    );
    process.exit(1);
  }

  const rawUrl = process.env.DATABASE_URL ?? "";
  const prisma = new PrismaClient({
    datasources: {
      db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl },
    },
  });

  try {
    const company = await prisma.company.findFirst({
      where: { id: companyId },
      select: { id: true, name: true },
    });
    if (!company) {
      console.error(`Company not found: ${companyId}`);
      process.exit(1);
    }

    const adaptHistoryCount = await prisma.adaptPurchaseHistory.count({
      where: { companyId },
    });

    const contacts = await prisma.contactMaster.findMany({
      where: { companyId },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        email: true,
        _count: { select: { phones: true, emails: true, adaptPurchases: true } },
      },
    });

    const contaminated = contacts.filter(
      (c) =>
        c._count.phones >= CONTAMINATED_PHONE_ALIAS_MIN ||
        c._count.emails >= CONTAMINATED_EMAIL_ALIAS_MIN
    );

    const phoneAliasIds = contaminated.map((c) => c.id);
    const secondaryPhoneCount = phoneAliasIds.length
      ? await prisma.contactPhone.count({ where: { contactId: { in: phoneAliasIds } } })
      : 0;
    const secondaryEmailCount = phoneAliasIds.length
      ? await prisma.contactEmail.count({ where: { contactId: { in: phoneAliasIds } } })
      : 0;

    const report = {
      companyId,
      companyName: company.name,
      dryRun,
      purgeAdaptHistory,
      adaptHistoryCount,
      contaminatedContacts: contaminated.length,
      secondaryPhonesToDelete: secondaryPhoneCount,
      secondaryEmailsToDelete: secondaryEmailCount,
      topContaminated: contaminated
        .sort((a, b) => b._count.phones - a._count.phones)
        .slice(0, 15)
        .map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phoneNumber,
          phones: c._count.phones,
          emails: c._count.emails,
          adaptPurchases: c._count.adaptPurchases,
        })),
    };

    console.log(JSON.stringify(report, null, 2));

    if (dryRun) {
      console.log("[cleanup] dry-run only — no writes");
      return;
    }

    if (phoneAliasIds.length > 0) {
      const deletedPhones = await prisma.contactPhone.deleteMany({
        where: { contactId: { in: phoneAliasIds } },
      });
      const deletedEmails = await prisma.contactEmail.deleteMany({
        where: { contactId: { in: phoneAliasIds } },
      });
      console.log(
        `[cleanup] deleted secondary phones=${deletedPhones.count} emails=${deletedEmails.count}`
      );
    }

    if (purgeAdaptHistory) {
      const deletedHistory = await prisma.adaptPurchaseHistory.deleteMany({
        where: { companyId },
      });
      console.log(`[cleanup] deleted adaptPurchaseHistory=${deletedHistory.count}`);
    }

    console.log("[cleanup] done");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[cleanup] fatal", error);
  process.exit(1);
});
