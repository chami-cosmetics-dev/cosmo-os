import { PrismaClient } from "@prisma/client"
import { resolveDumpPaymentGateway } from "../lib/reports/order-dump"
import { fetchErpPaymentLegsByInvoice } from "../lib/book-notes/erp-payment-legs"

const prisma = new PrismaClient()

const NAMES = [
  "SV200-1049",
  "SV300-1018",
  "INV-SV300-00050",
  "ACC-SINV-2026-00055",
  "ACC-SINV-SV100-2026-00020",
  "SV100-2026-00003",
  "SV1007787",
  "SV200-0001",
]

async function main() {
  const companies = await prisma.company.findMany({
    select: { id: true, name: true, _count: { select: { orders: true } } },
  })

  const orders = await prisma.order.findMany({
    where: { name: { in: NAMES } },
    select: {
      id: true,
      name: true,
      sourceName: true,
      financialStatus: true,
      paymentGatewayPrimary: true,
      paymentGatewayNames: true,
      erpnextInvoiceId: true,
      companyId: true,
      paymentEntries: { select: { modeOfPayment: true, paymentEntryId: true } },
      companyLocation: {
        select: {
          name: true,
          erpnextCompany: true,
          erpnextInstance: { select: { baseUrl: true, apiKey: true, apiSecret: true, label: true } },
        },
      },
      rawPayload: true,
    },
  })

  const emptyPaid = await prisma.order.count({
    where: {
      financialStatus: { equals: "paid", mode: "insensitive" },
      AND: [
        { OR: [{ paymentGatewayPrimary: null }, { paymentGatewayPrimary: "" }] },
        { paymentGatewayNames: { isEmpty: true } },
      ],
    },
  })

  const emptyPaidBySource = await prisma.order.groupBy({
    by: ["sourceName"],
    where: {
      financialStatus: { equals: "paid", mode: "insensitive" },
      AND: [
        { OR: [{ paymentGatewayPrimary: null }, { paymentGatewayPrimary: "" }] },
        { paymentGatewayNames: { isEmpty: true } },
      ],
    },
    _count: { _all: true },
  })

  const samples = []
  for (const order of orders) {
    const localResolved = resolveDumpPaymentGateway({
      paymentGatewayPrimary: order.paymentGatewayPrimary,
      paymentGatewayNames: order.paymentGatewayNames,
      paymentEntryModes: order.paymentEntries.map((pe) => pe.modeOfPayment),
      rawPayload: order.rawPayload,
      financialStatus: order.financialStatus,
    })

    let erpModes: string[] = []
    const instance = order.companyLocation.erpnextInstance
    const invoice = order.erpnextInvoiceId?.trim() || order.name
    if (instance?.baseUrl && instance.apiKey && instance.apiSecret && invoice) {
      const legs = await fetchErpPaymentLegsByInvoice({
        baseUrl: instance.baseUrl,
        apiKey: instance.apiKey,
        apiSecret: instance.apiSecret,
        invoiceNames: [invoice],
      })
      erpModes = (legs.get(invoice) ?? []).map((leg) => leg.modeOfPayment).filter(Boolean) as string[]
    }

    const top =
      order.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload)
        ? (order.rawPayload as Record<string, unknown>)
        : null
    const data =
      top?.data && typeof top.data === "object" && !Array.isArray(top.data)
        ? (top.data as Record<string, unknown>)
        : top

    samples.push({
      name: order.name,
      source: order.sourceName,
      financialStatus: order.financialStatus,
      erpCompany: order.companyLocation.erpnextCompany,
      erpLabel: instance?.label ?? null,
      erpUrl: instance?.baseUrl ?? null,
      pe: order.paymentEntries,
      localResolved,
      erpModes,
      withErpResolved: resolveDumpPaymentGateway({
        paymentGatewayPrimary: order.paymentGatewayPrimary,
        paymentGatewayNames: order.paymentGatewayNames,
        paymentEntryModes: [...order.paymentEntries.map((pe) => pe.modeOfPayment), ...erpModes],
        rawPayload: order.rawPayload,
        financialStatus: order.financialStatus,
      }),
      payments: Array.isArray(data?.payments) ? data.payments : data?.payments ?? null,
      custom_payment_type: data?.custom_payment_type ?? null,
    })
  }

  console.log(
    JSON.stringify(
      {
        companies,
        emptyPaid,
        emptyPaidBySource,
        found: orders.length,
        samples,
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
