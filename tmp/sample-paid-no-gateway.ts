import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const companyId = "cmn2xcas1002crl5xtgoq28f5"

async function main() {
  const paidNoGateway = await prisma.order.findMany({
    where: {
      companyId,
      financialStatus: { equals: "paid", mode: "insensitive" },
      AND: [
        { OR: [{ paymentGatewayPrimary: null }, { paymentGatewayPrimary: "" }] },
        { paymentGatewayNames: { isEmpty: true } },
      ],
    },
    take: 15,
    orderBy: { createdAt: "desc" },
    select: {
      name: true,
      sourceName: true,
      financialStatus: true,
      paymentGatewayPrimary: true,
      paymentGatewayNames: true,
      erpnextInvoiceId: true,
      createdAt: true,
    },
  })
  const count = await prisma.order.count({
    where: {
      companyId,
      financialStatus: { equals: "paid", mode: "insensitive" },
      AND: [
        { OR: [{ paymentGatewayPrimary: null }, { paymentGatewayPrimary: "" }] },
        { paymentGatewayNames: { isEmpty: true } },
      ],
    },
  })

  const adaptBlankish = await prisma.$queryRaw<
    Array<{ payment_method: string | null; n: number }>
  >`
    SELECT "paymentMethod" as payment_method, COUNT(*)::int as n
    FROM "AdaptPurchaseHistory"
    WHERE "companyId" = ${companyId}
      AND (
        "paymentMethod" IS NULL
        OR BTRIM("paymentMethod") = ''
        OR LOWER(BTRIM("paymentMethod")) IN ('null', 'none', 'n/a', '-')
      )
    GROUP BY 1
    ORDER BY n DESC
    LIMIT 20
  `

  const adaptMethods = await prisma.$queryRaw<
    Array<{ payment_method: string | null; n: number }>
  >`
    SELECT "paymentMethod" as payment_method, COUNT(*)::int as n
    FROM "AdaptPurchaseHistory"
    WHERE "companyId" = ${companyId}
    GROUP BY 1
    ORDER BY n DESC
    LIMIT 25
  `

  console.log(JSON.stringify({ count, paidNoGateway, adaptBlankish, adaptMethods }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
