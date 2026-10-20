import { describe, expect, it } from "vitest";

import {
  MASTER_DUMP_VAULT_SOURCE,
  MASTER_ITEM_HEADERS,
  MASTER_ORDER_HEADERS,
  createMasterHistoryOrderRow,
  createMasterItemRows,
  createMasterOrderRow,
  enrichMasterDumpHistoryLine,
  masterDumpDeliveryResult,
  masterDumpFocusStatus,
  masterDumpHistoryLines,
  masterDumpShippingService,
  type MasterOrderReportInput,
} from "@/lib/reports/master-dump";

function orderInput(overrides: Partial<MasterOrderReportInput> = {}): MasterOrderReportInput {
  return {
    orderId: "#1001",
    erpInvoiceId: "SI-100",
    shopifyOrderId: "9001",
    sourceName: "web",
    salesLocation: "Colombo 03",
    company: "Cosmetics.lk",
    posProfile: "",
    posWarehouse: "",
    createdAt: new Date("2026-10-16T04:30:00.000Z"),
    createdBy: "staff@example.com",
    customerName: "Buyer",
    customerPhone: "0771234567",
    shippingPhone: "0771234567",
    customerEmail: "buyer@example.com",
    shippingAddress: "12 Galle Rd",
    billingAddress: "12 Galle Rd",
    postCode: "00300",
    district: "Colombo",
    contactName: "Buyer",
    contactPhones: "0771234567",
    contactEmails: "buyer@example.com",
    customerType: "Retail",
    callCategory: "N/A",
    contactDistrict: "Colombo",
    zone: "Zone A",
    area: "",
    town: "",
    city: "Colombo",
    address: "12 Galle Rd",
    country: "Sri Lanka",
    gender: "",
    language: "",
    occupation: "",
    workPlace: "",
    assignedMerchant: "Sandali",
    recentMerchant: "Sandali",
    contactSource: "shopify",
    origin: "",
    whatsappAllowed: "Yes",
    loyaltyTier: "",
    loyaltyOutreach: "",
    contactRemarks: "",
    subtotal: "5000.00",
    discounts: "0.00",
    tax: "0.00",
    shipping: "350.00",
    grandTotal: "5350.00",
    currency: "LKR",
    itemCount: "1",
    coupon: "MER91,SV20",
    merchant: "Sandali",
    promoCodeOwner: "Nimal",
    discountApplications: [{ description: "20% off skincare" }],
    paymentMethod: "Cash",
    paymentStatus: "paid",
    kokoRef: "",
    kokoLinkAt: null,
    kokoConfirmedBy: "",
    kokoConfirmedAt: null,
    fulfillmentStage: "dispatched",
    stageEnteredAt: new Date("2026-10-16T06:00:00.000Z"),
    websiteStatus: "fulfilled",
    deliveryResult: "",
    sampleAddedBy: "Merchant",
    sampleAddedAt: new Date("2026-10-16T04:45:00.000Z"),
    sampleCompleteBy: "",
    sampleCompleteAt: null,
    sampleSendLaterAt: null,
    printCount: "1",
    printedBy: "Packer",
    printedAt: new Date("2026-10-16T05:00:00.000Z"),
    pickListAt: null,
    holdReason: "",
    onHoldAt: null,
    processBy: "Packer",
    processAt: new Date("2026-10-16T05:30:00.000Z"),
    dispatchBy: "Dispatch Staff",
    dispatchAt: new Date("2026-10-16T06:00:00.000Z"),
    shippingService: "Rider A",
    shippingRule: "Colombo 3",
    waybillNo: "",
    riderStatus: "Assigned",
    latestRiderUpdateAt: null,
    deliveryCompleteBy: "",
    deliveryCompleteAt: null,
    collectedAmount: "",
    collectionMethod: "",
    invoiceCompleteBy: "",
    invoiceCompleteAt: null,
    revertedAt: null,
    revertedBy: "",
    cancelledAt: null,
    cancelledBy: "",
    cancelReason: "",
    cancelKind: "",
    replacedByOrder: "",
    returnStatus: "",
    returnDate: null,
    returnRemark: "",
    exchangeStatus: "",
    exchangeReason: "",
    remarks: [
      {
        stage: "order_received",
        type: "internal",
        content: "Called customer",
        createdAt: new Date("2026-10-16T04:40:00.000Z"),
      },
    ],
    customerNote: "Leave at gate",
    merchantReviewStatus: "",
    merchantReviewNote: "",
    erpSyncStatus: "Synced",
    erpSyncError: "",
    ogfSyncedAt: null,
    ogfBatch: "",
    ogfError: "",
    ...overrides,
  };
}

describe("master reports", () => {
  it("keeps order and item headers apart", () => {
    expect(MASTER_ORDER_HEADERS).toContain("SHIPPING SERVICE");
    expect(MASTER_ORDER_HEADERS).not.toContain("DISPATCH RIDER");
    expect(MASTER_ORDER_HEADERS).not.toContain("ITEM CODE");
    expect(MASTER_ITEM_HEADERS).toContain("ORDER ID");
    expect(MASTER_ITEM_HEADERS).toContain("FOCUS/NON FOCUS");
    expect(MASTER_ITEM_HEADERS).not.toContain("CUSTOMER NAME");
  });

  it("puts rider, courier, and pickup in shipping service", () => {
    expect(masterDumpShippingService({
      sourceName: "web",
      locationName: "Store",
      dispatchedToCustomer: false,
      riderName: "Rider A",
      courierName: "Citypack",
    })).toBe("Rider A");
    expect(masterDumpShippingService({
      sourceName: "web",
      locationName: "Store",
      dispatchedToCustomer: false,
      riderName: "",
      courierName: "Citypack",
    })).toBe("Citypack");
    expect(masterDumpShippingService({
      sourceName: "web",
      locationName: "Store",
      dispatchedToCustomer: true,
      riderName: "Rider A",
      courierName: "Citypack",
    })).toBe("Customer pickup");
  });

  it("folds a failed delivery reason into delivery result", () => {
    expect(masterDumpDeliveryResult({
      deliveryOutcome: "failed",
      deliveryFailedReason: "Customer not home",
      riderFailureReason: null,
      deliveryCompleteAt: null,
    })).toBe("Failed: Customer not home");
    expect(masterDumpDeliveryResult({
      deliveryOutcome: null,
      deliveryFailedReason: null,
      riderFailureReason: null,
      deliveryCompleteAt: new Date("2026-10-16T08:00:00.000Z"),
    })).toBe("Delivered");
  });

  it("fills the order row and leaves item columns off it", () => {
    const row = createMasterOrderRow(orderInput());
    expect(row["ORDER ID"]).toBe("#1001");
    expect(row.SOURCE).toBe("Shopify");
    expect(row["SHIPPING SERVICE"]).toBe("Rider A");
    expect(row["CALL CENTER NOTE"]).toBe("Order Received: Called customer");
    expect(row["CUSTOMER NOTE"]).toBe("Leave at gate");
    expect(row["PROMO DESCRIPTION"]).toBe("20% off skincare");
    expect(row["FULFILLMENT STAGE"]).toBe("Dispatched");
    expect(Object.keys(row).sort()).toEqual([...MASTER_ORDER_HEADERS].sort());
  });

  it("uses priority status on the item row and falls back to ERP priority", () => {
    const [row] = createMasterItemRows({
      orderId: "#1001",
      erpInvoiceId: "SI-100",
      lines: [{
        sku: "SKU-1",
        barcode: "123",
        productTitle: "Serum",
        quantity: 2,
        unitPrice: "2500.00",
        discountPercent: "",
        lineTotal: "5000.00",
        brand: "Brand X",
        categoryName: "Skin",
        itemStatusCategory: "UNCATEGORIZED",
        itemStatusLabel: "Top Priority Brand - Priority Product",
        erp1ProductPriority: "Discontinue",
        erp2ProductPriority: null,
        taxStatus: "Vat",
      }],
    });
    expect(row["FOCUS/NON FOCUS"]).toBe("Top Priority Brand - Priority Product");
    expect(row["TAX STATUS"]).toBe("Vat");
    expect(row["ORDER ID"]).toBe("#1001");
    expect(Object.keys(row).sort()).toEqual([...MASTER_ITEM_HEADERS].sort());
    expect(masterDumpFocusStatus({
      itemStatusCategory: "UNCATEGORIZED",
      itemStatusLabel: null,
      erp1ProductPriority: "Top Priority",
      erp2ProductPriority: null,
    })).toBe("Top Priority");
  });

  it("maps imported Vault OS history onto the order and item sheets", () => {
    const row = createMasterHistoryOrderRow({
      salesInvoiceNo: "VOS-88",
      salesInvoiceMasterId: "M-88",
      invoiceDate: new Date("2024-03-15T00:00:00.000Z"),
      ttlAmount: "30000.00",
      currency: "LKR",
      locationName: "Vault Store",
      companyName: "Vault OS",
      paymentMethod: null,
      financialStatus: "paid",
      merchantKnownName: "Kamal",
      rawPaymentContext: { cash: "30000" },
      lineItems: [
        {
          id: "vsupp:1:SV-WHEY-1KG",
          itemCode: "SV-WHEY-1KG",
          itemName: "Whey Protein 1kg",
          quantity: 2,
          unitPrice: "15000",
          lineAmount: "30000",
          itemId: null,
        },
      ],
      contact: {
        name: "Nimal Perera",
        phoneNumber: "0771234567",
        email: "nimal@example.com",
        extraPhones: [],
        extraEmails: [],
        customerType: "Retail",
        callCategory: "N/A",
        district: "Colombo",
        zone: "Zone A",
        area: "",
        town: "",
        city: "Colombo",
        address: "12 Galle Rd",
        country: "Sri Lanka",
        gender: null,
        language: null,
        occupation: null,
        workPlace: null,
        assignedMerchant: null,
        recentMerchant: null,
        source: "vault-supplement-import",
        origin: null,
        whatsappAllowed: true,
        loyaltyTier: null,
        loyaltyOutreach: null,
        remarks: null,
      },
    });
    expect(row.SOURCE).toBe(MASTER_DUMP_VAULT_SOURCE);
    expect(row["ORDER ID"]).toBe("VOS-88");
    expect(row["GRAND TOTAL"]).toBe("30000.00");
    expect(row["PAYMENT METHOD"]).toBe("Cash");
    expect(row["ITEM COUNT"]).toBe("1");
    expect(row["CUSTOMER NAME"]).toBe("Nimal Perera");

    const [line] = masterDumpHistoryLines([
      {
        id: "vsupp:1:SV-WHEY-1KG",
        itemCode: "SV-WHEY-1KG",
        itemName: "Whey Protein 1kg",
        quantity: 2,
        unitPrice: "15000",
        lineAmount: "30000",
        itemId: null,
      },
    ]);
    const enriched = enrichMasterDumpHistoryLine(line, new Map([
      ["sv-whey-1kg", {
        sku: "SV-WHEY-1KG",
        barcode: "111",
        brand: "Brand X",
        categoryName: "Protein",
        itemStatusCategory: "CONTINUE",
        itemStatusLabel: null,
        erp1ProductPriority: null,
        erp2ProductPriority: null,
        taxStatus: "Vat",
      }],
    ]));
    expect(enriched.brand).toBe("Brand X");
    expect(enriched.taxStatus).toBe("Vat");
    expect(enriched.lineTotal).toBe("30000");
  });
});
