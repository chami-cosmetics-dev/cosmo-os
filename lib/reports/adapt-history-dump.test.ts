import { Prisma } from "@prisma/client"
import { describe, expect, it } from "vitest"

import {
  ADAPT_HISTORY_DATA_SOURCE,
  COSMETICS_IMPORT_DATA_SOURCE,
  COSMO_OS_DATA_SOURCE,
  FILE_IMPORT_DATA_SOURCE,
  adaptDumpSourceLabels,
  buildAdaptCatalogMap,
  classifyAdaptLine,
  getHistoricalOrderInvoiceCsvHeaders,
  getHistoricalOrderInvoiceItemCsvHeaders,
  inferBrandFromProductTitle,
  mapAdaptInvoiceToDumpInvoiceRow,
  mapAdaptInvoiceToDumpItemRows,
  matchAdaptCatalog,
  normalizeAdaptSku,
  parseHistoricalDumpCursor,
  resolveDumpBrand,
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
      { sku: "SSP_160", barcode: "333", vendorName: "Ordinary" },
    ])
    expect(normalizeAdaptSku("SSP - 160")).toBe("SSP_160")
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
    expect(matchAdaptCatalog(catalog, "SSP - 160")).toMatchObject({
      barcode: "333",
      brand: "Ordinary",
      match: "exact",
    })
    expect(matchAdaptCatalog(catalog, "MISSING")).toMatchObject({ match: "none" })
  })

  it("infers brand from product title when catalog brand is blank", () => {
    expect(inferBrandFromProductTitle("THE ORDINARY Niacinamide 30ml", ["OGX", "The Ordinary"])).toBe(
      "The Ordinary",
    )
    expect(
      resolveDumpBrand({
        catalogBrand: "",
        productTitle: "OGX Coconut Curls Conditioner 385ml*OI",
        vendorNames: ["OGX", "Cantu"],
      }),
    ).toBe("OGX")
  })

  it("matches hyphen ERP sku to underscore Cosmo catalog brand", () => {
    const catalog = buildAdaptCatalogMap([
      { sku: "BV001_1", barcode: null, vendorName: "Beauty Vault" },
    ])
    const hit = matchAdaptCatalog(catalog, "BV001-1")
    expect(hit.brand).toBe("Beauty Vault")
    expect(
      resolveDumpBrand({
        catalogBrand: hit.brand,
        productTitle: "Beauty Vault Lumi 24H Glutathione 60 Capsules",
        vendorNames: [],
      }),
    ).toBe("Beauty Vault")
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
      salesInvoiceMasterId: "102222",
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
        { itemCode: "MISS*OI", itemName: "OGX Coconut Curls Conditioner 385ml*OI", unitPrice: "50", quantity: 1 },
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
    expect(invoice.erp_invoice_id).toBe("102222")
    expect(invoice.source_name).toBe("adapt")
    expect(invoice.item_count).toBe("2")
    expect(invoice.grand_total).toBe("250.00")
    expect(invoice.shipping_total).toBe("50.00")
    expect(invoice.coupon_code).toBe("MER9")
    expect(invoice.customer_phone).toBe("771111111")
    expect(invoice.last_purchase_date).toBe("")
    expect(invoice.allocated_merchant).toBe("")
    expect(invoice.pos_sale).toBe("0")

    const items = mapAdaptInvoiceToDumpItemRows(input, catalog, ["OGX", "Cantu"])
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      data_source: ADAPT_HISTORY_DATA_SOURCE,
      invoice_no: "ADAPT-1",
      erp_invoice_id: "102222",
      sku: "SKU_1",
      barcode: "B1",
      brand: "Brand",
      quantity: "2",
      unit_price: "100.00",
      after_discount_total: "200.00",
      grand_total: "250.00",
      source_name: "adapt",
      last_purchase_date: "",
      allocated_merchant: "",
    })
    expect(items[1]).toMatchObject({
      sku: "MISS*OI",
      brand: "OGX",
      erp_invoice_id: "102222",
    })
  })

  it("skips Adapt N/A paymentMethod and uses cash/card context", () => {
    const invoice = mapAdaptInvoiceToDumpInvoiceRow({
      salesInvoiceNo: "ADAPT-NA",
      invoiceDate: new Date("2019-06-15T10:00:00+05:30"),
      ttlAmount: new Prisma.Decimal("100.00"),
      locationName: "Colombo",
      paymentMethod: "N/A",
      rawPaymentContext: { cash: 100, card: null },
      merchantKnownName: null,
      financialStatus: "paid",
      lineItems: [{ itemCode: "SKU_1", itemName: "Serum", unitPrice: "100", quantity: 1 }],
      contact: null,
    })
    expect(invoice.payment_gateway).toBe("Cash")
    expect(invoice.payment_status).toBe("paid")
  })

  it("labels Cosmo rows with Cosmo OS data_source", () => {
    expect(withCosmoDataSource({ invoice_no: "1" })).toEqual({
      invoice_no: "1",
      data_source: COSMO_OS_DATA_SOURCE,
    })
  })

  it("labels File import and Cosmetics origins in dump source columns", () => {
    expect(adaptDumpSourceLabels("vault_file_import")).toEqual({
      sourceName: "File import",
      dataSource: FILE_IMPORT_DATA_SOURCE,
    })
    expect(adaptDumpSourceLabels("vault_supplement_import", "vsupp-direct-1")).toEqual({
      sourceName: "Cosmetics",
      dataSource: COSMETICS_IMPORT_DATA_SOURCE,
    })
    expect(adaptDumpSourceLabels("adapt")).toEqual({
      sourceName: "adapt",
      dataSource: ADAPT_HISTORY_DATA_SOURCE,
    })

    const fileInvoice = mapAdaptInvoiceToDumpInvoiceRow({
      salesInvoiceNo: "60014479",
      invoiceDate: new Date("2026-03-01T10:00:00+05:30"),
      ttlAmount: new Prisma.Decimal("6000"),
      locationName: "Cosmetics.lk New Web",
      paymentMethod: "Cash on Delivery (COD)",
      merchantKnownName: "DM - General",
      financialStatus: "completed",
      origin: "vault_file_import",
      importBatchId: "vsupp-1795856956685",
      lineItems: [{ itemCode: "NW017-2", itemName: "Nature Way", unitPrice: "6000", quantity: 1 }],
      contact: {
        name: "Test",
        phoneNumber: "0713329839",
        lastPurchaseAt: new Date("2026-03-01T00:00:00+05:30"),
        assignedMerchant: "Sandali(MER91)",
      },
    })
    expect(fileInvoice.source_name).toBe("File import")
    expect(fileInvoice.data_source).toBe(FILE_IMPORT_DATA_SOURCE)
    expect(fileInvoice.last_purchase_date).toBe("2026-03-01")
    expect(fileInvoice.allocated_merchant).toBe("Sandali(MER91)")

    const fileItems = mapAdaptInvoiceToDumpItemRows({
      salesInvoiceNo: "60014479",
      invoiceDate: new Date("2026-03-01T10:00:00+05:30"),
      ttlAmount: new Prisma.Decimal("6000"),
      locationName: "Cosmetics.lk New Web",
      paymentMethod: "Cash on Delivery (COD)",
      merchantKnownName: "DM - General",
      financialStatus: "completed",
      origin: "vault_file_import",
      importBatchId: "vsupp-1795856956685",
      lineItems: [{ itemCode: "NW017-2", itemName: "Nature Way", unitPrice: "6000", quantity: 1 }],
      contact: {
        name: "Test",
        phoneNumber: "0713329839",
        lastPurchaseAt: new Date("2026-03-01T00:00:00+05:30"),
        assignedMerchant: "Sandali(MER91)",
      },
    })
    expect(fileItems[0]?.source_name).toBe("File import")
    expect(fileItems[0]?.data_source).toBe(FILE_IMPORT_DATA_SOURCE)
    expect(fileItems[0]?.last_purchase_date).toBe("2026-03-01")
    expect(fileItems[0]?.allocated_merchant).toBe("Sandali(MER91)")
  })
})
