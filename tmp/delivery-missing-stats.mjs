import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const company = await prisma.company.findFirst({
    where: { name: { contains: "Cosmetic", mode: "insensitive" } },
    select: { id: true },
  })

  const rows = await prisma.$queryRaw`
    SELECT o."fulfillmentStage"::text AS stage,
           o."sourceName" AS source,
           COUNT(*)::int AS orders,
           COUNT(*) FILTER (WHERE o."deliveryCompleteAt" IS NULL)::int AS no_delivery,
           COUNT(*) FILTER (WHERE o."invoiceCompleteAt" IS NULL)::int AS no_invoice,
           COUNT(*) FILTER (
             WHERE o."deliveryCompleteAt" IS NULL AND o."invoiceCompleteAt" IS NOT NULL
           )::int AS invoice_only
    FROM "Order" o
    WHERE o."companyId" = ${company.id}
      AND o."cancelledAt" IS NULL
      AND o."fulfillmentStage"::text IN ('delivery_complete', 'invoice_complete')
      AND (
        o."deliveryCompleteAt" >= TIMESTAMPTZ '2026-04-01+05:30'
        OR o."invoiceCompleteAt" >= TIMESTAMPTZ '2026-04-01+05:30'
      )
    GROUP BY 1, 2
    ORDER BY 1, 3 DESC
  `
  console.log(JSON.stringify(rows, null, 2))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
