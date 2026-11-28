import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const companyId = "cmn2xcas1002crl5xtgoq28f5"

async function main() {
  const total = await prisma.adaptPurchaseHistory.count({ where: { companyId } })
  const paidNoMethod = await prisma.adaptPurchaseHistory.count({
    where: {
      companyId,
      OR: [{ paymentMethod: null }, { paymentMethod: "" }],
    },
  })
  const withContext = await prisma.adaptPurchaseHistory.count({
    where: {
      companyId,
      OR: [{ paymentMethod: null }, { paymentMethod: "" }],
      rawPaymentContext: { not: null as unknown as undefined },
    },
  })
  const samples = await prisma.adaptPurchaseHistory.findMany({
    where: {
      companyId,
      OR: [{ paymentMethod: null }, { paymentMethod: "" }],
    },
    take: 8,
    select: {
      salesInvoiceNo: true,
      financialStatus: true,
      paymentMethod: true,
      rawPaymentContext: true,
    },
    orderBy: { invoiceDate: "desc" },
  })
  console.log(JSON.stringify({ total, paidNoMethod, withContext, samples }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
