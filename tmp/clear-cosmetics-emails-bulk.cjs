/**
 * Strip cosmetics-pattern emails (same rules as Email cleanup UI).
 *   node scripts/with-env.mjs cosmo-prod node tmp/clear-cosmetics-emails-bulk.cjs --dry-run
 *   node scripts/with-env.mjs cosmo-prod node tmp/clear-cosmetics-emails-bulk.cjs --apply
 */
const { PrismaClient } = require("@prisma/client");

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
const apply = process.argv.includes("--apply");

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: (process.env.DATABASE_URL || "").replace(
        /(ep-[^.]+)-pooler(\.[^/]+)/,
        "$1$2"
      ),
    },
  },
});

function normalizeEmail(value) {
  const t = String(value || "").trim().toLowerCase();
  return t || null;
}

function matchesCosmetics(value) {
  const n = normalizeEmail(value);
  if (!n) return false;
  return /cosmetic|cosmatics/i.test(n);
}

function looksValid(value) {
  const n = normalizeEmail(value);
  if (!n) return false;
  if (matchesCosmetics(n)) return false;
  return emailOk(n);
}

function emailOk(n) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(n);
}

async function main() {
  const contacts = await prisma.contactMaster.findMany({
    where: {
      companyId: COMPANY_ID,
      OR: [
        { email: { contains: "cosmetic", mode: "insensitive" } },
        { emails: { some: { email: { contains: "cosmetic", mode: "insensitive" } } } },
      ],
    },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      emails: {
        select: { id: true, email: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const jobs = [];
  for (const c of contacts) {
    const remove = new Set();
    const primary = normalizeEmail(c.email);
    if (primary && matchesCosmetics(primary)) remove.add(primary);
    for (const row of c.emails) {
      const s = normalizeEmail(row.email);
      if (s && matchesCosmetics(s)) remove.add(s);
    }
    if (remove.size === 0) continue;
    jobs.push({ contact: c, remove: [...remove] });
  }

  let cleared = 0;
  let promoted = 0;

  if (apply) {
    for (const job of jobs) {
      const c = job.contact;
      const removeSet = new Set(job.remove);
      const primary = normalizeEmail(c.email);
      const primaryCleared = primary != null && removeSet.has(primary);
      const secondaryIds = c.emails
        .filter((row) => {
          const n = normalizeEmail(row.email);
          return n && removeSet.has(n);
        })
        .map((row) => row.id);

      await prisma.$transaction(async (tx) => {
        if (primaryCleared) {
          await tx.contactMaster.update({
            where: { id: c.id },
            data: { email: null },
          });
        }
        if (secondaryIds.length) {
          await tx.contactEmail.deleteMany({ where: { id: { in: secondaryIds } } });
        }
        await tx.contactRemovedEmail.createMany({
          data: job.remove.map((email) => ({
            companyId: COMPANY_ID,
            contactId: c.id,
            email,
            reason: "cosmetics_pattern",
          })),
        });
      });

      if (primaryCleared) {
        const left = await prisma.contactEmail.findMany({
          where: { contactId: c.id },
          orderBy: { createdAt: "asc" },
          select: { id: true, email: true },
        });
        const cand = left.find((row) => looksValid(row.email));
        if (cand) {
          const promotedEmail = normalizeEmail(cand.email);
          await prisma.$transaction([
            prisma.contactMaster.update({
              where: { id: c.id },
              data: { email: promotedEmail },
            }),
            prisma.contactEmail.delete({ where: { id: cand.id } }),
          ]);
          promoted += 1;
        }
      }
      cleared += 1;
      if (cleared % 250 === 0) {
        console.error(`progress ${cleared}/${jobs.length}`);
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        matchedContacts: jobs.length,
        emailsToStrip: jobs.reduce((n, j) => n + j.remove.length, 0),
        cleared,
        promoted,
      },
      null,
      2
    )
  );
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
