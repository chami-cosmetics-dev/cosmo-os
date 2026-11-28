import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const sku = "ALT02_1"
const month = "2026-10"

async function main() {
  const company = await prisma.company.findFirst({
    where: { name: { contains: "Cosmetic", mode: "insensitive" } },
    select: { id: true, name: true },
  })
  if (!company) throw new Error("no company")

  const osfLines = await prisma.$queryRaw`
    SELECT o.name AS invoice,
           o."shopifyOrderId" AS shopify_id,
           o."fulfillmentStage"::text AS stage,
           o."financialStatus" AS pay,
           o."cancelledAt" AS cancelled,
           li.quantity AS qty,
           to_char(timezone('Asia/Colombo', o."createdAt"), 'YYYY-MM-DD') AS create_day,
           to_char(timezone('Asia/Colombo', o."createdAt"), 'YYYY-MM') AS create_month,
           to_char(timezone('Asia/Colombo', o."deliveryCompleteAt"), 'YYYY-MM-DD') AS delivery_day,
           to_char(timezone('Asia/Colombo', o."invoiceCompleteAt"), 'YYYY-MM-DD') AS invoice_complete_day,
           to_char(
             timezone('Asia/Colombo', COALESCE(o."deliveryCompleteAt", o."invoiceCompleteAt")),
             'YYYY-MM'
           ) AS osf_month
    FROM "OrderLineItem" li
    JOIN "Order" o ON o.id = li."orderId"
    JOIN "ProductItem" pi ON pi.id = li."productItemId"
    WHERE o."companyId" = ${company.id}
      AND btrim(pi.sku) = ${sku}
      AND o."cancelledAt" IS NULL
      AND o."fulfillmentStage"::text IN ('delivery_complete', 'invoice_complete')
      AND to_char(
            timezone('Asia/Colombo', COALESCE(o."deliveryCompleteAt", o."invoiceCompleteAt")),
            'YYYY-MM'
          ) = ${month}
    ORDER BY COALESCE(o."deliveryCompleteAt", o."invoiceCompleteAt")
  `

  const dumpCreateLines = await prisma.$queryRaw`
    SELECT o.name AS invoice,
           o."fulfillmentStage"::text AS stage,
           o."financialStatus" AS pay,
           o."cancelledAt" AS cancelled,
           li.quantity AS qty,
           to_char(timezone('Asia/Colombo', o."createdAt"), 'YYYY-MM-DD') AS create_day,
           to_char(timezone('Asia/Colombo', o."createdAt"), 'YYYY-MM') AS create_month,
           to_char(timezone('Asia/Colombo', o."deliveryCompleteAt"), 'YYYY-MM-DD') AS delivery_day,
           to_char(timezone('Asia/Colombo', o."invoiceCompleteAt"), 'YYYY-MM-DD') AS invoice_complete_day,
           to_char(
             timezone('Asia/Colombo', COALESCE(o."deliveryCompleteAt", o."invoiceCompleteAt")),
             'YYYY-MM'
           ) AS osf_month
    FROM "OrderLineItem" li
    JOIN "Order" o ON o.id = li."orderId"
    JOIN "ProductItem" pi ON pi.id = li."productItemId"
    WHERE o."companyId" = ${company.id}
      AND btrim(pi.sku) = ${sku}
      AND to_char(timezone('Asia/Colombo', o."createdAt"), 'YYYY-MM') = ${month}
    ORDER BY o."createdAt"
  `

  const sum = (rows) => rows.reduce((a, r) => a + Number(r.qty), 0)
  const osfQty = sum(osfLines)
  const dumpQty = sum(dumpCreateLines)
  const onlyInOsf = osfLines.filter((r) => r.create_month !== month)
  const onlyInDump = dumpCreateLines.filter(
    (r) => r.osf_month !== month || r.cancelled != null || !["delivery_complete", "invoice_complete"].includes(r.stage),
  )

  console.log(JSON.stringify({
    company: company.name,
    sku,
    month,
    osf_oct_qty: osfQty,
    dump3_invoice_date_oct_qty: dumpQty,
    osf_line_count: osfLines.length,
    dump_line_count: dumpCreateLines.length,
    qty_only_in_osf: sum(onlyInOsf),
    only_in_osf_orders: onlyInOsf,
    qty_in_dump_not_osf_oct: sum(onlyInDump),
    dump_not_osf_oct: onlyInDump,
  }, null, 2))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
