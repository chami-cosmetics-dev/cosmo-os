// Backfill merchant coupon codes from ERPNext for existing ERP orders
// Usage: node scripts/backfill-merchant-coupon.mjs [--dry-run] [--limit=100] [--order=SV200-0016]
//        node scripts/backfill-merchant-coupon.mjs --instance=ERP_1-Main [--dry-run]
//
// --instance=<label>  Filter to orders from a specific ERP instance (checks ALL missing-MER orders,
//                     including those with discount codes that have no MER-prefixed entry).
// --include-partial   Without --instance: also cover orders that have codes but no MER entry.
// --dry-run           Report what would be updated without writing to DB.

import { PrismaClient } from "@prisma/client";

// Neon pooler URLs are unreachable from local machine — use the direct connection URL
// by stripping "-pooler" from the hostname if present.
const rawUrl = process.env.DATABASE_URL ?? "";
const directUrl = rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2");
const prisma = new PrismaClient({
  datasources: { db: { url: directUrl } },
});

const isDryRun = process.argv.includes("--dry-run");
const instanceArg = process.argv.find((a) => a.startsWith("--instance="));
const INSTANCE_LABEL = instanceArg?.split("=").slice(1).join("=").trim() ?? null;
// When --instance is used, always do the broader check. --include-partial extends it to all instances.
const includePartial = !!INSTANCE_LABEL || process.argv.includes("--include-partial");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const orderArg = process.argv.find((a) => a.startsWith("--order="));
const ordersArg = process.argv.find((a) => a.startsWith("--orders="));
const TARGET_ORDERS = ordersArg
  ? ordersArg.split("=").slice(1).join("=").split(",").map((s) => s.trim()).filter(Boolean)
  : orderArg
  ? [orderArg.split("=")[1].trim()]
  : null;
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

/** Returns true if discountCodes JSON has at least one MER-prefixed code. */
function hasMerCode(discountCodesJson) {
  if (!discountCodesJson) return false;
  let codes;
  try {
    codes = typeof discountCodesJson === "string" ? JSON.parse(discountCodesJson) : discountCodesJson;
  } catch {
    return false;
  }
  if (!Array.isArray(codes) || codes.length === 0) return false;
  return codes.some((row) => {
    const code = typeof row?.code === "string" ? row.code.trim() : "";
    return code.toUpperCase().startsWith("MER");
  });
}

async function main() {
  console.log(`\n=== Backfill Merchant Coupon Codes from ERPNext ===`);
  console.log(`ERP base URL : ${ERP_BASE_URL || "(from DB per-location)"}`);
  console.log(`Instance     : ${INSTANCE_LABEL ?? "(all)"}`);
  console.log(`Dry run      : ${isDryRun}`);
  console.log(`Include partial: ${includePartial}`);
  console.log(`Batch limit  : ${BATCH_LIMIT}\n`);

  // Resolve the ERP instance filter to a list of location IDs
  let instanceLocationIds = null;
  if (INSTANCE_LABEL) {
    const instance = await prisma.erpnextInstance.findFirst({
      where: { label: INSTANCE_LABEL },
      select: { id: true, label: true, baseUrl: true, apiKey: true, apiSecret: true },
    });
    if (!instance) {
      console.error(`ERP instance "${INSTANCE_LABEL}" not found in database.`);
      const all = await prisma.erpnextInstance.findMany({ select: { label: true } });
      console.error(`Available instances: ${all.map((i) => i.label).join(", ")}`);
      process.exit(1);
    }
    console.log(`Filtering to instance: ${instance.label} (${instance.baseUrl})\n`);
    const locs = await prisma.companyLocation.findMany({
      where: { erpnextInstanceId: instance.id },
      select: { id: true },
    });
    instanceLocationIds = locs.map((l) => l.id);
    if (instanceLocationIds.length === 0) {
      console.error(`No locations are linked to instance "${INSTANCE_LABEL}".`);
      process.exit(1);
    }
    console.log(`Locations linked to this instance: ${instanceLocationIds.length}\n`);
  }

  // Build the WHERE clause for missing-MER orders.
  // includePartial: also cover orders that have discount codes but no MER-prefixed entry.
  let orders;
  if (TARGET_ORDERS) {
    if (instanceLocationIds) {
      orders = await prisma.$queryRaw`
        SELECT id, name, "erpnextInvoiceId", "companyLocationId", "discountCodes"
        FROM "Order"
        WHERE "sourceName" IN ('erpnext', 'erpnext-pos')
          AND name = ANY(${TARGET_ORDERS})
          AND "companyLocationId" = ANY(${instanceLocationIds})
      `;
    } else {
      orders = await prisma.$queryRaw`
        SELECT id, name, "erpnextInvoiceId", "companyLocationId", "discountCodes"
        FROM "Order"
        WHERE "sourceName" IN ('erpnext', 'erpnext-pos')
          AND name = ANY(${TARGET_ORDERS})
      `;
    }
  } else if (includePartial && instanceLocationIds) {
    orders = await prisma.$queryRaw`
      SELECT id, name, "erpnextInvoiceId", "companyLocationId", "discountCodes"
      FROM "Order"
      WHERE "sourceName" IN ('erpnext', 'erpnext-pos')
        AND name IS NOT NULL
        AND "companyLocationId" = ANY(${instanceLocationIds})
        AND (
          "discountCodes" IS NULL
          OR "discountCodes" = '[]'::jsonb
          OR NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements("discountCodes") AS elem
            WHERE upper(elem->>'code') LIKE 'MER%'
          )
        )
      ORDER BY "createdAt" DESC
      LIMIT ${BATCH_LIMIT}
    `;
  } else if (includePartial) {
    orders = await prisma.$queryRaw`
      SELECT id, name, "erpnextInvoiceId", "companyLocationId", "discountCodes"
      FROM "Order"
      WHERE "sourceName" IN ('erpnext', 'erpnext-pos')
        AND name IS NOT NULL
        AND (
          "discountCodes" IS NULL
          OR "discountCodes" = '[]'::jsonb
          OR NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements("discountCodes") AS elem
            WHERE upper(elem->>'code') LIKE 'MER%'
          )
        )
      ORDER BY "createdAt" DESC
      LIMIT ${BATCH_LIMIT}
    `;
  } else if (instanceLocationIds) {
    orders = await prisma.$queryRaw`
      SELECT id, name, "erpnextInvoiceId", "companyLocationId", "discountCodes"
      FROM "Order"
      WHERE "sourceName" IN ('erpnext', 'erpnext-pos')
        AND name IS NOT NULL
        AND "companyLocationId" = ANY(${instanceLocationIds})
        AND (
          "discountCodes" IS NULL
          OR "discountCodes" = '[]'::jsonb
        )
      ORDER BY "createdAt" DESC
      LIMIT ${BATCH_LIMIT}
    `;
  } else {
    orders = await prisma.$queryRaw`
      SELECT id, name, "erpnextInvoiceId", "companyLocationId", "discountCodes"
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
  }

  if (TARGET_ORDERS) console.log(`Targeting orders: ${TARGET_ORDERS.join(", ")}`);
  console.log(`Found ${orders.length} ERP orders to process.\n`);

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

    const existingCodes = order.discountCodes;
    const existing = !existingCodes || existingCodes === "[]" ? "none" : "has codes, no MER";

    process.stdout.write(`  ${order.name ?? invoiceId} [${baseUrl.replace("https://", "")}] (existing: ${existing}) ... `);

    const coupon = await fetchMerchantCoupon(baseUrl, apiKey, apiSecret, invoiceId);

    if (!coupon) {
      console.log("no coupon in ERP");
      noCoupon++;
      continue;
    }

    if (!coupon.toUpperCase().startsWith("MER")) {
      console.log(`skipped (not MER: ${coupon})`);
      noCoupon++;
      continue;
    }

    if (isDryRun) {
      console.log(`[dry-run] would set → ${coupon}`);
      updated++;
      continue;
    }

    try {
      // Preserve any existing non-MER codes (e.g. discount codes like SV20) and prepend the MER code
      let existingParsed = [];
      if (existingCodes && existingCodes !== "[]") {
        try {
          existingParsed = typeof existingCodes === "string" ? JSON.parse(existingCodes) : existingCodes;
          if (!Array.isArray(existingParsed)) existingParsed = [];
          // Remove any stale MER entries before re-adding the authoritative one
          existingParsed = existingParsed.filter(
            (r) => typeof r?.code !== "string" || !r.code.toUpperCase().startsWith("MER")
          );
        } catch {
          existingParsed = [];
        }
      }
      const newCodes = [{ code: coupon }, ...existingParsed];

      await prisma.order.update({
        where: { id: order.id },
        data: { discountCodes: newCodes },
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
