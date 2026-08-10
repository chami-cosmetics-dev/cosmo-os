/**
 * Remap ContactMaster.assignedMerchant Excel labels → Cosmo user knownName/name.
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-prod node scripts/remap-assigned-merchant-labels.cjs --dry-run
 *   node scripts/with-env.mjs cosmo-prod node scripts/remap-assigned-merchant-labels.cjs
 */

const { writeFileSync, mkdirSync } = require("node:fs");
const { dirname } = require("node:path");
const { PrismaClient } = require("@prisma/client");

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";

/** Excel label → Cosmo viewer label (knownName preferred) */
const REMAPS = [
  { from: "Kaushalya", to: "Kaushallya", email: "kiribathgodapos1@gmail.com" },
  { from: "Semini", to: "Sanda/semini", email: "ogfpos2@gmail.com" },
  { from: "Sadali", to: "sandali", email: "sandali.cosmetics@outlook.com" },
  { from: "Samadi", to: "Samadhi", email: "coolplanetpos2@gmail.com" },
  { from: "Maheshi", to: "Mashi", email: "ogfpos1@gmail.com" },
  // Imandi has no knownName; keep Excel label and set knownName on user
  { from: "Imandi", to: "Imandi", email: "imandicosmetics@gmail.com", setKnownName: "Imandi" },
];

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
  const dryRun = Boolean(args["dry-run"]);
  const reportPath =
    typeof args.report === "string"
      ? args.report
      : "./data/remap-assigned-merchant-labels-2026-08-10.json";

  const rawUrl = process.env.DATABASE_URL ?? "";
  const prisma = new PrismaClient({
    datasources: {
      db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl },
    },
  });

  const results = [];
  console.log(`[remap] company=${COMPANY_ID} dryRun=${dryRun}`);

  try {
    for (const map of REMAPS) {
      const user = await prisma.user.findFirst({
        where: { companyId: COMPANY_ID, email: { equals: map.email, mode: "insensitive" } },
        select: { id: true, knownName: true, name: true, email: true },
      });

      const before = await prisma.contactMaster.count({
        where: {
          companyId: COMPANY_ID,
          assignedMerchant: { equals: map.from, mode: "insensitive" },
        },
      });

      let updated = 0;
      let knownNameUpdated = false;

      if (!dryRun) {
        if (map.setKnownName && user && (user.knownName || "").trim() !== map.setKnownName) {
          await prisma.user.update({
            where: { id: user.id },
            data: { knownName: map.setKnownName },
          });
          knownNameUpdated = true;
        }

        if (map.from.toLowerCase() !== map.to.toLowerCase()) {
          const res = await prisma.contactMaster.updateMany({
            where: {
              companyId: COMPANY_ID,
              assignedMerchant: { equals: map.from, mode: "insensitive" },
            },
            data: { assignedMerchant: map.to },
          });
          updated = res.count;
        } else {
          updated = before; // label already correct; knownName fix is enough
        }
      } else {
        updated = map.from.toLowerCase() === map.to.toLowerCase() ? before : before;
        knownNameUpdated = Boolean(
          map.setKnownName && user && (user.knownName || "").trim() !== map.setKnownName
        );
      }

      const after = dryRun
        ? null
        : await prisma.contactMaster.count({
            where: {
              companyId: COMPANY_ID,
              assignedMerchant: { equals: map.to, mode: "insensitive" },
            },
          });

      const row = {
        from: map.from,
        to: map.to,
        email: map.email,
        userFound: Boolean(user),
        userKnownNameBefore: user?.knownName ?? null,
        userName: user?.name ?? null,
        contactsMatchedBefore: before,
        contactsUpdated: dryRun ? 0 : updated,
        wouldUpdate: dryRun ? updated : undefined,
        knownNameUpdated: dryRun ? knownNameUpdated : knownNameUpdated,
        contactsWithToLabelAfter: after,
      };
      results.push(row);
      console.log(JSON.stringify(row));
    }

    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(
      reportPath,
      `${JSON.stringify({ companyId: COMPANY_ID, dryRun, results }, null, 2)}\n`,
      "utf8"
    );
    console.log(`[remap] wrote ${reportPath}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
