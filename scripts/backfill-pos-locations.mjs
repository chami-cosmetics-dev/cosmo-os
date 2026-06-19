// Backfill POS order locations: creates CompanyLocation entries for each SV POS shop
// warehouse and reassigns past erpnext-pos orders to their correct location.
//
// Usage:
//   node scripts/backfill-pos-locations.mjs [--dry-run]
//
// --dry-run  : prints what would change without writing to the DB

import { PrismaClient } from "@prisma/client";

const rawUrl = process.env.DATABASE_URL ?? "";
const directUrl = rawUrl.replace(/(ep-[^.]+)-pooler(\.[^\/]+)/, "$1$2");
const prisma = new PrismaClient({ datasources: { db: { url: directUrl } } });

const isDryRun = process.argv.includes("--dry-run");

// SupplementVault.lk parent location — new shop locations inherit companyId and erpnextInstanceId
const SV_COMPANY_ID = "cmp5k145c006irlhemjfidlb5";
const SV_ERPNEXT_COMPANY = "SupplementVault.lk";
const SV_ERPNEXT_INSTANCE_ID = "cmpuofkje0001wc4829yas6g8";

const POS_SHOPS = [
  { name: "Cool Planet Nugegoda Shop", erpnextWarehouse: "Cool Planet Nugegoda Shop - SV-1" },
  { name: "Kiribathgoda Shop",         erpnextWarehouse: "Kiribathgoda Shop - SV-1" },
  { name: "Maharagama Shop",           erpnextWarehouse: "Maharagama Shop - SV-1" },
  { name: "Pepiliyana Shop",           erpnextWarehouse: "Pepiliyana Shop - SV-1" },
  { name: "OGF Shop",                  erpnextWarehouse: "OGF Shop - SV-1" },
];

async function main() {
  console.log("\n=== Backfill POS Locations ===");
  console.log(`Dry run: ${isDryRun}\n`);

  // Step 1: create missing CompanyLocation rows for each POS shop
  console.log("--- Step 1: Ensure CompanyLocation rows exist ---");
  const warehouseToLocationId = new Map();

  for (const shop of POS_SHOPS) {
    const existing = await prisma.companyLocation.findFirst({
      where: { companyId: SV_COMPANY_ID, erpnextWarehouse: shop.erpnextWarehouse },
      select: { id: true, name: true },
    });

    if (existing) {
      console.log(`  SKIP  ${shop.erpnextWarehouse} → already exists (${existing.id})`);
      warehouseToLocationId.set(shop.erpnextWarehouse, existing.id);
      continue;
    }

    if (isDryRun) {
      console.log(`  [dry-run] CREATE ${shop.name} (${shop.erpnextWarehouse})`);
      warehouseToLocationId.set(shop.erpnextWarehouse, `[new-${shop.name}]`);
      continue;
    }

    const created = await prisma.companyLocation.create({
      data: {
        companyId: SV_COMPANY_ID,
        name: shop.name,
        erpnextCompany: SV_ERPNEXT_COMPANY,
        erpnextWarehouse: shop.erpnextWarehouse,
        erpnextInstanceId: SV_ERPNEXT_INSTANCE_ID,
      },
      select: { id: true },
    });

    console.log(`  CREATE ${shop.name} (${shop.erpnextWarehouse}) → ${created.id}`);
    warehouseToLocationId.set(shop.erpnextWarehouse, created.id);
  }

  // Step 2: reassign past POS orders to their correct location
  console.log("\n--- Step 2: Reassign POS orders ---");

  const posOrders = await prisma.$queryRaw`
    SELECT id, name, "companyLocationId", "rawPayload"->>'set_warehouse' AS set_warehouse
    FROM "Order"
    WHERE "sourceName" = 'erpnext-pos'
      AND "rawPayload"->>'set_warehouse' IS NOT NULL
  `;

  let updated = 0, skipped = 0, unmapped = 0;

  for (const order of posOrders) {
    const targetLocationId = warehouseToLocationId.get(order.set_warehouse);

    if (!targetLocationId) {
      console.log(`  SKIP  ${order.name} — no location mapping for warehouse: ${order.set_warehouse}`);
      unmapped++;
      continue;
    }

    if (order.companyLocationId === targetLocationId) {
      skipped++;
      continue;
    }

    if (isDryRun) {
      console.log(`  [dry-run] ${order.name}: ${order.set_warehouse} → ${targetLocationId}`);
      updated++;
      continue;
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { companyLocationId: targetLocationId },
    });

    console.log(`  ✓ ${order.name}: ${order.set_warehouse} → ${targetLocationId}`);
    updated++;
  }

  console.log("\n=== Done ===");
  console.log(`Locations created : ${isDryRun ? "(dry-run)" : POS_SHOPS.length - [...warehouseToLocationId.values()].filter(v => v.startsWith?.("[")).length}`);
  console.log(`Orders updated    : ${updated}`);
  console.log(`Orders already ok : ${skipped}`);
  console.log(`Orders unmapped   : ${unmapped}`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
