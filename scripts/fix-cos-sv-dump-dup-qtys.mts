/**
 * Fix File-import rows where Cos dump repeated the same SKU on one invoice.
 * Sums qty + line amounts and rewrites AdaptPurchaseHistory.lineItems / ttlAmount.
 *
 *   node scripts/with-env.mjs vault node --import ./scripts/stub-server-only.mjs --import tsx scripts/fix-cos-sv-dump-dup-qtys.mts
 *   ... --apply
 */
import ExcelJS from "exceljs"
import { Prisma } from "@prisma/client"

import { prisma } from "../lib/prisma"
import {
  roundMoney,
  supplementInvoiceKey,
  supplementLineId,
} from "../lib/vault-supplement-import/invoice-merge"

const ITEM_FILE =
  process.env.COS_SV_ITEM_FILE ??
  "C:/Users/Bad-Boy/Downloads/Invoice wise new sv from cos.xlsx"
const SOURCE_REF = "cos-sv-dump"
const apply = process.argv.includes("--apply")

function cellStr(value: unknown): string {
  if (value == null) return ""
  return String(value).trim()
}

function parseMoney(raw: unknown): number {
  const n = Number(String(raw ?? "").replace(/,/g, "").replace(/\s/g, ""))
  return Number.isFinite(n) ? n : NaN
}

function headerIndex(row: unknown[]): Map<string, number> {
  const map = new Map<string, number>()
  row.forEach((cell, i) => {
    const key = cellStr(cell).replace(/\s+/g, " ").trim().toUpperCase()
    if (key && !map.has(key)) map.set(key, i)
  })
  return map
}

type AggLine = {
  itemCode: string
  itemName: string
  qty: number
  unitPrice: number
  lineAmount: number
}

async function loadAggregated(path: string): Promise<Map<string, AggLine[]>> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const sheet =
    wb.worksheets.find((s) => s.name.toLowerCase().includes("item")) ?? wb.worksheets[0]
  if (!sheet) throw new Error("item sheet missing")

  const headerCells: unknown[] = []
  const hr = sheet.getRow(1)
  for (let c = 1; c <= Math.max(hr.cellCount, 30); c += 1) headerCells.push(hr.getCell(c).value)
  const idx = headerIndex(headerCells)
  const get = (...names: string[]) => {
    for (const n of names) {
      const at = idx.get(n.toUpperCase())
      if (at != null) return at
    }
    return null
  }
  const iInv = get("INVOICE NO")
  const iCode = get("ITEM CODE")
  const iName = get("ITEM NAME")
  const iQty = get("QTY")
  const iUnit = get("UNIT PRICE")
  const iGrand = get("GRAND TOTAL")
  if (iInv == null || iCode == null || iName == null || iQty == null || iUnit == null) {
    throw new Error("missing item columns")
  }

  const byInv = new Map<string, Map<string, AggLine>>()
  for (let r = 2; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r)
    const invoiceNo = cellStr(row.getCell(iInv + 1).value)
    const itemCode = cellStr(row.getCell(iCode + 1).value)
    const itemName = cellStr(row.getCell(iName + 1).value)
    if (!invoiceNo || !itemCode || !itemName) continue
    const qty = parseMoney(row.getCell(iQty + 1).value)
    const unitPrice = parseMoney(row.getCell(iUnit + 1).value)
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitPrice)) continue
    const grand = iGrand != null ? parseMoney(row.getCell(iGrand + 1).value) : NaN
    const lineAmount = Number.isFinite(grand) ? grand : roundMoney(qty * unitPrice)

    const codes = byInv.get(invoiceNo) ?? new Map<string, AggLine>()
    const prev = codes.get(itemCode)
    if (!prev) {
      codes.set(itemCode, { itemCode, itemName, qty, unitPrice, lineAmount })
    } else {
      prev.qty += qty
      prev.lineAmount = roundMoney(prev.lineAmount + lineAmount)
      prev.unitPrice = prev.qty > 0 ? roundMoney(prev.lineAmount / prev.qty) : prev.unitPrice
    }
    byInv.set(invoiceNo, codes)
  }

  const out = new Map<string, AggLine[]>()
  for (const [inv, codes] of byInv) out.set(inv, [...codes.values()])
  return out
}

async function main() {
  const company = await prisma.company.findFirst({
    where: { name: "SupplementVault.lk" },
    select: { id: true },
  })
  if (!company) throw new Error("company missing")

  const aggregated = await loadAggregated(ITEM_FILE)
  const keys = [...aggregated.keys()].map((inv) => supplementInvoiceKey(SOURCE_REF, inv))

  const existing = await prisma.adaptPurchaseHistory.findMany({
    where: { companyId: company.id, adaptInvoiceKey: { in: keys } },
    select: { id: true, adaptInvoiceKey: true, salesInvoiceNo: true, lineItems: true, ttlAmount: true },
  })

  let needFix = 0
  let unchanged = 0
  const updates: Array<{ id: string; invoice: string; beforeLines: number; afterLines: number; beforeTtl: string; afterTtl: string }> = []

  for (const row of existing) {
    const lines = aggregated.get(row.salesInvoiceNo)
    if (!lines) continue
    const adaptKey = row.adaptInvoiceKey
    const nextLines = lines.map((line) => ({
      id: supplementLineId(adaptKey, line.itemCode),
      itemCode: line.itemCode,
      itemName: line.itemName,
      quantity: line.qty,
      unitPrice: String(line.unitPrice),
      lineAmount: String(roundMoney(line.lineAmount)),
      itemId: null,
    }))
    const ttl = roundMoney(nextLines.reduce((s, l) => s + Number(l.lineAmount), 0))
    const beforeArr = Array.isArray(row.lineItems) ? row.lineItems : []
    const beforeTtl = String(row.ttlAmount)
    const sameCount = beforeArr.length === nextLines.length
    const sameTtl = Number(beforeTtl) === ttl
    // Detect qty mismatch on any shared code
    let qtyMismatch = false
    if (sameCount) {
      const beforeByCode = new Map<string, number>()
      for (const raw of beforeArr) {
        if (!raw || typeof raw !== "object") continue
        const item = raw as { itemCode?: string; quantity?: number }
        if (item.itemCode) beforeByCode.set(item.itemCode, Number(item.quantity) || 0)
      }
      for (const line of nextLines) {
        if ((beforeByCode.get(line.itemCode) ?? 0) !== line.quantity) {
          qtyMismatch = true
          break
        }
      }
    } else {
      qtyMismatch = true
    }

    if (!qtyMismatch && sameTtl) {
      unchanged += 1
      continue
    }
    needFix += 1
    updates.push({
      id: row.id,
      invoice: row.salesInvoiceNo,
      beforeLines: beforeArr.length,
      afterLines: nextLines.length,
      beforeTtl,
      afterTtl: String(ttl),
    })
    if (apply) {
      await prisma.adaptPurchaseHistory.update({
        where: { id: row.id },
        data: {
          lineItems: nextLines,
          ttlAmount: new Prisma.Decimal(ttl.toFixed(2)),
        },
      })
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        existingInvoices: existing.length,
        needFix,
        unchanged,
        sampleFixes: updates.slice(0, 20),
      },
      null,
      2,
    ),
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
