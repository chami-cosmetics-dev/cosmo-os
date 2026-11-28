import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const COMPANY = "cmn2xcas1002crl5xtgoq28f5"

async function main() {
  const pe = await prisma.orderPaymentEntry.findMany({
    where: {
      OR: [
        { name: { contains: "REC600-000546" } },
        { name: { contains: "600-001472" } },
        { referenceName: { contains: "600-001472" } },
      ],
    },
    take: 20,
    select: {
      id: true,
      name: true,
      modeOfPayment: true,
      orderId: true,
      referenceName: true,
      amount: true,
    },
  })

  // schema discovery via a sample
  const sample = await prisma.orderPaymentEntry.findFirst({
    where: { modeOfPayment: { not: null } },
    select: {
      id: true,
      name: true,
      modeOfPayment: true,
      orderId: true,
      amount: true,
      companyId: true,
    },
  })

  const emptyPaidNoPe = await prisma.order.count({
    where: {
      companyId: COMPANY,
      sourceName: "erpnext-pos",
      financialStatus: { equals: "paid", mode: "insensitive" },
      AND: [
        { OR: [{ paymentGatewayPrimary: null }, { paymentGatewayPrimary: "" }] },
        { paymentGatewayNames: { isEmpty: true } },
      ],
      paymentEntries: { none: {} },
    },
  })

  console.log(JSON.stringify({ pe, sample, emptyPaidNoPe }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
