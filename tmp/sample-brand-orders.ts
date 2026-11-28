import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const COMPANY = "cmn2xcas1002crl5xtgoq28f5"

async function main() {
  const names = [
    "SV200-1028",
    "SV100-2346",
    "SV1009807",
    "SV1009800",
    "NW004-1",
  ]
  const orders = await prisma.order.findMany({
    where: {
      companyId: COMPANY,
      OR: [
        { name: { in: names } },
        { name: { contains: "SV100-2346" } },
        { name: { contains: "SV200-1028" } },
      ],
    },
    select: { id: true, name: true, sourceName: true, createdAt: true },
  })

  const like = await prisma.$queryRaw<Array<{ name: string; source: string; created: Date }>>`
    SELECT name, "sourceName" AS source, "createdAt" AS created
    FROM "Order"
    WHERE "companyId" = ${COMPANY}
      AND name LIKE 'SV200-%'
    ORDER BY "createdAt" DESC
    LIMIT 10
  `

  const hyphenSkuLines = await prisma.$queryRaw<
    Array<{ sku: string; n: number; with_vendor: number }>
  >`
    SELECT pi.sku,
           COUNT(*)::int AS n,
           COUNT(pi."vendorId")::int AS with_vendor
    FROM "OrderLineItem" oli
    JOIN "Order" o ON o.id = oli."orderId"
    JOIN "ProductItem" pi ON pi.id = oli."productItemId"
    WHERE o."companyId" = ${COMPANY}
      AND pi.sku LIKE '%-%'
    GROUP BY pi.sku
    ORDER BY n DESC
    LIMIT 15
  `

  const nowSku = await prisma.productItem.findMany({
    where: {
      companyId: COMPANY,
      OR: [{ sku: { contains: "NW004" } }, { sku: { contains: "NC008" } }],
    },
    select: {
      sku: true,
      productTitle: true,
      vendor: { select: { name: true } },
      _count: { select: { orderLineItems: true } },
    },
  })

  console.log(JSON.stringify({ orders, like, hyphenSkuLines, nowSku }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
