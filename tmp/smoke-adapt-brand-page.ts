import { config } from "dotenv"
config({ path: ".env" })

import { PrismaClient, Prisma } from "@prisma/client"

const prisma = new PrismaClient()

async function fetchAdaptBrandPage(input: {
  companyId: string
  needle: string
  take: number
  cursor?: string
  contactIds?: string[]
}) {
  const needle = input.needle.trim()
  const contactFilter =
    input.contactIds && input.contactIds.length > 0
      ? Prisma.sql`AND "contactId" IN (${Prisma.join(input.contactIds)})`
      : Prisma.empty
  const cursorFilter = input.cursor
    ? Prisma.sql`AND id > ${input.cursor}`
    : Prisma.empty

  return prisma.$queryRaw<Array<{ id: string; contactId: string }>>`
    SELECT id, "contactId"
    FROM "AdaptPurchaseHistory"
    WHERE "companyId" = ${input.companyId}
      AND position(lower(${needle}) in lower("lineItems"::text)) > 0
      ${contactFilter}
      ${cursorFilter}
    ORDER BY id ASC
    LIMIT ${input.take}
  `
}

async function main() {
  const company = await prisma.company.findFirst({ select: { id: true } })
  if (!company) throw new Error("no company")

  const t0 = Date.now()
  const page1 = await fetchAdaptBrandPage({
    companyId: company.id,
    needle: "Palmers",
    take: 1000,
  })
  const page2 = await fetchAdaptBrandPage({
    companyId: company.id,
    needle: "Palmers",
    take: 1000,
    cursor: page1[page1.length - 1]?.id,
  })
  console.log(
    JSON.stringify({
      page1: page1.length,
      page2: page2.length,
      overlap: page2.some((r) => r.id === page1[0]?.id),
      ms: Date.now() - t0,
    })
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
