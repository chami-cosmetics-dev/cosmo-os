import { config } from "dotenv"
config({ path: ".env" })

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const company = await prisma.company.findFirst({ select: { id: true } })
  if (!company) throw new Error("no company")

  const t0 = Date.now()
  const rows = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT COUNT(*)::int AS n
    FROM "AdaptPurchaseHistory"
    WHERE "companyId" = ${company.id}
      AND ("lineItems"::text ILIKE ${"%palmer%"})
  `
  console.log({ ilikeCount: rows[0]?.n, ms: Date.now() - t0 })

  const sample = await prisma.$queryRaw<Array<{ t: string }>>`
    SELECT "lineItems"::text AS t
    FROM "AdaptPurchaseHistory"
    WHERE "companyId" = ${company.id}
      AND ("lineItems"::text ILIKE ${"%palmer%"})
    LIMIT 1
  `
  const text = sample[0]?.t ?? ""
  console.log({
    sampleLen: text.length,
    hits: text.match(/palmer[^"]{0,40}/gi)?.slice(0, 5) ?? [],
  })
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
