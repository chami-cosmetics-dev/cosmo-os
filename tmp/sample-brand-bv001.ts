import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const COMPANY = "cmn2xcas1002crl5xtgoq28f5"

async function main() {
  const titleHits = await prisma.$queryRaw<
    Array<{
      order_name: string
      source_name: string
      sku: string | null
      product_title: string | null
      vendor_name: string | null
      product_item_id: string
    }>
  >`
    SELECT o.name AS order_name,
           o."sourceName" AS source_name,
           pi.sku,
           pi."productTitle" AS product_title,
           v.name AS vendor_name,
           pi.id AS product_item_id
    FROM "OrderLineItem" oli
    JOIN "Order" o ON o.id = oli."orderId"
    JOIN "ProductItem" pi ON pi.id = oli."productItemId"
    LEFT JOIN "Vendor" v ON v.id = pi."vendorId"
    WHERE o."companyId" = ${COMPANY}
      AND (
        pi.sku ILIKE '%BV001%'
        OR pi."productTitle" ILIKE '%Beauty Vault Lumi%'
      )
    ORDER BY o."createdAt" DESC
    LIMIT 30
  `

  const erpNoVendor = await prisma.$queryRaw<
    Array<{ total: bigint; with_vendor: bigint }>
  >`
    SELECT COUNT(*)::bigint AS total,
           COUNT(pi."vendorId")::bigint AS with_vendor
    FROM "OrderLineItem" oli
    JOIN "Order" o ON o.id = oli."orderId"
    JOIN "ProductItem" pi ON pi.id = oli."productItemId"
    WHERE o."companyId" = ${COMPANY}
      AND o."sourceName" IN ('erpnext', 'erpnext-pos')
  `

  const webVendor = await prisma.$queryRaw<
    Array<{ total: bigint; with_vendor: bigint }>
  >`
    SELECT COUNT(*)::bigint AS total,
           COUNT(pi."vendorId")::bigint AS with_vendor
    FROM "OrderLineItem" oli
    JOIN "Order" o ON o.id = oli."orderId"
    JOIN "ProductItem" pi ON pi.id = oli."productItemId"
    WHERE o."companyId" = ${COMPANY}
      AND o."sourceName" = 'web'
  `

  const emptyBrandSkus = await prisma.$queryRaw<
    Array<{ sku: string | null; n: bigint }>
  >`
    SELECT pi.sku, COUNT(*)::bigint AS n
    FROM "OrderLineItem" oli
    JOIN "Order" o ON o.id = oli."orderId"
    JOIN "ProductItem" pi ON pi.id = oli."productItemId"
    WHERE o."companyId" = ${COMPANY}
      AND o."sourceName" IN ('erpnext', 'erpnext-pos')
      AND pi."vendorId" IS NULL
    GROUP BY pi.sku
    ORDER BY n DESC
    LIMIT 20
  `

  // Check if SV200-1028 exists under any field
  const sv = await prisma.$queryRaw<Array<{ name: string; source: string }>>`
    SELECT name, "sourceName" AS source
    FROM "Order"
    WHERE "companyId" = ${COMPANY}
      AND (name ILIKE '%SV200-1028%' OR name ILIKE '%BV001%')
    LIMIT 10
  `

  console.log(
    JSON.stringify(
      {
        titleHits,
        erpNoVendor: erpNoVendor.map((row) => ({
          total: Number(row.total),
          with_vendor: Number(row.with_vendor),
        })),
        webVendor: webVendor.map((row) => ({
          total: Number(row.total),
          with_vendor: Number(row.with_vendor),
        })),
        emptyBrandSkus: emptyBrandSkus.map((row) => ({
          sku: row.sku,
          n: Number(row.n),
        })),
        sv,
      },
      null,
      2,
    ),
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
