import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const companyId = "cmn2xcas1002crl5xtgoq28f5"

async function main() {
  const orders = await prisma.order.findMany({
    where: {
      companyId,
      financialStatus: { equals: "paid", mode: "insensitive" },
      AND: [
        { OR: [{ paymentGatewayPrimary: null }, { paymentGatewayPrimary: "" }] },
        { paymentGatewayNames: { isEmpty: true } },
      ],
    },
    select: {
      id: true,
      name: true,
      sourceName: true,
      paymentEntries: {
        select: { modeOfPayment: true, paymentType: true, amount: true },
        orderBy: { postingDate: "asc" },
      },
    },
  })

  let withPe = 0
  let withoutPe = 0
  const samples: unknown[] = []
  for (const order of orders) {
    if (order.paymentEntries.length > 0) {
      withPe += 1
      if (samples.length < 10) {
        samples.push({
          name: order.name,
          sourceName: order.sourceName,
          modes: order.paymentEntries.map((pe) => pe.modeOfPayment),
        })
      }
    } else {
      withoutPe += 1
    }
  }

  const approvalSamples = await prisma.approvalRequest.findMany({
    where: {
      companyId,
      orderId: { in: orders.slice(0, 40).map((o) => o.id) },
      status: "approved",
    },
    take: 20,
    select: {
      type: true,
      status: true,
      order: { select: { name: true } },
      paymentLines: { select: { paymentMethod: true, amount: true } },
    },
  })

  console.log(JSON.stringify({ total: orders.length, withPe, withoutPe, samples, approvalSamples }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
