import { config } from "dotenv"
import { PrismaClient } from "@prisma/client"

config()
const prisma = new PrismaClient()

const o = await prisma.order.findFirst({
  where: {
    OR: [
      { name: "500-001641" },
      { erpnextInvoiceId: "500-001641" },
      { orderNumber: "500-001641" },
    ],
  },
  select: {
    id: true,
    name: true,
    orderNumber: true,
    fulfillmentStage: true,
    financialStatus: true,
    paymentGatewayPrimary: true,
    paymentGatewayNames: true,
    sourceName: true,
    totalPrice: true,
    sampleFreeIssueCompleteAt: true,
    erpnextInvoiceId: true,
    companyId: true,
    printCount: true,
    lastPrintedAt: true,
    packageReadyAt: true,
    dispatchedAt: true,
    deliveryCompleteAt: true,
    invoiceCompleteAt: true,
  },
})
console.log("ORDER", JSON.stringify(o, null, 2))
if (o) {
  const a = await prisma.approvalRequest.findMany({
    where: { orderId: o.id },
    select: {
      id: true,
      type: true,
      status: true,
      requestNote: true,
      reviewNote: true,
      paymentLines: {
        select: {
          paymentMethod: true,
          amount: true,
          erpPaymentEntryName: true,
        },
      },
    },
  })
  console.log("APPROVALS", JSON.stringify(a, null, 2))
}
await prisma.$disconnect()
