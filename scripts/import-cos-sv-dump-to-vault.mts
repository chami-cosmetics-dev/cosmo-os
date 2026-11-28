/**
 * Merge Cos→Vault invoice-wise + item-wise dump workbooks into the standard
 * Purchases import sheet, skip invoice numbers already in Vault OS, then import
 * as origin `vault_file_import` (dump BUSINESS / insight label: File import).
 *
 * Usage:
 *   node scripts/with-env.mjs vault npx --yes tsx scripts/import-cos-sv-dump-to-vault.mts
 *   node scripts/with-env.mjs vault npx --yes tsx scripts/import-cos-sv-dump-to-vault.mts --apply
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import ExcelJS from "exceljs"

import { adaptEmailForContactUse, isSharedMerchantEmail } from "../lib/adapt-import/shared-emails"
import { normalizeContactPhone } from "../lib/contact-identifiers"
import { prisma } from "../lib/prisma"
import { PURCHASE_HEADERS } from "../lib/vault-supplement-import/headers"
import { importSupplementPurchases } from "../lib/vault-supplement-import/import-run"

const INVOICE_FILE =
  process.env.COS_SV_INVOICE_FILE ??
  "C:/Users/Bad-Boy/Downloads/need to add to VOS-SV from Cos NEW.xlsx"
const ITEM_FILE =
  process.env.COS_SV_ITEM_FILE ??
  "C:/Users/Bad-Boy/Downloads/Invoice wise new sv from cos.xlsx"
const SOURCE_REF = "cos-sv-dump"
const apply = process.argv.includes("--apply")
/** Re-write File import rows even when salesInvoiceNo already exists (qty fixes). */
const forceUpdate = process.argv.includes("--force-update")

type InvoiceHeader = {
  orderId: string
  name: string
  phone: string
  email: string | null
  paymentMethod: string | null
  shipping: number
  total: number
  invoiceDateYmd: string
  status: string
  location: string | null
  merchant: string | null
  district: string | null
  address: string | null
}

type ItemLine = {
  invoiceNo: string
  itemCode: string
  itemName: string
  qty: number
  unitPrice: number
  lineAmount: number
  brand: string | null
}

function cellStr(value: unknown): string {
  if (value == null) return ""
  if (value instanceof Date) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, "0")
    const d = String(value.getDate()).padStart(2, "0")
    return `${y}-${m}-${d}`
  }
  return String(value).trim()
}

function parseMoney(raw: unknown): number {
  const n = Number(String(raw ?? "").replace(/,/g, "").replace(/\s/g, ""))
  return Number.isFinite(n) ? n : NaN
}

/** Excel dump dates like 7/18/20 or 3/13/26 → YYYY-MM-DD (Asia/Colombo calendar). */
function parseDumpDate(raw: unknown): string | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getFullYear()
    const m = String(raw.getMonth() + 1).padStart(2, "0")
    const d = String(raw.getDate()).padStart(2, "0")
    return `${y}-${m}-${d}`
  }
  const text = cellStr(raw)
  if (!text) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/)
  if (!m) return null
  const month = Number(m[1])
  const day = Number(m[2])
  let year = Number(m[3])
  if (year < 100) year += year >= 70 ? 1900 : 2000
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function headerIndex(row: unknown[]): Map<string, number> {
  const map = new Map<string, number>()
  row.forEach((cell, i) => {
    const key = cellStr(cell).replace(/\s+/g, " ").trim().toUpperCase()
    if (key && !map.has(key)) map.set(key, i)
  })
  return map
}

function col(map: Map<string, number>, ...names: string[]): number | null {
  for (const name of names) {
    const at = map.get(name.toUpperCase())
    if (at != null) return at
  }
  return null
}

async function loadInvoiceHeaders(path: string): Promise<InvoiceHeader[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const sheet = wb.worksheets[0]
  if (!sheet) throw new Error(`No sheet in ${path}`)

  const row1 = sheet.getRow(1)
  const row2 = sheet.getRow(2)
  const probe = cellStr(row2.getCell(1).value).toUpperCase()
  const headerRowNumber = probe.includes("ORDER") ? 2 : 1
  const headerCells: unknown[] = []
  const hr = sheet.getRow(headerRowNumber)
  for (let c = 1; c <= Math.max(hr.cellCount, 30); c += 1) {
    headerCells.push(hr.getCell(c).value)
  }
  const idx = headerIndex(headerCells)
  const iOrder = col(idx, "ORDER ID")
  const iName = col(idx, "NAME")
  const iPhone = col(idx, "TP NO")
  const iEmail = col(idx, "E-MAIL", "EMAIL")
  const iPay = col(idx, "PAYMENT METHODE", "PAYMENT METHOD")
  const iShip = col(idx, "SHIPPING")
  const iTotal = col(idx, "TOTAL")
  const iDate = col(idx, "INVOICE DATE")
  const iStatus = col(idx, "STATUS")
  const iLoc = col(idx, "SALES LOCATION")
  const iMerch = col(idx, "MERCHANT")
  const iDistrict = col(idx, "DISTRICT")
  const iAddr = col(idx, "SHIPPING ADDRESS")
  if (iOrder == null || iName == null || iPhone == null || iDate == null) {
    throw new Error(`Invoice file missing required columns in ${path}`)
  }

  const out: InvoiceHeader[] = []
  for (let r = headerRowNumber + 1; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r)
    const orderId = cellStr(row.getCell((iOrder ?? 0) + 1).value)
    if (!orderId) continue
    const dateYmd = parseDumpDate(row.getCell((iDate ?? 0) + 1).value)
    if (!dateYmd) continue
    const emailRaw = iEmail != null ? cellStr(row.getCell(iEmail + 1).value) : ""
    out.push({
      orderId,
      name: cellStr(row.getCell((iName ?? 0) + 1).value) || "Unknown",
      phone: cellStr(row.getCell((iPhone ?? 0) + 1).value),
      email: adaptEmailForContactUse(emailRaw),
      paymentMethod: iPay != null ? cellStr(row.getCell(iPay + 1).value) || null : null,
      shipping: iShip != null ? parseMoney(row.getCell(iShip + 1).value) || 0 : 0,
      total: iTotal != null ? parseMoney(row.getCell(iTotal + 1).value) || 0 : 0,
      invoiceDateYmd: dateYmd,
      status: iStatus != null ? cellStr(row.getCell(iStatus + 1).value) : "Completed",
      location: iLoc != null ? cellStr(row.getCell(iLoc + 1).value) || null : null,
      merchant: iMerch != null ? cellStr(row.getCell(iMerch + 1).value) || null : null,
      district: iDistrict != null ? cellStr(row.getCell(iDistrict + 1).value) || null : null,
      address: iAddr != null ? cellStr(row.getCell(iAddr + 1).value) || null : null,
    })
  }
  return out
}

async function loadItemLines(path: string): Promise<ItemLine[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const sheet =
    wb.worksheets.find((s) => s.name.toLowerCase().includes("item")) ?? wb.worksheets[0]
  if (!sheet) throw new Error(`No sheet in ${path}`)

  const headerCells: unknown[] = []
  const hr = sheet.getRow(1)
  for (let c = 1; c <= Math.max(hr.cellCount, 30); c += 1) {
    headerCells.push(hr.getCell(c).value)
  }
  const idx = headerIndex(headerCells)
  const iInv = col(idx, "INVOICE NO")
  const iCode = col(idx, "ITEM CODE")
  const iName = col(idx, "ITEM NAME")
  const iQty = col(idx, "QTY")
  const iUnit = col(idx, "UNIT PRICE")
  const iGrand = col(idx, "GRAND TOTAL")
  const iBrand = col(idx, "BRAND NAME")
  if (iInv == null || iCode == null || iName == null || iQty == null || iUnit == null) {
    throw new Error(`Item file missing required columns in ${path}`)
  }

  const out: ItemLine[] = []
  for (let r = 2; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r)
    const invoiceNo = cellStr(row.getCell((iInv ?? 0) + 1).value)
    const itemCode = cellStr(row.getCell((iCode ?? 0) + 1).value)
    const itemName = cellStr(row.getCell((iName ?? 0) + 1).value)
    if (!invoiceNo || !itemCode || !itemName) continue
    const qty = parseMoney(row.getCell((iQty ?? 0) + 1).value)
    const unitPrice = parseMoney(row.getCell((iUnit ?? 0) + 1).value)
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitPrice)) continue
    const grand =
      iGrand != null ? parseMoney(row.getCell(iGrand + 1).value) : Number.NaN
    const lineAmount = Number.isFinite(grand) ? grand : Math.round(qty * unitPrice * 100) / 100
    out.push({
      invoiceNo,
      itemCode,
      itemName,
      qty,
      unitPrice,
      lineAmount,
      brand: iBrand != null ? cellStr(row.getCell(iBrand + 1).value) || null : null,
    })
  }
  return out
}

/** Drop staff emails reused across many phones in this dump. */
function scrubStaffEmails(invoices: InvoiceHeader[]): InvoiceHeader[] {
  const phonesByEmail = new Map<string, Set<string>>()
  for (const inv of invoices) {
    const email = inv.email?.toLowerCase()
    if (!email) continue
    const phone = normalizeContactPhone(inv.phone) ?? inv.phone
    const set = phonesByEmail.get(email) ?? new Set()
    set.add(phone)
    phonesByEmail.set(email, set)
  }
  const staff = new Set(
    [...phonesByEmail.entries()]
      .filter(([, phones]) => phones.size > 3)
      .map(([email]) => email),
  )
  return invoices.map((inv) => {
    const email = inv.email?.toLowerCase() ?? null
    if (!email) return inv
    if (isSharedMerchantEmail(email) || staff.has(email)) {
      return { ...inv, email: null }
    }
    return inv
  })
}

async function findExistingInvoiceNos(companyId: string, invoiceNos: string[]) {
  const adapt = new Map<
    string,
    { salesInvoiceNo: string; adaptInvoiceKey: string; origin: string; importBatchId: string | null }
  >()
  const orders = new Map<
    string,
    { name: string | null; erpnextInvoiceId: string | null; orderNumber: string | null }
  >()

  for (let i = 0; i < invoiceNos.length; i += 400) {
    const batch = invoiceNos.slice(i, i + 400)
    const hist = await prisma.adaptPurchaseHistory.findMany({
      where: { companyId, salesInvoiceNo: { in: batch } },
      select: {
        salesInvoiceNo: true,
        adaptInvoiceKey: true,
        origin: true,
        importBatchId: true,
      },
    })
    for (const row of hist) adapt.set(row.salesInvoiceNo, row)

    const orderRows = await prisma.order.findMany({
      where: {
        companyId,
        OR: [
          { name: { in: batch } },
          { erpnextInvoiceId: { in: batch } },
          { orderNumber: { in: batch } },
          { shopifyOrderId: { in: batch.map((n) => `erp-${n}`) } },
        ],
      },
      select: {
        name: true,
        erpnextInvoiceId: true,
        orderNumber: true,
        shopifyOrderId: true,
      },
    })
    for (const row of orderRows) {
      for (const key of [row.name, row.erpnextInvoiceId, row.orderNumber]) {
        if (key && batch.includes(key)) orders.set(key, row)
      }
    }
  }

  return { adapt, orders }
}

async function buildPurchasesBuffer(
  invoices: InvoiceHeader[],
  itemsByInvoice: Map<string, ItemLine[]>,
): Promise<{ buffer: Buffer; lineCount: number; skippedNoItems: string[]; skippedNoPhone: string[] }> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Purchases")
  const headers = [...PURCHASE_HEADERS, "Status"]
  headers.forEach((header, index) => {
    sheet.getCell(1, index + 1).value = header
  })

  let lineCount = 0
  const skippedNoItems: string[] = []
  const skippedNoPhone: string[] = []
  let row = 2

  for (const inv of invoices) {
    const phone = normalizeContactPhone(inv.phone)
    if (!phone) {
      skippedNoPhone.push(inv.orderId)
      continue
    }
    const lines = itemsByInvoice.get(inv.orderId) ?? []
    if (lines.length === 0) {
      skippedNoItems.push(inv.orderId)
      continue
    }
    // Same invoice + SKU can repeat in Cos dump — sum qty / line amount.
    const byCode = new Map<string, ItemLine>()
    for (const line of lines) {
      const prev = byCode.get(line.itemCode)
      if (!prev) {
        byCode.set(line.itemCode, { ...line })
        continue
      }
      prev.qty += line.qty
      prev.lineAmount = Math.round((prev.lineAmount + line.lineAmount) * 100) / 100
      prev.unitPrice = prev.qty > 0 ? Math.round((prev.lineAmount / prev.qty) * 100) / 100 : prev.unitPrice
    }
    for (const line of byCode.values()) {
      const values = [
        inv.name,
        phone,
        inv.email ?? "",
        inv.address ?? "",
        "",
        inv.district ?? "",
        inv.orderId,
        inv.invoiceDateYmd,
        line.itemCode,
        line.itemName,
        line.qty,
        line.unitPrice,
        line.lineAmount,
        "LKR",
        inv.paymentMethod ?? "",
        inv.location ?? "",
        inv.merchant ?? "",
        SOURCE_REF,
        inv.status.toLowerCase() || "completed",
      ]
      values.forEach((value, column) => {
        sheet.getCell(row, column + 1).value = value as string | number
      })
      row += 1
      lineCount += 1
    }
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer())
  return { buffer, lineCount, skippedNoItems, skippedNoPhone }
}

async function main() {
  const company = await prisma.company.findFirst({
    where: { name: "SupplementVault.lk" },
    select: { id: true, name: true },
  })
  if (!company) throw new Error("SupplementVault.lk company not found")

  console.error(`[cos-sv] reading invoice file: ${INVOICE_FILE}`)
  console.error(`[cos-sv] reading item file: ${ITEM_FILE}`)
  const invoicesRaw = await loadInvoiceHeaders(INVOICE_FILE)
  const invoices = scrubStaffEmails(invoicesRaw)
  const items = await loadItemLines(ITEM_FILE)

  const itemsByInvoice = new Map<string, ItemLine[]>()
  for (const line of items) {
    const list = itemsByInvoice.get(line.invoiceNo) ?? []
    list.push(line)
    itemsByInvoice.set(line.invoiceNo, list)
  }

  const invoiceNos = [...new Set(invoices.map((i) => i.orderId))]
  const { adapt, orders } = await findExistingInvoiceNos(company.id, invoiceNos)

  const already = [...new Set([...adapt.keys(), ...orders.keys()])].sort()
  const toImport = forceUpdate
    ? invoices
    : invoices.filter((inv) => !adapt.has(inv.orderId) && !orders.has(inv.orderId))

  const built = await buildPurchasesBuffer(toImport, itemsByInvoice)

  const outDir = resolve("tmp")
  mkdirSync(outDir, { recursive: true })
  const dupPath = resolve(outDir, "cos-sv-dump-already-in-db.json")
  const previewPath = resolve(outDir, "cos-sv-dump-purchases-preview.xlsx")
  writeFileSync(
    dupPath,
    JSON.stringify(
      {
        companyId: company.id,
        companyName: company.name,
        fileInvoiceCount: invoiceNos.length,
        fileItemLines: items.length,
        alreadyInDbCount: already.length,
        alreadyInDb: already.map((no) => ({
          invoiceNo: no,
          adapt: adapt.get(no) ?? null,
          order: orders.get(no) ?? null,
        })),
        skippedNoItems: built.skippedNoItems,
        skippedNoPhone: built.skippedNoPhone,
        toImportInvoiceCount: toImport.length,
        toImportLineCount: built.lineCount,
        forceUpdate,
      },
      null,
      2,
    ),
  )
  writeFileSync(previewPath, built.buffer)

  const summary = {
    mode: apply ? "apply" : "dry-run",
    forceUpdate,
    company: company.name,
    fileInvoices: invoiceNos.length,
    fileItemLines: items.length,
    alreadyInDb: already.length,
    toImportInvoices: toImport.length,
    toImportLines: built.lineCount,
    skippedNoItems: built.skippedNoItems.length,
    skippedNoPhone: built.skippedNoPhone.length,
    duplicateListFile: dupPath,
    previewWorkbook: previewPath,
    label: "File import (vault_file_import)",
  }
  console.log(JSON.stringify(summary, null, 2))

  if (already.length > 0) {
    console.error(`[cos-sv] ${already.length} invoice nos already in DB — skipped. Full list: ${dupPath}`)
  } else {
    console.error("[cos-sv] no invoice nos already in Vault OS AdaptPurchaseHistory/Order")
  }

  if (!apply) {
    console.error("[cos-sv] dry-run only — pass --apply to write File import rows")
    return
  }

  if (built.lineCount === 0) {
    console.error("[cos-sv] nothing to import")
    return
  }

  const result = await importSupplementPurchases({
    companyId: company.id,
    file: built.buffer,
  })
  console.log(JSON.stringify({ imported: result }, null, 2))
}

main()
  .catch((err) => {
    console.error("[cos-sv] fatal", err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
