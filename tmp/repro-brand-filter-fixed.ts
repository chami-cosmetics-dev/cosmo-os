import { config } from "dotenv"
config({ path: ".env" })

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function fetchAdaptBrandPage(input: {
  companyId: string
  needle: string
  take: number
  cursor?: string
}) {
  const needle = input.needle.trim()
  const cursorFilter = input.cursor
    ? prisma.$queryRaw`AND false` // placeholder unused
    : null
  void cursorFilter
  return prisma.$queryRaw<
    Array<{ id: string; contactId: string }>
  >`
    SELECT id, "contactId"
    FROM "AdaptPurchaseHistory"
    WHERE "companyId" = ${input.companyId}
      AND position(lower(${needle}) in lower("lineItems"::text)) > 0
      ${input.cursor ? prisma.$queryRaw`` : prisma.$queryRaw``}
    ORDER BY id ASC
    LIMIT ${input.take}
  `
}

async function main() {
  const company = await prisma.company.findFirst({ select: { id: true } })
  if (!company) throw new Error("no company")

  for (const brand of ["Palmers", "CeraVe"]) {
    const t0 = Date.now()
    const rows = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n
      FROM "AdaptPurchaseHistory"
      WHERE "companyId" = ${company.id}
        AND position(lower(${brand}) in lower("lineItems"::text)) > 0
    `
    const adaptMs = Date.now() - t0
    const t1 = Date.now()
    const orderCount = await prisma.order.count({
      where: {
        companyId: company.id,
        lineItems: {
          some: {
            OR: [
              {
                productItem: {
                  vendor: { name: { equals: brand, mode: "insensitive" } },
                },
              },
              {
                productItem: {
                  productTitle: { contains: brand, mode: "insensitive" },
                },
              },
            ],
          },
        },
      },
    })
    console.log(
      JSON.stringify({
        brand,
        adaptRows: rows[0]?.n,
        adaptMs,
        cosmoOrders: orderCount,
        cosmoMs: Date.now() - t1,
      })
    )
  }

  // Smoke: first page of Adapt brand scan
  const page = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM "AdaptPurchaseHistory"
    WHERE "companyId" = ${company.id}
      AND position(lower(${"Palmers"}) in lower("lineItems"::text)) > 0
    ORDER BY id ASC
    LIMIT 5
  `
  console.log("firstAdaptIds", page.length)
  void fetchAdaptBrandPage
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
