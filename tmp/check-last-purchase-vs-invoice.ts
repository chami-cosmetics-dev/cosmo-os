import { config } from "dotenv"
import { PrismaClient } from "@prisma/client"

config({ path: ".env" })

const prisma = new PrismaClient()

const day = (col: string) =>
  `date_trunc('day', ${col} AT TIME ZONE 'Asia/Colombo')`

async function main() {
  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
    take: 10,
  })
  console.log("companies", JSON.stringify(companies, null, 2))

  const sync = await prisma.companyContactPurchaseSummarySync.findMany({
    select: {
      companyId: true,
      lastSyncedAt: true,
      contactCount: true,
      lastSyncError: true,
    },
  })
  console.log("purchaseSummarySync", JSON.stringify(sync, null, 2))

  const stampVsCache = await prisma.$queryRawUnsafe<
    Array<Record<string, number>>
  >(`
    SELECT
      COUNT(*)::int AS contacts,
      COUNT("lastPurchaseAt")::int AS with_last_purchase,
      COUNT("purchaseLastOrderAt")::int AS with_purchase_last_order,
      COUNT(*) FILTER (
        WHERE "lastPurchaseAt" IS NOT NULL AND "purchaseLastOrderAt" IS NULL
      )::int AS last_purchase_but_no_cache,
      COUNT(*) FILTER (
        WHERE "lastPurchaseAt" IS NULL AND "purchaseLastOrderAt" IS NOT NULL
      )::int AS cache_but_no_last_purchase,
      COUNT(*) FILTER (
        WHERE "lastPurchaseAt" IS NOT NULL
          AND "purchaseLastOrderAt" IS NOT NULL
          AND ${day('"lastPurchaseAt"')} <> ${day('"purchaseLastOrderAt"')}
      )::int AS day_mismatch_stamp_vs_cache
    FROM "ContactMaster"
  `)
  console.log("stampVsCache", JSON.stringify(stampVsCache, null, 2))

  // Adapt: contact lastPurchaseAt day vs max Adapt invoiceDate day
  const adaptMismatch = await prisma.$queryRawUnsafe<
    Array<Record<string, number | string>>
  >(`
    WITH adapt_last AS (
      SELECT
        "contactId",
        MAX("invoiceDate") AS max_invoice_at
      FROM "AdaptPurchaseHistory"
      WHERE COALESCE(lower(btrim("financialStatus")), '') NOT IN (
        'voided', 'void', 'refunded', 'refund'
      )
      GROUP BY "contactId"
    )
    SELECT
      COUNT(*)::int AS adapt_contacts,
      COUNT(*) FILTER (
        WHERE c."lastPurchaseAt" IS NULL
      )::int AS stamp_null_but_has_adapt,
      COUNT(*) FILTER (
        WHERE c."lastPurchaseAt" IS NOT NULL
          AND ${day('c."lastPurchaseAt"')} = ${day("a.max_invoice_at")}
      )::int AS stamp_day_matches_adapt_max,
      COUNT(*) FILTER (
        WHERE c."lastPurchaseAt" IS NOT NULL
          AND ${day('c."lastPurchaseAt"')} <> ${day("a.max_invoice_at")}
      )::int AS stamp_day_mismatches_adapt_max,
      COUNT(*) FILTER (
        WHERE c."lastPurchaseAt" IS NOT NULL
          AND c."lastPurchaseAt" > a.max_invoice_at
      )::int AS stamp_after_adapt_max,
      COUNT(*) FILTER (
        WHERE c."lastPurchaseAt" IS NOT NULL
          AND c."lastPurchaseAt" < a.max_invoice_at
      )::int AS stamp_before_adapt_max
    FROM adapt_last a
    JOIN "ContactMaster" c ON c.id = a."contactId"
  `)
  console.log("adaptVsStamp", JSON.stringify(adaptMismatch, null, 2))

  // Sample mismatches: stamp day != max(adapt invoice, cosmo completed createdAt)
  // Cosmo match by primary phone only for speed (good enough sample).
  const samples = await prisma.$queryRawUnsafe<
    Array<Record<string, unknown>>
  >(`
    WITH adapt_last AS (
      SELECT "contactId", MAX("invoiceDate") AS max_adapt_at
      FROM "AdaptPurchaseHistory"
      WHERE COALESCE(lower(btrim("financialStatus")), '') NOT IN (
        'voided', 'void', 'refunded', 'refund'
      )
      GROUP BY "contactId"
    ),
    cosmo_by_phone AS (
      SELECT
        btrim("customerPhone") AS phone,
        MAX("createdAt") AS max_cosmo_created_at,
        MAX(COALESCE("deliveryCompleteAt", "invoiceCompleteAt", "createdAt")) AS max_cosmo_purchase_at
      FROM "Order"
      WHERE "cancelledAt" IS NULL
        AND "financialStatus" <> 'voided'
        AND "fulfillmentStage"::text IN ('delivery_complete', 'invoice_complete')
        AND "customerPhone" IS NOT NULL
        AND btrim("customerPhone") <> ''
      GROUP BY btrim("customerPhone")
    ),
    joined AS (
      SELECT
        c.id,
        c.name,
        c."phoneNumber",
        c."lastPurchaseAt" AS stamp_at,
        c."purchaseLastOrderAt" AS cache_at,
        a.max_adapt_at,
        o.max_cosmo_created_at,
        o.max_cosmo_purchase_at,
        GREATEST(
          COALESCE(a.max_adapt_at, '-infinity'::timestamptz),
          COALESCE(o.max_cosmo_created_at, '-infinity'::timestamptz)
        ) AS max_invoice_created_at,
        GREATEST(
          COALESCE(a.max_adapt_at, '-infinity'::timestamptz),
          COALESCE(o.max_cosmo_purchase_at, '-infinity'::timestamptz)
        ) AS max_purchase_rule_at
      FROM "ContactMaster" c
      LEFT JOIN adapt_last a ON a."contactId" = c.id
      LEFT JOIN cosmo_by_phone o ON o.phone = btrim(c."phoneNumber")
      WHERE c."lastPurchaseAt" IS NOT NULL
        AND (a.max_adapt_at IS NOT NULL OR o.max_cosmo_created_at IS NOT NULL)
    )
    SELECT
      id,
      name,
      "phoneNumber" AS phone,
      stamp_at,
      cache_at,
      max_adapt_at,
      max_cosmo_created_at,
      max_cosmo_purchase_at,
      max_invoice_created_at,
      max_purchase_rule_at,
      (${day("stamp_at")} = ${day("max_invoice_created_at")}) AS stamp_matches_invoice_created_day,
      (${day("stamp_at")} = ${day("max_purchase_rule_at")}) AS stamp_matches_purchase_rule_day,
      (${day("stamp_at")} = ${day("cache_at")}) AS stamp_matches_cache_day
    FROM joined
    WHERE ${day("stamp_at")} <> ${day("max_invoice_created_at")}
       OR ${day("stamp_at")} IS DISTINCT FROM ${day("cache_at")}
    ORDER BY stamp_at DESC NULLS LAST
    LIMIT 25
  `)
  console.log("mismatchSamples", JSON.stringify(samples, null, 2))

  const summary = await prisma.$queryRawUnsafe<
    Array<Record<string, number>>
  >(`
    WITH adapt_last AS (
      SELECT "contactId", MAX("invoiceDate") AS max_adapt_at
      FROM "AdaptPurchaseHistory"
      WHERE COALESCE(lower(btrim("financialStatus")), '') NOT IN (
        'voided', 'void', 'refunded', 'refund'
      )
      GROUP BY "contactId"
    ),
    cosmo_by_phone AS (
      SELECT
        btrim("customerPhone") AS phone,
        MAX("createdAt") AS max_cosmo_created_at
      FROM "Order"
      WHERE "cancelledAt" IS NULL
        AND "financialStatus" <> 'voided'
        AND "fulfillmentStage"::text IN ('delivery_complete', 'invoice_complete')
        AND "customerPhone" IS NOT NULL
        AND btrim("customerPhone") <> ''
      GROUP BY btrim("customerPhone")
    ),
    joined AS (
      SELECT
        c."lastPurchaseAt" AS stamp_at,
        GREATEST(
          COALESCE(a.max_adapt_at, '-infinity'::timestamptz),
          COALESCE(o.max_cosmo_created_at, '-infinity'::timestamptz)
        ) AS max_invoice_created_at
      FROM "ContactMaster" c
      LEFT JOIN adapt_last a ON a."contactId" = c.id
      LEFT JOIN cosmo_by_phone o ON o.phone = btrim(c."phoneNumber")
      WHERE c."lastPurchaseAt" IS NOT NULL
        AND (a.max_adapt_at IS NOT NULL OR o.max_cosmo_created_at IS NOT NULL)
    )
    SELECT
      COUNT(*)::int AS comparable,
      COUNT(*) FILTER (
        WHERE ${day("stamp_at")} = ${day("max_invoice_created_at")}
      )::int AS day_match,
      COUNT(*) FILTER (
        WHERE ${day("stamp_at")} <> ${day("max_invoice_created_at")}
      )::int AS day_mismatch,
      COUNT(*) FILTER (
        WHERE stamp_at > max_invoice_created_at
      )::int AS stamp_newer,
      COUNT(*) FILTER (
        WHERE stamp_at < max_invoice_created_at
      )::int AS stamp_older
    FROM joined
  `)
  console.log("stampVsMaxInvoiceCreated", JSON.stringify(summary, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
