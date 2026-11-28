import { PrismaClient } from "@prisma/client"

const p = new PrismaClient()
const fileImport = await p.adaptPurchaseHistory.count({ where: { origin: "vault_file_import" } })
const cosDump = await p.adaptPurchaseHistory.count({
  where: { adaptInvoiceKey: { startsWith: "vsupp:cos-sv-dump|" } },
})
const batch = await p.adaptPurchaseHistory.findFirst({
  where: { adaptInvoiceKey: { startsWith: "vsupp:cos-sv-dump|" } },
  select: { importBatchId: true },
  orderBy: { createdAt: "desc" },
})
console.log(JSON.stringify({ fileImport, cosDump, latestBatch: batch?.importBatchId ?? null }))
await p.$disconnect()
