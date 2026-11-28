import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const COMPANY = "cmn2xcas1002crl5xtgoq28f5"

async function main() {
  const empty = await prisma.order.findMany({
    where: {
      companyId: COMPANY,
      financialStatus: { equals: "paid", mode: "insensitive" },
      AND: [
        { OR: [{ paymentGatewayPrimary: null }, { paymentGatewayPrimary: "" }] },
        { paymentGatewayNames: { isEmpty: true } },
      ],
    },
    take: 40,
    orderBy: { createdAt: "desc" },
    select: {
      name: true,
      sourceName: true,
      createdAt: true,
      paymentGatewayPrimary: true,
      paymentGatewayNames: true,
      paymentEntries: { select: { modeOfPayment: true, paymentType: true } },
      rawPayload: true,
    },
  })

  const total = await prisma.order.count({
    where: {
      companyId: COMPANY,
      financialStatus: { equals: "paid", mode: "insensitive" },
      AND: [
        { OR: [{ paymentGatewayPrimary: null }, { paymentGatewayPrimary: "" }] },
        { paymentGatewayNames: { isEmpty: true } },
      ],
    },
  })

  const withPe = empty.filter((o) => o.paymentEntries.some((pe) => pe.modeOfPayment?.trim())).length

  const samples = empty.slice(0, 15).map((order) => {
    const top =
      order.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload)
        ? (order.rawPayload as Record<string, unknown>)
        : null
    const data =
      top?.data && typeof top.data === "object" && !Array.isArray(top.data)
        ? (top.data as Record<string, unknown>)
        : top
    return {
      name: order.name,
      source: order.sourceName,
      modes: order.paymentEntries.map((pe) => pe.modeOfPayment),
      custom_payment_type: data?.custom_payment_type ?? null,
      payment_type: data?.payment_type ?? null,
      payments: Array.isArray(data?.payments) ? data.payments.slice(0, 2) : null,
      gateway: data?.gateway ?? top?.gateway ?? null,
      payment_gateway_names: data?.payment_gateway_names ?? top?.payment_gateway_names ?? null,
    }
  })

  console.log(JSON.stringify({ total, sampled: empty.length, withPeInSample: withPe, samples }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
