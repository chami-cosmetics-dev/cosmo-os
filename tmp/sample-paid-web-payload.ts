import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

function keysOf(value: unknown, prefix = "", depth = 0): string[] {
  if (depth > 3 || !value || typeof value !== "object") return []
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${prefix}[]`]
    return keysOf(value[0], `${prefix}[]`, depth + 1)
  }
  const row = value as Record<string, unknown>
  const out: string[] = []
  for (const [key, child] of Object.entries(row)) {
    const path = prefix ? `${prefix}.${key}` : key
    out.push(path)
    if (
      key.toLowerCase().includes("pay") ||
      key.toLowerCase().includes("gateway") ||
      key.toLowerCase().includes("transaction") ||
      key.toLowerCase().includes("financial")
    ) {
      out.push(...keysOf(child, path, depth + 1))
    }
  }
  return out
}

async function main() {
  const order = await prisma.order.findFirst({
    where: { name: "60021552" },
    select: {
      name: true,
      sourceName: true,
      financialStatus: true,
      paymentGatewayPrimary: true,
      paymentGatewayNames: true,
      shopifyOrderId: true,
      rawPayload: true,
    },
  })

  const top =
    order?.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload)
      ? (order.rawPayload as Record<string, unknown>)
      : null

  const paymentish: Record<string, unknown> = {}
  const walk = (value: unknown, path: string) => {
    if (!value || typeof value !== "object") return
    if (Array.isArray(value)) {
      value.slice(0, 3).forEach((item, index) => walk(item, `${path}[${index}]`))
      return
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const next = path ? `${path}.${key}` : key
      const lower = key.toLowerCase()
      if (
        lower.includes("pay") ||
        lower.includes("gateway") ||
        lower.includes("transaction") ||
        lower.includes("financial") ||
        lower.includes("card") ||
        lower === "gateway" ||
        lower === "processing_method"
      ) {
        paymentish[next] = child
      }
      if (typeof child === "object" && child && path.split(".").length < 4) walk(child, next)
    }
  }
  walk(top, "")

  console.log(
    JSON.stringify(
      {
        name: order?.name,
        source: order?.sourceName,
        financialStatus: order?.financialStatus,
        paymentGatewayPrimary: order?.paymentGatewayPrimary,
        paymentGatewayNames: order?.paymentGatewayNames,
        topKeys: top ? Object.keys(top) : [],
        paymentish,
        pathHints: keysOf(top).filter((key) => /pay|gateway|transaction|financial/i.test(key)).slice(0, 80),
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
