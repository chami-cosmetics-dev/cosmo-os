import { PrismaClient } from "@prisma/client"
import { resolveDumpPaymentGateway } from "../lib/reports/order-dump"

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
    select: {
      id: true,
      name: true,
      sourceName: true,
      paymentGatewayPrimary: true,
      paymentGatewayNames: true,
      rawPayload: true,
      paymentEntries: { select: { modeOfPayment: true } },
    },
  })

  let recoverablePe = 0
  let recoverablePayload = 0
  let recoverableResolved = 0
  const peSamples: Array<{ name: string; modes: string[]; resolved: string }> = []

  for (const order of empty) {
    const modes = order.paymentEntries.map((pe) => pe.modeOfPayment)
    if (modes.some((mode) => mode?.trim())) {
      recoverablePe += 1
      if (peSamples.length < 8) {
        peSamples.push({
          name: order.name ?? order.id,
          modes: modes.filter((mode): mode is string => Boolean(mode?.trim())),
          resolved: resolveDumpPaymentGateway({
            paymentGatewayPrimary: order.paymentGatewayPrimary,
            paymentGatewayNames: order.paymentGatewayNames,
            paymentEntryModes: modes,
            rawPayload: order.rawPayload,
          }),
        })
      }
    }
    const resolved = resolveDumpPaymentGateway({
      paymentGatewayPrimary: order.paymentGatewayPrimary,
      paymentGatewayNames: order.paymentGatewayNames,
      paymentEntryModes: modes,
      rawPayload: order.rawPayload,
    })
    if (resolved) recoverableResolved += 1
  }

  const approvals = await prisma.approvalRequest.findMany({
    where: {
      companyId: COMPANY,
      orderId: { in: empty.map((order) => order.id) },
      status: { in: ["APPROVED", "approved"] },
    },
    take: 50,
    select: {
      orderId: true,
      type: true,
      status: true,
      requestNote: true,
      paymentLines: { select: { paymentMethod: true, amount: true } },
    },
  })

  const bySource: Record<string, number> = {}
  for (const order of empty) {
    bySource[order.sourceName] = (bySource[order.sourceName] ?? 0) + 1
  }

  // note_attributes / tags sample for web empties
  const web = empty.filter((order) => order.sourceName === "web").slice(0, 5)
  const webHints = web.map((order) => {
    const top =
      order.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload)
        ? (order.rawPayload as Record<string, unknown>)
        : null
    return {
      name: order.name,
      tags: top?.tags ?? null,
      note: top?.note ?? null,
      note_attributes: top?.note_attributes ?? null,
      payment_gateway_names: top?.payment_gateway_names ?? null,
    }
  })

  console.log(
    JSON.stringify(
      {
        totalEmpty: empty.length,
        bySource,
        recoverablePe,
        recoverableResolved,
        peSamples,
        approvals: approvals.length,
        approvalSamples: approvals.slice(0, 10).map((row) => ({
          orderId: row.orderId,
          type: row.type,
          status: row.status,
          note: row.requestNote,
          lines: row.paymentLines,
        })),
        webHints,
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
