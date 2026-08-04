/**
 * Clear ContactMaster.email when it is a shared merchant/staff placeholder.
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-prod node scripts/clear-shared-merchant-contact-emails.cjs --company-id <id> --dry-run
 *   node scripts/with-env.mjs cosmo-prod node scripts/clear-shared-merchant-contact-emails.cjs --company-id <id>
 */

const { PrismaClient } = require("@prisma/client");

const SHARED_EXACT = new Set([
  "sales@cosmetics.lk",
  "info@lmj.lk",
  "info@cosmetics.lk",
  "shammi@cosmetics.lk",
  "dharshika@cosmetics.lk",
  "ruwini@cosmetics.lk",
  "nirukshi.cosmetics@outlook.com",
  "sachini.cosmetics@outlook.com",
  "ishadi.cosmetics@outlook.com",
  "venushka.cosmetics@outlook.com",
  "sandali.cosmetics@outlook.com",
  "dulshi25.cosmetics@gmail.com",
  "maheshisoysacosmetics@outlook.com",
  "nilmini.cosmetics@gmail.com",
]);

const SHARED_SUFFIXES = ["@cosmetics.lk", ".cosmetics@outlook.com", ".cosmetics@gmail.com"];

function isShared(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return false;
  if (SHARED_EXACT.has(e)) return true;
  return SHARED_SUFFIXES.some((s) => e.endsWith(s));
}

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
  const companyId = typeof args["company-id"] === "string" ? args["company-id"] : null;
  const dryRun = Boolean(args["dry-run"]);
  if (!companyId) {
    console.error(
      "Usage: node scripts/clear-shared-merchant-contact-emails.cjs --company-id <cuid> [--dry-run]"
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
    const contacts = await prisma.contactMaster.findMany({
      where: { companyId, email: { not: null } },
      select: { id: true, name: true, email: true, phoneNumber: true },
    });
    const hits = contacts.filter((c) => isShared(c.email));
    console.log(
      JSON.stringify(
        {
          companyId,
          dryRun,
          scanned: contacts.length,
          wouldClear: hits.length,
          samples: hits.slice(0, 20),
        },
        null,
        2
      )
    );
    if (dryRun) return;

    let cleared = 0;
    for (const hit of hits) {
      await prisma.contactMaster.update({
        where: { id: hit.id },
        data: { email: null },
      });
      cleared += 1;
    }
    console.log(`[clear-shared-emails] cleared=${cleared}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
