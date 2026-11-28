import { Prisma } from "@prisma/client"
import { describe, expect, it } from "vitest"

import {
  ADAPT_HISTORY_DATA_SOURCE,
  COSMO_OS_DATA_SOURCE,
  buildAdaptCatalogMap,
  classifyAdaptLine,
  getHistoricalOrderInvoiceCsvHeaders,
  getHistoricalOrderInvoiceItemCsvHeaders,
  mapAdaptInvoiceToDumpInvoiceRow,
  mapAdaptInvoiceToDumpItemRows,
  matchAdaptCatalog,
  parseHistoricalDumpCursor,
  splitAdaptLines,
  withCosmoDataSource,
} from "@/lib/reports/adapt-history-dump"
import { getOrderInvoiceCsvHeaders, getOrderInvoiceItemCsvHeaders } from "@/lib/reports/order-dump"

describe("adapt-history-dump", () => {
  it("classifies adapt line codes", () => {
    expect(classifyAdaptLine({ itemCode: "coupon" })).toBe("coupon")
    expect(classifyAdaptLine({ itemCode: "SHIPPING" })).toBe("shipping")
    expect(classifyAdaptLine({ itemCode: "fee" })).toBe("fee")
    expect(classifyAdaptLine({ itemCode: "SKU_1" })).toBe("product")
  })

  it("splits coupon shipping fee away from product lines", () => {
    const split = splitAdaptLines([
      { itemCode: "coupon", itemName: "MER123", unitPrice: "0", quantity: 1 },
      { itemCode: "shipping", itemName: "Store Pickup", unitPrice: "0", quantity: 1 },
      { itemCode: "fee", itemName: "Fee", unitPrice: "10", quantity: 1 },
      { itemCode: "SKU_1", itemName: "Serum", unitPrice: "100", quantity: 2 },
    ])
    expect(split.merchantCoupon).toBe("MER123")
    expect(split.posSale).toBe(true)
    expect(split.products).toHaveLength(1)
    expect(split.products[0]?.itemCode).toBe("SKU_1")
  })

  it("matches catalog exact and OI mapped skus", () => {
    const catalog = buildAdaptCatalogMap([
      { sku: "ACN03_1", barcode: "111", vendorName: "Brand A" },
      { sku: "JOV65_1", barcode: "222", vendorName: "Brand B" },
    ])
    expect(matchAdaptCatalog(catalog, "acn03-1")).toMatchObject({
      barcode: "111",
      brand: "Brand A",
      match: "exact",
    })
    expect(matchAdaptCatalog(catalog, "JOV65*OI")).toMatchObject({
      barcode: "222",
      brand: "Brand B",
      match: "oi_mapped_to_1",
    })
    expect(matchAdaptCatalog(catalog, "MISSING")).toMatchObject({ match: "none" })
  })

  it("adds data_source to historical headers only", () => {
    expect(getHistoricalOrderInvoiceCsvHeaders().at(-1)).toBe("data_source")
    expect(getHistoricalOrderInvoiceItemCsvHeaders().at(-1)).toBe("data_source")
    expect(getHistoricalOrderInvoiceCsvHeaders()).toEqual([
      ...getOrderInvoiceCsvHeaders(),
      "data_source",
    ])
    expect(getHistoricalOrderInvoiceItemCsvHeaders()).toEqual([
      ...getOrderInvoiceItemCsvHeaders(),
      "data_source",
    ])
  })

  it("parses two-phase dump cursors", () => {
    expect(parseHistoricalDumpCursor("")).toEqual({ phase: "adapt", id: "" })
    expect(parseHistoricalDumpCursor("a:abc")).toEqual({ phase: "adapt", id: "abc" })
    expect(parseHistoricalDumpCursor("o:")).toEqual({ phase: "order", id: "" })
    expect(parseHistoricalDumpCursor("o:xyz")).toEqual({ phase: "order", id: "xyz" })
    expect(parseHistoricalDumpCursor("legacy-id")).toEqual({ phase: "order", id: "legacy-id" })
  })

  it("maps adapt invoice and item dump rows with Adapt history label", () => {
    const catalog = buildAdaptCatalogMap([
      { sku: "SKU_1", barcode: "B1", vendorName: "Brand" },
    ])
    const input = {
      salesInvoiceNo: "ADAPT-1",
      invoiceDate: new Date("2019-06-15T10:00:00+05:30"),
      ttlAmount: new Prisma.Decimal("250.00"),
      locationName: "Colombo",
      paymentMethod: "Cash",
      merchantKnownName: "Merchant",
      financialStatus: "paid",
      lineItems: [
        { itemCode: "coupon", itemName: "MER9", unitPrice: "0", quantity: 1 },
        { itemCode: "shipping", itemName: "Courier", unitPrice: "50", quantity: 1 },
        { itemCode: "SKU_1", itemName: "Serum", unitPrice: "100", quantity: 2 },
      ],
      contact: {
        name: "Ada",
        phoneNumber: "0771111111",
        email: "ada@example.com",
        address: "1 Main St",
      },
    }

    const invoice = mapAdaptInvoiceToDumpInvoiceRow(input, catalog)
    expect(invoice.data_source).toBe(ADAPT_HISTORY_DATA_SOURCE)
    expect(invoice.invoice_no).toBe("ADAPT-1")
    expect(invoice.source_name).toBe("adapt")
    expect(invoice.item_count).toBe("1")
    expect(invoice.grand_total).toBe("250.00")
    expect(invoice.shipping_total).toBe("50.00")
    expect(invoice.coupon_code).toBe("MER9")
    expect(invoice.customer_phone).toBe("0771111111")
    expect(invoice.pos_sale).toBe("0")

    const items = mapAdaptInvoiceToDumpItemRows(input, catalog)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      data_source: ADAPT_HISTORY_DATA_SOURCE,
      invoice_no: "ADAPT-1",
      sku: "SKU_1",
      barcode: "B1",
      brand: "Brand",
      quantity: "2",
      unit_price: "100.00",
      after_discount_total: "200.00",
      grand_total: "250.00",
      source_name: "adapt",
    })
  })

  it("labels Cosmo rows with Cosmo OS data_source", () => {
    expect(withCosmoDataSource({ invoice_no: "1" })).toEqual({
      invoice_no: "1",
      data_source: COSMO_OS_DATA_SOURCE,
    })
  })
})
