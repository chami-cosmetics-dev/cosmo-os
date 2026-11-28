import { PrismaClient, type Prisma } from "@prisma/client"

const prisma = new PrismaClient()
const companyId = "cmn2xcas1002crl5xtgoq28f5"

function pickPayloadPayment(rawPayload: Prisma.JsonValue | null) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return { keys: [] as string[], gateway: null as string | null, names: [] as string[] }
  }
  const top = rawPayload as Record<string, unknown>
  const data =
    top.data && typeof top.data === "object" && !Array.isArray(top.data)
      ? (top.data as Record<string, unknown>)
      : null
  const keys = [...Object.keys(top), ...(data ? Object.keys(data).map((k) => `data.${k}`) : [])]
    .filter((k) => /pay|gateway|mop|mode/i.test(k))
    .slice(0, 40)

  const gateway =
    (typeof top.payment_gateway_names === "string" && top.payment_gateway_names) ||
    (typeof top.payment_gateway === "string" && top.payment_gateway) ||
    (typeof data?.payment_gateway === "string" && data.payment_gateway) ||
    null

  const names = Array.isArray(top.payment_gateway_names)
    ? top.payment_gateway_names.filter((v): v is string => typeof v === "string")
    : Array.isArray(data?.payment_gateway_names)
      ? data.payment_gateway_names.filter((v): v is string => typeof v === "string")
      : []

  const payments = Array.isArray(top.payments)
    ? top.payments
    : Array.isArray(data?.payments)
      ? data.payments
      : []

  return { keys, gateway, names, payments: payments.slice(0, 3) }
}

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
    take: 6,
    orderBy: { createdAt: "desc" },
    select: {
      name: true,
      sourceName: true,
      rawPayload: true,
      erpnextInvoiceId: true,
    },
  })

  for (const order of orders) {
    console.log(
      JSON.stringify({
        name: order.name,
        sourceName: order.sourceName,
        erp: order.erpnextInvoiceId,
        payload: pickPayloadPayment(order.rawPayload),
      }),
    )
  }

  const adaptNa = await prisma.adaptPurchaseHistory.findMany({
    where: { companyId, paymentMethod: "N/A" },
    take: 5,
    orderBy: { invoiceDate: "desc" },
    select: {
      salesInvoiceNo: true,
      paymentMethod: true,
      financialStatus: true,
      rawPaymentContext: true,
    },
  })
  console.log(JSON.stringify({ adaptNa }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
