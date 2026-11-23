import { config } from "dotenv"
import { PrismaClient } from "@prisma/client"

config()
const prisma = new PrismaClient()

const order = await prisma.order.findFirst({
  where: {
    name: "500-001641",
    fulfillmentStage: { in: ["order_received", "sample_free_issue"] },
    sourceName: { in: ["web", "manual", "erpnext"] },
    financialStatus: { not: "voided" },
  },
  select: {
    id: true,
    name: true,
    fulfillmentStage: true,
    paymentGatewayPrimary: true,
    financialStatus: true,
  },
})

console.log("VISIBLE_ON_SAMPLE", JSON.stringify(order, null, 2))
await prisma.$disconnect()
