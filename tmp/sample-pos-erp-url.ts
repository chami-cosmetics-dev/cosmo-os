import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const order = await prisma.order.findFirst({
    where: { name: "600-001472" },
    select: {
      name: true,
      erpnextInvoiceId: true,
      financialStatus: true,
      companyLocation: {
        select: {
          name: true,
          erpnextCompany: true,
          erpnextInstance: { select: { name: true, baseUrl: true } },
        },
      },
      rawPayload: true,
    },
  })

  const top =
    order?.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload)
      ? (order.rawPayload as Record<string, unknown>)
      : null
  const data =
    top?.data && typeof top.data === "object" && !Array.isArray(top.data)
      ? (top.data as Record<string, unknown>)
      : top

  console.log(
    JSON.stringify(
      {
        name: order?.name,
        erp: order?.companyLocation,
        financialStatus: order?.financialStatus,
        status: data?.status ?? null,
        outstanding_amount: data?.outstanding_amount ?? null,
        is_pos: data?.is_pos ?? null,
        payments: data?.payments ?? null,
        custom_payment_type: data?.custom_payment_type ?? null,
        payment_type: data?.payment_type ?? null,
        mode_of_payment: data?.mode_of_payment ?? null,
        owner: data?.owner ?? null,
        modified: data?.modified ?? null,
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
