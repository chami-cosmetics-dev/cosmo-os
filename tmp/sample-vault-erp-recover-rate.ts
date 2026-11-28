import { PrismaClient } from "@prisma/client"
import { fetchErpPaymentLegsByInvoice } from "../lib/book-notes/erp-payment-legs"
import { resolveDumpPaymentGateway } from "../lib/reports/order-dump"

const prisma = new PrismaClient()

async function main() {
  const emptyPaid = await prisma.order.findMany({
    where: {
      financialStatus: { equals: "paid", mode: "insensitive" },
      AND: [
        { OR: [{ paymentGatewayPrimary: null }, { paymentGatewayPrimary: "" }] },
        { paymentGatewayNames: { isEmpty: true } },
      ],
    },
    select: {
      id: true,
      name: true,
      erpnextInvoiceId: true,
      paymentGatewayPrimary: true,
      paymentGatewayNames: true,
      financialStatus: true,
      rawPayload: true,
      paymentEntries: { select: { modeOfPayment: true } },
      companyLocation: {
        select: {
          erpnextInstance: { select: { baseUrl: true, apiKey: true, apiSecret: true } },
        },
      },
    },
  })

  type Bucket = {
    baseUrl: string
    apiKey: string
    apiSecret: string
    orders: typeof emptyPaid
  }
  const byCred = new Map<string, Bucket>()
  for (const order of emptyPaid) {
    const instance = order.companyLocation.erpnextInstance
    if (!instance?.baseUrl || !instance.apiKey || !instance.apiSecret) continue
    const key = `${instance.baseUrl}::${instance.apiKey}`
    const bucket = byCred.get(key) ?? {
      baseUrl: instance.baseUrl,
      apiKey: instance.apiKey,
      apiSecret: instance.apiSecret,
      orders: [],
    }
    bucket.orders.push(order)
    byCred.set(key, bucket)
  }

  let recovered = 0
  const modeCounts: Record<string, number> = {}
  const stillEmpty: string[] = []

  for (const bucket of byCred.values()) {
    const invoiceNames = bucket.orders
      .map((order) => order.erpnextInvoiceId?.trim() || order.name || "")
      .filter(Boolean)
    const legs = await fetchErpPaymentLegsByInvoice({
      baseUrl: bucket.baseUrl,
      apiKey: bucket.apiKey,
      apiSecret: bucket.apiSecret,
      invoiceNames,
    })
    for (const order of bucket.orders) {
      const invoice = order.erpnextInvoiceId?.trim() || order.name || ""
      const modes = (legs.get(invoice) ?? []).map((leg) => leg.modeOfPayment).filter(Boolean) as string[]
      const resolved = resolveDumpPaymentGateway({
        paymentGatewayPrimary: order.paymentGatewayPrimary,
        paymentGatewayNames: order.paymentGatewayNames,
        paymentEntryModes: [...order.paymentEntries.map((pe) => pe.modeOfPayment), ...modes],
        rawPayload: order.rawPayload,
        financialStatus: null, // measure real mode recovery, not Paid fallback
      })
      if (resolved) {
        recovered += 1
        modeCounts[resolved] = (modeCounts[resolved] ?? 0) + 1
      } else {
        stillEmpty.push(order.name ?? order.id)
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        totalEmptyPaid: emptyPaid.length,
        recoveredRealMode: recovered,
        stillEmptyWithoutPaidFallback: stillEmpty.length,
        modeCounts,
        stillEmptySample: stillEmpty.slice(0, 15),
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
