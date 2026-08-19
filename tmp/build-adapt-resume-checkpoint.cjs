/**
 * Build Adapt import resume checkpoint from existing AdaptPurchaseHistory rows.
 * Usage: node scripts/with-env.mjs cosmo-prod node tmp/build-adapt-resume-checkpoint.cjs
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

async function main() {
  const companyId = "cmn2xcas1002crl5xtgoq28f5";
  const outPath = path.join(__dirname, "..", "data", "adapt-reimport-checkpoint.json");
  const rawUrl = process.env.DATABASE_URL ?? "";
  const prisma = new PrismaClient({
    datasources: {
      db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl },
    },
  });

  try {
    const rows = await prisma.adaptPurchaseHistory.findMany({
      where: { companyId, salesInvoiceMasterId: { not: null } },
      select: { salesInvoiceMasterId: true },
    });
    const completedKeys = [
      ...new Set(
        rows
          .map((r) => r.salesInvoiceMasterId)
          .filter(Boolean)
          .map((id) => `mid:${id}`)
      ),
    ];
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify({ completedKeys }, null, 2), "utf8");
    console.log(
      JSON.stringify(
        {
          companyId,
          adaptRows: rows.length,
          checkpointKeys: completedKeys.length,
          outPath: path.relative(path.join(__dirname, ".."), outPath).replace(/\\/g, "/"),
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
