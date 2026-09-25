/**
 * Seed OSF location columns for Cosmetics.lk (Main sheet stock + ROP).
 * Maps locations by shortName / name — never hard-codes location IDs.
 *
 * Usage:
 *   node --env-file=.env scripts/seed-osf-columns.mjs <companyId>
 *   node scripts/with-env.mjs cosmo-prod node scripts/seed-osf-columns.mjs <companyId>
 */

import { PrismaClient } from "@prisma/client";

/**
 * Cosmo ROP template 2026-09-25 order.
 * `match` is the Cosmo location shortName/name used to attach ERP warehouses.
 * `directWarehouses` overrides the location warehouse list for that column only.
 */
const DEFAULTS = [
  { key: "cosmetics_lk", label: "Cosmetics.lk Main Warehouse", match: "Cosmetics.lk", sortOrder: 10 },
  { key: "lmj", label: "LMJ", match: "LMJ", sortOrder: 20 },
  { key: "lwk", label: "LWK", match: "LWK", sortOrder: 30 },
  { key: "mnk", label: "MNK", match: "MNK", sortOrder: 40 },
  { key: "ajs", label: "AJS", match: "AJS", sortOrder: 50 },
  {
    key: "chami",
    label: "Chami Main Warehouse -Online",
    match: "Chami",
    sortOrder: 60,
    directWarehouses: ["Main Warehouse - Chami"],
  },
  {
    key: "chami_shop_gcc",
    label: "Chami ShopWarehouse GCC",
    match: "Chami",
    sortOrder: 65,
    directWarehouses: ["Shop Warehouse - Chami"],
  },
  { key: "dro", label: "DRO", match: "DRO", sortOrder: 70 },
  { key: "spk", label: "SPK", match: "SPK", sortOrder: 80 },
  { key: "pevi", label: "Pevi", match: "Pevi", sortOrder: 90 },
  { key: "thewan", label: "DTD", match: "DTD", sortOrder: 100 },
  { key: "kad", label: "KAD", match: "KAD", sortOrder: 110 },
  { key: "usp", label: "USP", match: "USP", sortOrder: 120 },
  { key: "udara", label: "Udara", match: "Udara", sortOrder: 130 },
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
    select: { id: true, name: true, shortName: true, erpnextInstanceId: true },
  });

  for (const def of DEFAULTS) {
    const loc = matchLocation(locations, def.match ?? def.label);
    const direct = def.directWarehouses ?? [];
    await prisma.osfColumnConfig.upsert({
      where: { companyId_key: { companyId, key: def.key } },
      create: {
        companyId,
        key: def.key,
        label: def.label,
        companyLocationId: loc?.id ?? null,
        erpnextInstanceId: loc?.erpnextInstanceId ?? null,
        directWarehouses: direct,
        includeInStock: true,
        includeInRop: true,
        sortOrder: def.sortOrder,
        active: true,
      },
      update: {
        label: def.label,
        sortOrder: def.sortOrder,
        active: true,
        includeInStock: true,
        includeInRop: true,
        ...(loc ? { companyLocationId: loc.id, erpnextInstanceId: loc.erpnextInstanceId } : {}),
        ...(direct.length ? { directWarehouses: direct } : {}),
      },
    });
    const wh = direct.length ? direct.join(", ") : "location warehouses";
    console.log(
      `${def.label} → ${loc ? `${loc.shortName || loc.name} (${loc.id})` : "unmapped"} [${wh}]`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
