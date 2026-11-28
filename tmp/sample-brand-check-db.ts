import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const orderCount = await prisma.order.count()
  const lineCount = await prisma.orderLineItem.count()
  const companies = await prisma.company.findMany({
    select: { id: true, name: true, _count: { select: { orders: true } } },
    take: 10,
  })
  const recent = await prisma.order.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
    select: { name: true, sourceName: true, companyId: true, createdAt: true },
  })
  const vendorLinked = await prisma.productItem.count({
    where: { vendorId: { not: null } },
  })
  const sampleSku = await prisma.orderLineItem.findMany({
    take: 5,
    orderBy: { id: "desc" },
    select: {
      productItem: { select: { sku: true, vendor: { select: { name: true } } } },
      order: { select: { name: true, sourceName: true } },
    },
  })

  console.log(
    JSON.stringify(
      { orderCount, lineCount, vendorLinked, companies, recent, sampleSku },
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
