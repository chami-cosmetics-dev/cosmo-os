// Backfill merchant coupon codes from ERPNext for existing ERP orders
// Usage: node scripts/backfill-merchant-coupon.mjs [--dry-run] [--limit=100] [--order=SV200-0016]

import { PrismaClient } from "@prisma/client";

// Neon pooler URLs are unreachable from local machine — use the direct connection URL
// by stripping "-pooler" from the hostname if present.
const rawUrl = process.env.DATABASE_URL ?? "";
const directUrl = rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2");
const prisma = new PrismaClient({
  datasources: { db: { url: directUrl } },
});

const isDryRun = process.argv.includes("--dry-run");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const orderArg = process.argv.find((a) => a.startsWith("--order="));
const TARGET_ORDER = orderArg ? orderArg.split("=")[1].trim() : null;
const BATCH_LIMIT = limitArg ? parseInt(limitArg.split("=")[1]) : 200;

const ERP_BASE_URL = (process.env.ERPNEXT_BASE_URL ?? "").trim().replace(/\/$/, "");
const ERP_API_KEY = process.env.ERPNEXT_API_KEY ?? "";
const ERP_API_SECRET = process.env.ERPNEXT_API_SECRET ?? "";

async function fetchMerchantCoupon(baseUrl, apiKey, apiSecret, invoiceName) {
  try {
    const fields = encodeURIComponent(JSON.stringify(["custom_merchant_coupon_code"]));
    const res = await fetch(
      `${baseUrl}/api/resource/Sales Invoice/${encodeURIComponent(invoiceName)}?fields=${fields}`,
      { headers: { Authorization: `token ${apiKey}:${apiSecret}` } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data?.custom_merchant_coupon_code?.trim() || null;
  } catch {
    return null;
  }
}

async function main() {
  console.log(`\n=== Backfill Merchant Coupon Codes from ERPNext ===`);
  console.log(`ERP base URL : ${ERP_BASE_URL}`);
  console.log(`Dry run      : ${isDryRun}`);
  console.log(`Batch limit  : ${BATCH_LIMIT}\n`);

  if (!ERP_BASE_URL || !ERP_API_KEY || !ERP_API_SECRET) {
    console.error("Missing ERP credentials. Set ERPNEXT_BASE_URL, ERPNEXT_API_KEY, ERPNEXT_API_SECRET.");
    process.exit(1);
  }

  // Find ERP orders with no coupon stored:
  //   - discountCodes IS NULL
  //   - discountCodes = '[]' (empty array — webhook ran before coupon was added)
  // Optionally target a single order by name with --order=SV200-0016
  const orders = TARGET_ORDER
    ? await prisma.$queryRaw`
        SELECT id, name, "erpnextInvoiceId", "companyLocationId"
        FROM "Order"
        WHERE "sourceName" IN ('erpnext', 'erpnext-pos')
          AND name = ${TARGET_ORDER}
        LIMIT 1
      `
    : await prisma.$queryRaw`
        SELECT id, name, "erpnextInvoiceId", "companyLocationId"
        FROM "Order"
        WHERE "sourceName" IN ('erpnext', 'erpnext-pos')
          AND name IS NOT NULL
          AND (
            "discountCodes" IS NULL
            OR "discountCodes" = '[]'::jsonb
          )
        ORDER BY "createdAt" DESC
        LIMIT ${BATCH_LIMIT}
      `;

  console.log(`Found ${orders.length} ERP orders with no merchant coupon stored.\n`);

  // Load per-location ERP credentials from DB
  const locationIds = [...new Set(orders.map((o) => o.companyLocationId))];
  const locations = await prisma.companyLocation.findMany({
    where: { id: { in: locationIds } },
    select: { id: true, erpnextInstance: { select: { baseUrl: true, apiKey: true, apiSecret: true } } },
  });
  const locationMap = new Map(locations.map((l) => [l.id, l]));

  const baseUrlEnv = (process.env.ERPNEXT_BASE_URL ?? "").trim().replace(/\/$/, "");
  const apiKeyEnv = process.env.ERPNEXT_API_KEY ?? "";
  const apiSecretEnv = process.env.ERPNEXT_API_SECRET ?? "";

  let updated = 0, noCoupon = 0, errors = 0;

  for (const order of orders) {
    const invoiceId = order.erpnextInvoiceId ?? order.name;
    if (!invoiceId) { noCoupon++; continue; }

    const instance = locationMap.get(order.companyLocationId)?.erpnextInstance ?? null;
    const baseUrl = (instance?.baseUrl ?? baseUrlEnv).replace(/\/$/, "");
    const apiKey = instance?.apiKey ?? apiKeyEnv;
    const apiSecret = instance?.apiSecret ?? apiSecretEnv;

    process.stdout.write(`  ${order.name ?? invoiceId} [${baseUrl.replace("https://", "")}] ... `);

    const coupon = await fetchMerchantCoupon(baseUrl, apiKey, apiSecret, invoiceId);

    if (!coupon) {
      console.log("no coupon");
      noCoupon++;
      continue;
    }

    if (isDryRun) {
      console.log(`[dry-run] would set → ${coupon}`);
      updated++;
      continue;
    }

    try {
      await prisma.order.update({
        where: { id: order.id },
        data: { discountCodes: [{ code: coupon }] },
      });
      console.log(`✓ ${coupon}`);
      updated++;
    } catch (err) {
      console.log(`error: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`Updated  : ${updated}`);
  console.log(`No coupon: ${noCoupon}`);
  console.log(`Errors   : ${errors}`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
