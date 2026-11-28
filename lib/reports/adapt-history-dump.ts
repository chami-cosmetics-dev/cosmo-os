import type { Prisma } from "@prisma/client"

import {
  createOrderInvoiceItemRow,
  createOrderInvoiceRow,
  getOrderInvoiceCsvHeaders,
  getOrderInvoiceItemCsvHeaders,
  type OrderInvoiceCsvRow,
  type OrderInvoiceItemCsvRow,
} from "@/lib/reports/order-dump"

export const ADAPT_HISTORY_DATA_SOURCE = "Adapt history"
export const COSMO_OS_DATA_SOURCE = "Cosmo OS"

export const ADAPT_DUMP_PAGE_SIZE = 400

export type AdaptDumpLine = {
  itemCode?: string | null
  itemName?: string | null
  unitPrice?: string | number | null
  quantity?: number | string | null
}

export type AdaptCatalogHit = {
  barcode: string
  brand: string
}

export type AdaptDumpInvoiceInput = {
  salesInvoiceNo: string | null
  invoiceDate: Date
  ttlAmount: Prisma.Decimal | string | number | null
  locationName: string | null
  paymentMethod: string | null
  merchantKnownName: string | null
  financialStatus: string | null
  lineItems: Prisma.JsonValue | null
  contact: {
    name: string | null
    phoneNumber?: string | null
    email?: string | null
    address?: string | null
  } | null
}

export type HistoricalInvoiceCsvRow = OrderInvoiceCsvRow & { data_source: string }
export type HistoricalInvoiceItemCsvRow = OrderInvoiceItemCsvRow & { data_source: string }

export function getHistoricalOrderInvoiceCsvHeaders(omitCustomerPhone = false) {
  return [...getOrderInvoiceCsvHeaders(omitCustomerPhone), "data_source"]
}

export function getHistoricalOrderInvoiceItemCsvHeaders(omitCustomerPhone = false) {
  return [...getOrderInvoiceItemCsvHeaders(omitCustomerPhone), "data_source"]
}

export function isHistoricalDumpRange(range: string) {
  return range === "custom" || range === "historical-year"
}

export function parseHistoricalDumpCursor(after: string) {
  const trimmed = after.trim()
  if (!trimmed) return { phase: "adapt" as const, id: "" }
  if (trimmed.startsWith("a:")) return { phase: "adapt" as const, id: trimmed.slice(2) }
  if (trimmed.startsWith("o:")) return { phase: "order" as const, id: trimmed.slice(2) }
  // Legacy plain Order cursors from older clients stay on the Order phase.
  return { phase: "order" as const, id: trimmed }
}

export function adaptDumpCursor(id: string) {
  return `a:${id}`
}

export function orderDumpCursor(id: string) {
  return `o:${id}`
}

/** Empty Order-phase cursor means “start Orders after Adapt exhausted”. */
export function orderDumpStartCursor() {
  return "o:"
}

export function classifyAdaptLine(item: AdaptDumpLine): "product" | "coupon" | "shipping" | "fee" {
  const code = String(item.itemCode ?? "").trim().toLowerCase()
  if (code === "coupon") return "coupon"
  if (code === "shipping") return "shipping"
  if (code === "fee") return "fee"
  return "product"
}

export function normalizeAdaptSku(value: string) {
  return value.trim().toUpperCase().replace(/-/g, "_")
}

function betterCatalogHit(current: AdaptCatalogHit | undefined, next: AdaptCatalogHit): AdaptCatalogHit {
  if (!current) return next
  const currentScore = (current.barcode ? 1 : 0) + (current.brand ? 1 : 0)
  const nextScore = (next.barcode ? 1 : 0) + (next.brand ? 1 : 0)
  return nextScore > currentScore ? next : current
}

export function buildAdaptCatalogMap(
  items: Array<{ sku: string | null; barcode: string | null; vendorName: string | null }>,
) {
  const exact = new Map<string, AdaptCatalogHit>()
  for (const item of items) {
    const sku = item.sku?.trim()
    if (!sku) continue
    const hit: AdaptCatalogHit = {
      barcode: item.barcode?.trim() ?? "",
      brand: item.vendorName?.trim() ?? "",
    }
    const key = normalizeAdaptSku(sku)
    exact.set(key, betterCatalogHit(exact.get(key), hit))
  }
  return exact
}

export function matchAdaptCatalog(exact: Map<string, AdaptCatalogHit>, itemCode: string | null | undefined) {
  const raw = itemCode?.trim() ?? ""
  if (!raw) return { barcode: "", brand: "", match: "none" as const }
  const normalized = normalizeAdaptSku(raw)
  const direct = exact.get(normalized)
  if (direct) return { barcode: direct.barcode, brand: direct.brand, match: "exact" as const }
  const oi = normalized.match(/^(.*)\*OI$/)
  if (oi?.[1]) {
    const mapped = exact.get(`${oi[1]}_1`) ?? exact.get(`${oi[1]}1`)
    if (mapped) return { barcode: mapped.barcode, brand: mapped.brand, match: "oi_mapped_to_1" as const }
  }
  return { barcode: "", brand: "", match: "none" as const }
}

function toNumber(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  const n = Number.parseFloat(String(value ?? "").replace(/,/g, ""))
  return Number.isFinite(n) ? n : 0
}

function amountToNumber(value: Prisma.Decimal | string | number | null | undefined) {
  if (value == null) return 0
  if (typeof value === "object" && "toString" in value) return toNumber(value.toString())
  return toNumber(value)
}

function money(value: number) {
  return value.toFixed(2)
}

function isStorePickupName(name: string) {
  return /store\s*pick/i.test(name)
}

function parseAdaptLines(lineItems: Prisma.JsonValue | null | undefined): AdaptDumpLine[] {
  if (!Array.isArray(lineItems)) return []
  return lineItems.filter(
    (item): item is AdaptDumpLine => !!item && typeof item === "object" && !Array.isArray(item),
  )
}

export function splitAdaptLines(lineItems: Prisma.JsonValue | null | undefined) {
  let merchantCoupon = ""
  let posSale = false
  let shippingTotal = 0
  const products: AdaptDumpLine[] = []

  for (const item of parseAdaptLines(lineItems)) {
    const kind = classifyAdaptLine(item)
    const name = String(item.itemName ?? "").trim()
    if (kind === "coupon") {
      if (!merchantCoupon && name) merchantCoupon = name
      continue
    }
    if (kind === "shipping") {
      shippingTotal += toNumber(item.quantity) * toNumber(item.unitPrice)
      if (isStorePickupName(name)) posSale = true
      continue
    }
    if (kind === "fee") continue
    products.push(item)
  }

  return { products, merchantCoupon, posSale, shippingTotal }
}

export function mapAdaptInvoiceToDumpInvoiceRow(
  input: AdaptDumpInvoiceInput,
  catalog: Map<string, AdaptCatalogHit> = new Map(),
): HistoricalInvoiceCsvRow {
  const { products, merchantCoupon, posSale, shippingTotal } = splitAdaptLines(input.lineItems)
  const invoiceNo = input.salesInvoiceNo?.trim() || ""
  const invoiceTotal = amountToNumber(input.ttlAmount)
  let lineTotal = 0
  for (const item of products) {
    lineTotal += toNumber(item.quantity) * toNumber(item.unitPrice)
    matchAdaptCatalog(catalog, item.itemCode)
  }

  const customerName = input.contact?.name?.trim() ?? ""
  const customerPhone = input.contact?.phoneNumber?.trim() || null
  const customerEmail = input.contact?.email?.trim() || null
  const address = input.contact?.address?.trim() ?? ""
  const locationName = input.locationName?.trim() ?? ""
  const paymentGateway = input.paymentMethod?.trim() ?? ""
  const financialStatus = input.financialStatus?.trim() || "paid"

  const row = createOrderInvoiceRow({
    invoiceNo,
    erpInvoiceId: null,
    sourceName: "adapt",
    merchantCouponCode: merchantCoupon || null,
    couponCode: merchantCoupon || null,
    merchantName: input.merchantKnownName?.trim() ?? "",
    fulfillmentStage: "Completed",
    financialStatus,
    shippingService: posSale ? "Customer pickup" : locationName,
    createdAt: input.invoiceDate,
    companyName: locationName,
    posProfile: null,
    posWarehouse: null,
    customerName,
    customerEmail,
    customerPhone,
    shippingPhone: customerPhone,
    billingAddress: address,
    shippingAddress: address,
    fulfillmentStatus: "",
    paymentGateway,
    subtotalPrice: money(lineTotal),
    discounts: "",
    shippingTotal: shippingTotal > 0 ? money(shippingTotal) : "",
    grandTotal: money(invoiceTotal),
    itemCount: products.length,
    printCount: 0,
    packageReadyAt: null,
    dispatchedAt: null,
    dispatchedBy: "",
    lastPrintedAt: null,
    lastPrintedBy: "",
    revertedFromInvoiceCompleteAt: null,
    deliveryCompleteAt: null,
    deliveryCompleteBy: "",
    invoiceCompleteAt: input.invoiceDate,
    invoiceCompleteBy: "",
    shippingRule: null,
    createdBy: "",
    kokoRefNumber: "",
  })

  row.status = "Completed"
  row.payment_status = financialStatus
  row.fulfillment_status = ""
  row.pos_sale = posSale ? "1" : "0"
  row.source_name = "adapt"

  return { ...row, data_source: ADAPT_HISTORY_DATA_SOURCE }
}

export function mapAdaptInvoiceToDumpItemRows(
  input: AdaptDumpInvoiceInput,
  catalog: Map<string, AdaptCatalogHit> = new Map(),
): HistoricalInvoiceItemCsvRow[] {
  const { products, merchantCoupon, posSale } = splitAdaptLines(input.lineItems)
  const invoiceNo = input.salesInvoiceNo?.trim() || ""
  const invoiceTotal = amountToNumber(input.ttlAmount)
  const customerName = input.contact?.name?.trim() ?? ""
  const customerPhone = input.contact?.phoneNumber?.trim() || null
  const customerEmail = input.contact?.email?.trim() || null
  const locationName = input.locationName?.trim() ?? ""
  const paymentGateway = input.paymentMethod?.trim() ?? ""
  const financialStatus = input.financialStatus?.trim() || "paid"
  const merchantName = input.merchantKnownName?.trim() ?? ""

  return products.map((item) => {
    const qty = toNumber(item.quantity)
    const unitPrice = toNumber(item.unitPrice)
    const unitTotal = qty * unitPrice
    const catalogHit = matchAdaptCatalog(catalog, item.itemCode)
    const row = createOrderInvoiceItemRow({
      invoiceNo,
      erpInvoiceId: null,
      sourceName: "adapt",
      merchantCouponCode: merchantCoupon || null,
      couponCode: null,
      createdAt: input.invoiceDate,
      locationName,
      customerName,
      customerEmail,
      customerPhone,
      sku: item.itemCode?.trim() || "",
      barcode: catalogHit.barcode,
      brand: catalogHit.brand,
      productTitle: String(item.itemName ?? "").trim(),
      quantity: qty,
      unitPrice: money(unitPrice),
      discountedPrice: money(unitPrice),
      afterDiscountTotal: money(unitTotal),
      lineTotal: money(unitTotal),
      fulfillmentStage: "Completed",
      financialStatus,
      deliveryCompleteAt: null,
      deliveryCompleteBy: "",
      invoiceCompleteAt: input.invoiceDate,
      fulfillmentStatus: null,
      paymentGateway,
      merchantName,
      createdBy: "",
      kokoRefNumber: "",
    })

    row.status = "Completed"
    row.payment_status = financialStatus
    row.fulfillment_status = ""
    row.pos_sale = posSale ? "1" : "0"
    row.source_name = "adapt"
    row.grand_total = money(invoiceTotal)

    return { ...row, data_source: ADAPT_HISTORY_DATA_SOURCE }
  })
}

export function withCosmoDataSource<T extends Record<string, string>>(row: T): T & { data_source: string } {
  return { ...row, data_source: COSMO_OS_DATA_SOURCE }
}
