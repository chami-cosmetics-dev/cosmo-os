import { PrismaClient } from "@prisma/client"

const p = new PrismaClient()
const company = await p.company.findFirst({
  where: { name: "SupplementVault.lk" },
  select: { id: true },
})
const where = {
  companyId: company.id,
  adaptInvoiceKey: { startsWith: "vsupp:cos-sv-dump|" },
}
const invoices = await p.adaptPurchaseHistory.count({ where })
const byOrigin = await p.adaptPurchaseHistory.groupBy({
  by: ["origin"],
  where,
  _count: true,
})
const sample = await p.adaptPurchaseHistory.findMany({
  where,
  take: 5,
  orderBy: { invoiceDate: "desc" },
  select: {
    salesInvoiceNo: true,
    origin: true,
    importBatchId: true,
    ttlAmount: true,
    paymentMethod: true,
    locationName: true,
    merchantKnownName: true,
    contact: { select: { name: true, phoneNumber: true } },
    lineItems: true,
  },
})
const lineCounts = sample.map((s) => ({
  invoice: s.salesInvoiceNo,
  origin: s.origin,
  batch: s.importBatchId,
  amount: String(s.ttlAmount),
  contact: s.contact.name,
  phone: s.contact.phoneNumber,
  lines: Array.isArray(s.lineItems) ? s.lineItems.length : 0,
}))

// Deduped item-code collisions in file vs stored
const all = await p.adaptPurchaseHistory.findMany({
  where,
  select: { lineItems: true },
})
let storedLines = 0
for (const row of all) {
  if (Array.isArray(row.lineItems)) storedLines += row.lineItems.length
}

console.log(
  JSON.stringify(
    {
      invoices,
      byOrigin,
      storedLines,
      sample: lineCounts,
    },
    null,
    2,
  ),
)
await p.$disconnect()
