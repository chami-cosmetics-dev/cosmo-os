import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const order = await prisma.order.findFirst({
    where: { name: "60021552" },
    select: {
      name: true,
      financialStatus: true,
      paymentGatewayPrimary: true,
      paymentGatewayNames: true,
      rawPayload: true,
      sourceName: true,
    },
  })
  const payload = order?.rawPayload
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    console.log("no payload")
    return
  }
  const top = payload as Record<string, unknown>
  console.log(
    JSON.stringify(
      {
        name: order?.name,
        financialStatus: order?.financialStatus,
        paymentGatewayPrimary: order?.paymentGatewayPrimary,
        paymentGatewayNames: order?.paymentGatewayNames,
        payment_gateway_names: top.payment_gateway_names,
        gateway: top.gateway,
        processingMethod: top.processing_method,
        transactions: top.transactions,
        payment_terms: top.payment_terms,
        note_attributes: top.note_attributes,
        tags: top.tags,
      },
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
