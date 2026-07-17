/**
 * Seed OSF stock columns for the individual Cosmetics.lk shop warehouses.
 * These warehouses are NOT separate Cosmo locations, so the columns target the
 * ERP warehouses directly (directWarehouses + erpnextInstanceId), using the same
 * ERP instance as the Cosmetics.lk location.
 *
 * Usage:
 *   node --env-file=.env scripts/seed-osf-cosmo-shop-columns.mjs <companyId>
 */
import { PrismaClient } from "@prisma/client";

const SHOPS = [
  { key: "cosmo_shop_gcc", label: "GCC Shop", warehouse: "GCC Shop Warehouse - Cosmo", sortOrder: 11 },
  { key: "cosmo_shop_pepiliyana", label: "Pepiliyana Shop", warehouse: "Pepiliyana Shop Warehouse - Cosmo", sortOrder: 12 },
  { key: "cosmo_shop_ogf", label: "OGF Shop", warehouse: "OGF Shop Warehouse - Cosmo", sortOrder: 13 },
  { key: "cosmo_shop_kiribathgoda", label: "Kiribathgoda Shop", warehouse: "Kiribathgoda Shop Warehouse - Cosmo", sortOrder: 14 },
  { key: "cosmo_shop_maharagama", label: "Maharagama Shop", warehouse: "Maharagama Shop Warehouse - Cosmo", sortOrder: 15 },
  { key: "cosmo_shop_coolplanet", label: "Cool Planet Shop", warehouse: "Cool Planet Nugegoda Shop Warehouse - Cosmo", sortOrder: 16 },
];

const companyId = process.argv[2];
if (!companyId) {
  console.error("Usage: node scripts/seed-osf-cosmo-shop-columns.mjs <companyId>");
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const cosmoLoc = await prisma.companyLocation.findFirst({
    where: { companyId, name: "Cosmetics.lk" },
    select: { erpnextInstanceId: true },
  });
  const instanceId = cosmoLoc?.erpnextInstanceId ?? null;
  if (!instanceId) {
    console.error("Cosmetics.lk location has no ERP instance mapped — aborting.");
    process.exit(1);
  }

  for (const shop of SHOPS) {
    await prisma.osfColumnConfig.upsert({
      where: { companyId_key: { companyId, key: shop.key } },
      create: {
        companyId,
        key: shop.key,
        label: shop.label,
        companyLocationId: null,
        erpnextInstanceId: instanceId,
        directWarehouses: [shop.warehouse],
        includeInStock: true,
        includeInRop: false,
        sortOrder: shop.sortOrder,
        active: true,
      },
      update: {
        label: shop.label,
        erpnextInstanceId: instanceId,
        directWarehouses: [shop.warehouse],
        sortOrder: shop.sortOrder,
      },
    });
    console.log(`${shop.label} → ${shop.warehouse} (instance ${instanceId})`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
