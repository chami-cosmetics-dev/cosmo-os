/**
 * Seed default OSF column labels for a company (Cosmetics Main sheet stock columns).
 * Maps locations by shortName / name — never hard-codes location IDs.
 *
 * Usage:
 *   node --env-file=.env scripts/seed-osf-columns.mjs <companyId>
 *   # or with DATABASE_URL already in env
 */

import { PrismaClient } from "@prisma/client";

const DEFAULTS = [
  { key: "cosmetics_lk", label: "Cosmetics.lk", sortOrder: 10 },
  { key: "lmj", label: "LMJ", sortOrder: 20 },
  { key: "lwk", label: "LWK", sortOrder: 30 },
  { key: "mnk", label: "MNK", sortOrder: 40 },
  { key: "ajs", label: "AJS", sortOrder: 50 },
  { key: "chami", label: "Chami", sortOrder: 60 },
  { key: "dro", label: "DRO", sortOrder: 70 },
  { key: "spk", label: "SPK", sortOrder: 80 },
  { key: "pevi", label: "Pevi", sortOrder: 90 },
  { key: "thewan", label: "Thewan", sortOrder: 100 },
];

function norm(s) {
  return (s ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function matchLocation(locations, label) {
  const target = norm(label);
  return (
    locations.find((l) => norm(l.shortName) === target) ||
    locations.find((l) => norm(l.name) === target) ||
    locations.find((l) => norm(l.shortName).includes(target) || norm(l.name).includes(target)) ||
    null
  );
}

const companyId = process.argv[2];
if (!companyId) {
  console.error("Usage: node scripts/seed-osf-columns.mjs <companyId>");
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    console.error("Company not found:", companyId);
    process.exit(1);
  }

  const locations = await prisma.companyLocation.findMany({
    where: { companyId },
    select: { id: true, name: true, shortName: true },
  });

  for (const def of DEFAULTS) {
    const loc = matchLocation(locations, def.label);
    await prisma.osfColumnConfig.upsert({
      where: { companyId_key: { companyId, key: def.key } },
      create: {
        companyId,
        key: def.key,
        label: def.label,
        companyLocationId: loc?.id ?? null,
        includeInStock: true,
        includeInRop: true,
        sortOrder: def.sortOrder,
        active: true,
      },
      update: {
        label: def.label,
        sortOrder: def.sortOrder,
        ...(loc ? { companyLocationId: loc.id } : {}),
      },
    });
    console.log(
      `${def.label} → ${loc ? `${loc.shortName || loc.name} (${loc.id})` : "unmapped"}`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
