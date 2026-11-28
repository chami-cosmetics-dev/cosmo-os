import { PrismaClient } from "@prisma/client"
import { fetchErpPaymentLegsByInvoice } from "../lib/book-notes/erp-payment-legs"
import { resolveDumpPaymentGateway } from "../lib/reports/order-dump"

const prisma = new PrismaClient()

async function main() {
  const order = await prisma.order.findFirst({
    where: { name: "600-001472" },
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
  if (!order?.companyLocation.erpnextInstance) {
    console.log(JSON.stringify({ error: "missing order or erp instance" }))
    return
  }
  const instance = order.companyLocation.erpnextInstance
  const invoice = order.erpnextInvoiceId?.trim() || order.name || ""
  const legs = await fetchErpPaymentLegsByInvoice({
    baseUrl: instance.baseUrl,
    apiKey: instance.apiKey,
    apiSecret: instance.apiSecret,
    invoiceNames: [invoice],
  })
  const modes = (legs.get(invoice) ?? []).map((leg) => leg.modeOfPayment)
  const resolved = resolveDumpPaymentGateway({
    paymentGatewayPrimary: order.paymentGatewayPrimary,
    paymentGatewayNames: order.paymentGatewayNames,
    paymentEntryModes: [
      ...order.paymentEntries.map((pe) => pe.modeOfPayment),
      ...modes,
    ],
    rawPayload: order.rawPayload,
    financialStatus: order.financialStatus,
  })
  console.log(JSON.stringify({ invoice, modes, resolved, legs: Object.fromEntries(legs) }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
