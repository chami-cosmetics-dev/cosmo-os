import { Prisma, PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const month = process.argv[2] || "2026-10"
const skuFilter = process.argv[3] || null

async function main() {
  const companies = await prisma.company.findMany({ select: { id: true, name: true }, take: 20 })
  console.log("companies", companies)

  const company =
    companies.find((c) => /cosmetic/i.test(c.name || "")) ||
    companies[0]
  if (!company) throw new Error("no company")
  console.log("using", company)

  const skuClause = skuFilter
    ? Prisma.sql`AND btrim(pi.sku) = ${skuFilter}`
    : Prisma.empty

  const osfRows = await prisma.$queryRaw`
    SELECT btrim(pi.sku) AS sku,
           SUM(li.quantity)::int AS osf_qty,
           COUNT(DISTINCT o.id)::int AS osf_orders
    FROM "OrderLineItem" li
    JOIN "Order" o ON o.id = li."orderId"
    JOIN "ProductItem" pi ON pi.id = li."productItemId"
    WHERE o."companyId" = ${company.id}
      AND o."cancelledAt" IS NULL
      AND o."fulfillmentStage"::text IN ('delivery_complete', 'invoice_complete')
      AND to_char(
            timezone('Asia/Colombo', COALESCE(o."deliveryCompleteAt", o."invoiceCompleteAt")),
            'YYYY-MM'
          ) = ${month}
      AND pi.sku IS NOT NULL AND btrim(pi.sku) <> ''
      ${skuClause}
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 30
  `

  const dumpRows = await prisma.$queryRaw`
    SELECT btrim(pi.sku) AS sku,
           SUM(li.quantity)::int AS dump_create_qty,
           COUNT(DISTINCT o.id)::int AS dump_orders
    FROM "OrderLineItem" li
    JOIN "Order" o ON o.id = li."orderId"
    JOIN "ProductItem" pi ON pi.id = li."productItemId"
    WHERE o."companyId" = ${company.id}
      AND to_char(timezone('Asia/Colombo', o."createdAt"), 'YYYY-MM') = ${month}
      AND pi.sku IS NOT NULL AND btrim(pi.sku) <> ''
      ${skuClause}
    GROUP BY 1
  `

  const dumpBySku = new Map(dumpRows.map((r) => [r.sku, r]))
  const mismatches = []
  for (const row of osfRows) {
    const d = dumpBySku.get(row.sku)
    const dumpQty = d ? Number(d.dump_create_qty) : 0
    const osfQty = Number(row.osf_qty)
    if (dumpQty !== osfQty) {
      mismatches.push({
        sku: row.sku,
        osf_qty: osfQty,
        dump_create_month_qty: dumpQty,
        delta: osfQty - dumpQty,
      })
    }
  }

  console.log("\nOSF top SKUs for", month, "sample", osfRows.slice(0, 5))
  console.log("\nmismatch count in OSF top 30:", mismatches.length)
  console.log(mismatches.slice(0, 15))

  const movedIn = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT o.id)::int AS orders,
           COALESCE(SUM(li.quantity),0)::int AS qty
    FROM "OrderLineItem" li
    JOIN "Order" o ON o.id = li."orderId"
    WHERE o."companyId" = ${company.id}
      AND o."cancelledAt" IS NULL
      AND o."fulfillmentStage"::text IN ('delivery_complete', 'invoice_complete')
      AND to_char(
            timezone('Asia/Colombo', COALESCE(o."deliveryCompleteAt", o."invoiceCompleteAt")),
            'YYYY-MM'
          ) = ${month}
      AND to_char(timezone('Asia/Colombo', o."createdAt"), 'YYYY-MM') <> ${month}
  `

  const movedOut = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT o.id)::int AS orders,
           COALESCE(SUM(li.quantity),0)::int AS qty
    FROM "OrderLineItem" li
    JOIN "Order" o ON o.id = li."orderId"
    WHERE o."companyId" = ${company.id}
      AND o."cancelledAt" IS NULL
      AND o."fulfillmentStage"::text IN ('delivery_complete', 'invoice_complete')
      AND to_char(timezone('Asia/Colombo', o."createdAt"), 'YYYY-MM') = ${month}
      AND (
        (o."deliveryCompleteAt" IS NULL AND o."invoiceCompleteAt" IS NULL)
        OR to_char(
             timezone('Asia/Colombo', COALESCE(o."deliveryCompleteAt", o."invoiceCompleteAt")),
             'YYYY-MM'
           ) <> ${month}
      )
  `

  // Even if Dump3 filters Completed only and uses delivery_completed_date when present
  const dumpDeliveryMonth = await prisma.$queryRaw`
    SELECT COALESCE(SUM(li.quantity),0)::int AS qty
    FROM "OrderLineItem" li
    JOIN "Order" o ON o.id = li."orderId"
    WHERE o."companyId" = ${company.id}
      AND o."fulfillmentStage"::text IN ('delivery_complete', 'invoice_complete')
      AND o."deliveryCompleteAt" IS NOT NULL
      AND to_char(timezone('Asia/Colombo', o."deliveryCompleteAt"), 'YYYY-MM') = ${month}
  `

  const osfTotal = await prisma.$queryRaw`
    SELECT COALESCE(SUM(li.quantity),0)::int AS qty
    FROM "OrderLineItem" li
    JOIN "Order" o ON o.id = li."orderId"
    WHERE o."companyId" = ${company.id}
      AND o."cancelledAt" IS NULL
      AND o."fulfillmentStage"::text IN ('delivery_complete', 'invoice_complete')
      AND to_char(
            timezone('Asia/Colombo', COALESCE(o."deliveryCompleteAt", o."invoiceCompleteAt")),
            'YYYY-MM'
          ) = ${month}
  `

  const dumpAllCreateTotal = await prisma.$queryRaw`
    SELECT COALESCE(SUM(li.quantity),0)::int AS qty
    FROM "OrderLineItem" li
    JOIN "Order" o ON o.id = li."orderId"
    WHERE o."companyId" = ${company.id}
      AND to_char(timezone('Asia/Colombo', o."createdAt"), 'YYYY-MM') = ${month}
  `

  console.log("\n--- company totals for", month, "---")
  console.log("OSF month total qty (complete date):", osfTotal[0])
  console.log("Dump3 all-status create-month total:", dumpAllCreateTotal[0])
  console.log("Dump3 delivery_completed_date month only:", dumpDeliveryMonth[0])
  console.log("completed in month but created other month:", movedIn[0])
  console.log("created in month but completed other/null:", movedOut[0])
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
