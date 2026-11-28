import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const COMPANY = "cmn2xcas1002crl5xtgoq28f5"

async function main() {
  const emptyPos = await prisma.order.findMany({
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
    take: 20,
    orderBy: { createdAt: "desc" },
    select: {
      name: true,
      erpnextInvoiceId: true,
      companyLocation: { select: { name: true, erpnextCompany: true } },
    },
  })

  console.log(JSON.stringify({ countSample: emptyPos.length, emptyPos }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
