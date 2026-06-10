// Backfill assignedMerchantId for ERP orders that have a coupon code in discountCodes
// but no merchant assigned. Matches coupon code case-insensitively against merchant
// couponCodes, same logic as resolveAssignedMerchant for Shopify web orders.
//
// Usage: node scripts/backfill-merchant-assignment-from-coupon.mjs [--dry-run]

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const isDryRun = process.argv.includes("--dry-run");

async function main() {
  console.log(`\n=== Backfill Merchant Assignment from Coupon Codes ===`);
  console.log(`Dry run: ${isDryRun}\n`);

  // Find all ERP non-POS orders with a coupon code but no merchant assigned
  const orders = await prisma.$queryRaw`
    SELECT o.id, o.name, o."companyId",
           o."discountCodes"->0->>'code' AS coupon_code
    FROM "Order" o
    WHERE o."sourceName" = 'erpnext'
      AND o."discountCodes" IS NOT NULL
      AND o."discountCodes" != '[]'::jsonb
      AND o."assignedMerchantId" IS NULL
    ORDER BY o."createdAt" DESC
  `;

  console.log(`Found ${orders.length} ERP orders with coupon but no merchant.\n`);

  // Load all eligible merchants per company (Digital/Sales Marketing department)
  const companyIds = [...new Set(orders.map((o) => o.companyId))];
  const merchantsByCompany = new Map();
  for (const companyId of companyIds) {
    const merchants = await prisma.user.findMany({
      where: {
        companyId,
        employeeProfile: {
          is: {
            department: {
              is: {
                OR: [
                  { name: { contains: "Digital Marketing", mode: "insensitive" } },
                  {
                    AND: [
                      { name: { contains: "Sales", mode: "insensitive" } },
                      { name: { contains: "Marketing", mode: "insensitive" } },
                    ],
                  },
                  {
                    AND: [
                      { name: { contains: "Salse", mode: "insensitive" } },
                      { name: { contains: "Marketing", mode: "insensitive" } },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
      select: { id: true, name: true, email: true, couponCodes: true },
    });
    merchantsByCompany.set(companyId, merchants);
  }

  let matched = 0, noMatch = 0, skipped = 0, errors = 0;

  for (const order of orders) {
    const coupon = order.coupon_code?.trim();
    if (!coupon) { skipped++; continue; }

    const couponLower = coupon.toLowerCase();
    const merchants = merchantsByCompany.get(order.companyId) ?? [];
    const merchant = merchants.find((m) =>
      m.couponCodes.some((c) => c.toLowerCase().trim() === couponLower)
    );

    const label = `${order.name ?? order.id} [${coupon}]`;

    if (!merchant) {
      console.log(`  ${label} → no merchant match`);
      noMatch++;
      continue;
    }

    const merchantDisplay = merchant.name ?? merchant.email ?? merchant.id;

    if (isDryRun) {
      console.log(`  ${label} → [dry-run] would assign ${merchantDisplay}`);
      matched++;
      continue;
    }

    try {
      await prisma.order.update({
        where: { id: order.id },
        data: { assignedMerchantId: merchant.id },
      });
      console.log(`  ${label} → ✓ ${merchantDisplay}`);
      matched++;
    } catch (err) {
      console.log(`  ${label} → error: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`Matched & updated : ${matched}`);
  console.log(`No merchant match : ${noMatch}`);
  console.log(`Skipped (no code) : ${skipped}`);
  console.log(`Errors            : ${errors}`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
