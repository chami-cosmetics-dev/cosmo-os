import { PrismaClient } from "@prisma/client"
import * as XLSX from "xlsx"

const p = new PrismaClient()
const company = await p.company.findFirst({
  where: { name: "SupplementVault.lk" },
  select: { id: true },
})
console.log("company", company)

const groups = await p.adaptPurchaseHistory.groupBy({
  by: ["financialStatus"],
  where: {
    companyId: company.id,
    adaptInvoiceKey: { startsWith: "vsupp:cos-sv-dump|" },
  },
  _count: true,
})
console.log("cos dump statuses", groups)

const voidLike = await p.adaptPurchaseHistory.findMany({
  where: {
    companyId: company.id,
    adaptInvoiceKey: { startsWith: "vsupp:cos-sv-dump|" },
    OR: [
      { financialStatus: { contains: "void", mode: "insensitive" } },
      { financialStatus: { contains: "refund", mode: "insensitive" } },
    ],
  },
  select: {
    id: true,
    salesInvoiceNo: true,
    financialStatus: true,
    ttlAmount: true,
    contactId: true,
  },
})
console.log("void/refund in cos dump", voidLike.length)

const allVoid = await p.adaptPurchaseHistory.groupBy({
  by: ["financialStatus", "origin"],
  where: {
    companyId: company.id,
    OR: [
      { financialStatus: { contains: "void", mode: "insensitive" } },
      { financialStatus: { contains: "refund", mode: "insensitive" } },
    ],
  },
  _count: true,
})
console.log("all void/refund by origin", allVoid)

// Check source Excel STATUS / ADAPT STATUS
const inv = XLSX.readFile(
  "C:/Users/Bad-Boy/Downloads/need to add to VOS-SV from Cos NEW.xlsx",
)
const invRows = XLSX.utils.sheet_to_json(inv.Sheets[inv.SheetNames[0]], {
  header: 1,
  defval: null,
  raw: false,
})
const header = invRows[1]
console.log("invoice header", header)
const statusIdx = header.findIndex(
  (h) => String(h || "").trim().toUpperCase() === "STATUS",
)
const statuses = {}
for (const r of invRows.slice(2)) {
  const st = String(r[statusIdx] || "").trim()
  statuses[st] = (statuses[st] || 0) + 1
}
console.log("invoice STATUS counts", statuses)

const items = XLSX.utils.sheet_to_json(
  XLSX.readFile("C:/Users/Bad-Boy/Downloads/Invoice wise new sv from cos.xlsx")
    .Sheets["DUMP - Historical Invoice Item "],
  { defval: null, raw: false },
)
const adapt = {}
const web = {}
const invComplete = {}
for (const r of items) {
  const a = String(r["ADAPT STATUS"] || "").trim()
  const w = String(r["WEB SITE STATUS"] || "").trim()
  const c = String(r["INVOICE COMPLETED STATUS"] || "").trim()
  adapt[a] = (adapt[a] || 0) + 1
  web[w] = (web[w] || 0) + 1
  invComplete[c] = (invComplete[c] || 0) + 1
}
console.log({ adapt, web, invComplete })

await p.$disconnect()
