import { config } from "dotenv"
config({ path: ".env" })

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function timeBrand(companyId: string, brand: string) {
  const needle = brand.trim()
  const t0 = Date.now()
  const adaptCount = await prisma.adaptPurchaseHistory.count({
    where: {
      companyId,
      lineItems: { string_contains: needle, mode: "insensitive" },
    },
  })
  const tAdapt = Date.now()
  const orderCount = await prisma.order.count({
    where: {
      companyId,
      lineItems: {
        some: {
          OR: [
            {
              productItem: {
                vendor: { name: { equals: needle, mode: "insensitive" } },
              },
            },
            {
              productItem: {
                productTitle: { contains: needle, mode: "insensitive" },
              },
            },
          ],
        },
      },
    },
  })
  const tOrders = Date.now()
  return {
    brand,
    adaptMatchingRows: adaptCount,
    adaptMs: tAdapt - t0,
    cosmoMatchingOrders: orderCount,
    cosmoMs: tOrders - tAdapt,
    totalMs: tOrders - t0,
  }
}

async function main() {
  const company = await prisma.company.findFirst({
    select: { id: true, name: true },
  })
  if (!company) throw new Error("no company")
  console.log("company", company.name)

  for (const brand of ["Palmers", "CeraVe", "La Roche-Posay"]) {
    try {
      console.log(JSON.stringify(await timeBrand(company.id, brand)))
    } catch (err) {
      console.log(
        JSON.stringify({
          brand,
          error: err instanceof Error ? err.message : String(err),
        })
      )
    }
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
