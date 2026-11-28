import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const order = await prisma.order.findFirst({
    where: {
      name: "600-001472",
      sourceName: "erpnext-pos",
    },
    select: {
      name: true,
      paymentGatewayPrimary: true,
      paymentGatewayNames: true,
      rawPayload: true,
      paymentEntries: { select: { modeOfPayment: true } },
    },
  })
  const payload = order?.rawPayload
  const top =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null
  const data =
    top?.data && typeof top.data === "object" && !Array.isArray(top.data)
      ? (top.data as Record<string, unknown>)
      : null
  console.log(
    JSON.stringify(
      {
        name: order?.name,
        paymentGatewayPrimary: order?.paymentGatewayPrimary,
        paymentGatewayNames: order?.paymentGatewayNames,
        pe: order?.paymentEntries,
        payments: data?.payments ?? top?.payments ?? null,
        custom_payment_type: data?.custom_payment_type ?? top?.custom_payment_type ?? null,
        payment_type: data?.payment_type ?? top?.payment_type ?? null,
        mode_of_payment: data?.mode_of_payment ?? top?.mode_of_payment ?? null,
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
