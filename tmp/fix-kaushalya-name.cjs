/**
 * One-shot: rename Ms-kaushalya (0768229455) → ERP real name Kumuduni Rathnayaka.
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-prod node tmp/fix-kaushalya-name.cjs --dry-run
 *   node scripts/with-env.mjs cosmo-prod node tmp/fix-kaushalya-name.cjs
 */

const { PrismaClient } = require("@prisma/client");

const CONTACT_ID = "cmsepvn6b45exwcygkom8umpf";
const REAL_NAME = "Kumuduni Rathnayaka";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const prisma = new PrismaClient();
  try {
    const before = await prisma.contactMaster.findUnique({
      where: { id: CONTACT_ID },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        email: true,
        lastPurchaseAt: true,
      },
    });
    console.log("BEFORE", before);
    if (!before) {
      console.error("Contact not found");
      process.exit(1);
    }
    if (dryRun) {
      console.log("DRY_RUN would set name →", REAL_NAME, "email → null");
      return;
    }
    const after = await prisma.contactMaster.update({
      where: { id: CONTACT_ID },
      data: {
        name: REAL_NAME,
        email: null,
      },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        email: true,
        lastPurchaseAt: true,
      },
    });
    console.log("AFTER", after);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
