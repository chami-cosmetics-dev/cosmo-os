import { describe, expect, it } from "vitest";

import {
  filterHandoverDeliveries,
  groupCashByErpCompany,
  groupDeliveriesByCompany,
  handoverCashAmount,
  resolveHandoverCollectCash,
  handoverExportCsv,
  handoverOrderNumber,
  handoverReceiptOverlaps,
  handoverSummaryCashAmount,
  isInvoiceClosed,
  latestReceiptForCompany,
  matchReceiptForDelivery,
  pageHandoverDeliveries,
  receiptCoversCompany,
  receiptDuplicateDecision,
  shouldCommitInvoiceComplete,
} from "@/lib/rider-handover";

describe("pageHandoverDeliveries", () => {
  const row = (orderNumber: string, company: string) => ({
    orderNumber,
    erpnextCompany: company,
    locationName: company,
    cashAmount: "100.00",
    paymentMethod: "cod" as const,
    paymentGatewayPrimary: "Cash",
    invoiceCompleteAt: null,
    fulfillmentStage: "delivery_complete" as const,
  });

  it("returns 20 rows and searches the whole list", () => {
    const deliveries = Array.from({ length: 25 }, (_, index) =>
      row(String(index + 1), index === 24 ? "Needle Co" : "Other Co"),
    );
    const first = pageHandoverDeliveries(deliveries, { page: 1 });
    expect(first.total).toBe(25);
    expect(first.deliveries).toHaveLength(20);
    expect(first.pageCount).toBe(2);

    const found = pageHandoverDeliveries(deliveries, { query: "needle", page: 1 });
    expect(found.total).toBe(1);
    expect(found.deliveries[0]?.orderNumber).toBe("25");
  });
});

describe("groupCashByErpCompany", () => {
  it("groups by ERP company, drops zero cash, and sums the full total", () => {
    const result = groupCashByErpCompany([
      {
        erpnextCompany: " Cosmetics ",
        locationName: "Shop A",
        payment: { paymentMethod: "cod", collectedAmount: 100 },
      },
      {
        erpnextCompany: "Other Co",
        locationName: "Shop B",
        payment: { paymentMethod: "cod", collectedAmount: 40 },
      },
      {
        erpnextCompany: "Card Co",
        locationName: "Shop C",
        payment: { paymentMethod: "card", collectedAmount: 80 },
      },
      {
        erpnextCompany: "Bank Co",
        locationName: "Shop D",
        payment: { paymentMethod: "bank_transfer", collectedAmount: 25 },
      },
      {
        erpnextCompany: null,
        locationName: "A Shop",
        payment: { paymentMethod: "cod", collectedAmount: 10 },
      },
      {
        erpnextCompany: "Cosmetics",
        locationName: "Shop A",
        payment: {
          paymentMethod: "card",
          collectedAmount: 150,
          lines: [
            { paymentMethod: "cod", amount: 100 },
            { paymentMethod: "card", amount: 50 },
          ],
        },
      },
      {
        erpnextCompany: "Empty",
        locationName: "Nowhere",
        payment: null,
      },
    ]);

    expect(result.companies).toEqual([
      { companyName: "A Shop", cashAmount: "10.00" },
      { companyName: "Cosmetics", cashAmount: "200.00" },
      { companyName: "Other Co", cashAmount: "40.00" },
    ]);
    expect(result.fullTotal).toBe("250.00");
  });
});

describe("handoverReceiptOverlaps", () => {
  it("shows a day 1 to day 2 handover on a later day 2 summary", () => {
    expect(
      handoverReceiptOverlaps({
        receiptFrom: "2026-10-08",
        receiptTo: "2026-10-09",
        from: "2026-10-09",
        to: "2026-10-09",
      }),
    ).toBe(true);
  });

  it("leaves a day 1 handover off a day 2 summary", () => {
    expect(
      handoverReceiptOverlaps({
        receiptFrom: "2026-10-08",
        receiptTo: "2026-10-08",
        from: "2026-10-09",
        to: "2026-10-09",
      }),
    ).toBe(false);
  });
});

describe("handoverSummaryCashAmount", () => {
  it("drops invoice-complete cash from the handover total", () => {
    expect(
      handoverSummaryCashAmount({
        cashAmount: "1715.00",
        invoiceCompleteAt: "2026-10-09T04:00:00.000Z",
        fulfillmentStage: "invoice_complete",
      }),
    ).toBe("0.00");
    expect(
      handoverSummaryCashAmount({
        cashAmount: "1715.00",
        invoiceCompleteAt: null,
        fulfillmentStage: "delivery_complete",
      }),
    ).toBe("1715.00");
  });
});

describe("handoverOrderNumber", () => {
  it("shows the Shopify number and the ERP invoice together", () => {
    expect(
      handoverOrderNumber({
        name: "#19938",
        orderNumber: "19938",
        erpnextInvoiceId: "600-019938",
        sourceName: "web",
      }),
    ).toBe("#19938 / 600-019938");
  });
});

describe("handoverCashAmount", () => {
  it("uses the order total when shipping is already included", () => {
    expect(
      handoverCashAmount({
        totalPrice: "11200.00",
        subtotalPrice: "10800.00",
        totalShipping: "400.00",
        paymentGatewayPrimary: "Cash",
      }).toFixed(2),
    ).toBe("11200.00");
  });

  it("adds shipping when the stored total is the order amount only", () => {
    expect(
      handoverCashAmount({
        totalPrice: "10800.00",
        subtotalPrice: "10800.00",
        totalShipping: "400.00",
        paymentGatewayPrimary: "Cash",
      }).toFixed(2),
    ).toBe("11200.00");
  });

  it("zeros cash while a rider bank-transfer change is pending finance", () => {
    expect(
      resolveHandoverCollectCash({
        totalPrice: "8000.00",
        paymentGatewayPrimary: "Cash on Delivery (COD)",
        pendingPaymentMethodChange: "bank_transfer",
      }).toFixed(2),
    ).toBe("0.00");
  });

  it("counts cash after finance or rider switches card-on-delivery to cash", () => {
    expect(
      resolveHandoverCollectCash({
        totalPrice: "8000.00",
        paymentGatewayPrimary: "Cash on Delivery (COD)",
      }).toFixed(2),
    ).toBe("8000.00");
  });

  it("collects the cash leg when KOKO is only part of the payment", () => {
    expect(
      resolveHandoverCollectCash({
        totalPrice: "8000.00",
        paymentGatewayPrimary: "KOKO",
        splitLines: [
          { paymentMethod: "koko", amount: 5000 },
          { paymentMethod: "cash", amount: 3000 },
        ],
      }).toFixed(2),
    ).toBe("3000.00");
  });

  it("leaves prepaid gateways at zero", () => {
    expect(
      handoverCashAmount({
        totalPrice: "4500.00",
        totalShipping: "400.00",
        paymentGatewayPrimary: "KOKO",
      }).toFixed(2),
    ).toBe("0.00");
    expect(
      handoverCashAmount({
        totalPrice: "4500.00",
        totalShipping: "400.00",
        paymentGatewayPrimary: "CC Checkout",
      }).toFixed(2),
    ).toBe("0.00");
  });
});

describe("receiptDuplicateDecision", () => {
  const existing = { id: "r1", fullTotal: "10.00" };

  it("creates when nothing was stored", () => {
    expect(receiptDuplicateDecision({ existing: null, confirmDuplicate: false })).toEqual({
      action: "create",
    });
  });

  it("rejects a second mark until confirm", () => {
    expect(receiptDuplicateDecision({ existing, confirmDuplicate: false })).toEqual({
      action: "reject",
      existing,
    });
  });

  it("creates another row after confirm", () => {
    expect(receiptDuplicateDecision({ existing, confirmDuplicate: true })).toEqual({
      action: "create",
    });
  });
});

describe("isInvoiceClosed", () => {
  it("is true when the stamp or the invoice-complete stage is set", () => {
    expect(isInvoiceClosed({ invoiceCompleteAt: new Date(), fulfillmentStage: "delivery_complete" })).toBe(
      true,
    );
    expect(isInvoiceClosed({ invoiceCompleteAt: null, fulfillmentStage: "invoice_complete" })).toBe(true);
    expect(isInvoiceClosed({ invoiceCompleteAt: null, fulfillmentStage: "delivery_complete" })).toBe(false);
  });
});

describe("shouldCommitInvoiceComplete", () => {
  it("commits only after a payment entry is created or the invoice is already paid", () => {
    expect(shouldCommitInvoiceComplete("created")).toBe(true);
    expect(shouldCommitInvoiceComplete("already_paid")).toBe(true);
    expect(shouldCommitInvoiceComplete("skipped")).toBe(false);
    expect(shouldCommitInvoiceComplete("error")).toBe(false);
  });
});

describe("finance company scope", () => {
  it("keeps only the finance user's locations and groups those companies", () => {
    const deliveries = [
      { locationId: "loc-pevi", erpnextCompany: "Pevi Trading Lanka (Pvt) Ltd", locationName: "Pevi" },
      { locationId: "loc-kad", erpnextCompany: "KAD Trading (Pvt) Ltd", locationName: "KAD" },
      { locationId: "loc-pevi", erpnextCompany: null, locationName: "Pevi Shop" },
    ];
    const visible = filterHandoverDeliveries(deliveries, ["loc-pevi"]);
    expect(visible).toHaveLength(2);
    expect(groupDeliveriesByCompany(visible).map((group) => group.companyName)).toEqual([
      "Pevi Shop",
      "Pevi Trading Lanka (Pvt) Ltd",
    ]);
    expect(filterHandoverDeliveries(deliveries, null)).toHaveLength(3);
  });

  it("matches a company receipt and leaves another company open", () => {
    const pevi = {
      receivedAt: "2026-10-15T04:00:00.000Z",
      handoverCompany: "Pevi Trading Lanka (Pvt) Ltd",
      companies: [{ companyName: "Pevi Trading Lanka (Pvt) Ltd", cashAmount: "100.00" }],
      periodFrom: "2026-10-15",
      periodTo: "2026-10-15",
    };
    const legacy = {
      receivedAt: "2026-10-14T04:00:00.000Z",
      handoverCompany: null,
      companies: [{ companyName: "KAD Trading (Pvt) Ltd", cashAmount: "50.00" }],
      periodFrom: "2026-10-14",
      periodTo: "2026-10-14",
    };
    expect(receiptCoversCompany(pevi, "Pevi Trading Lanka (Pvt) Ltd")).toBe(true);
    expect(receiptCoversCompany(pevi, "KAD Trading (Pvt) Ltd")).toBe(false);
    expect(receiptCoversCompany(legacy, "KAD Trading (Pvt) Ltd")).toBe(true);
    expect(latestReceiptForCompany([legacy, pevi], "Pevi Trading Lanka (Pvt) Ltd")?.receivedAt).toBe(pevi.receivedAt);
    expect(
      matchReceiptForDelivery([pevi], "Pevi Trading Lanka (Pvt) Ltd", new Date("2026-10-15T05:00:00.000Z"))
        ?.receivedAt,
    ).toBe(pevi.receivedAt);
    expect(
      matchReceiptForDelivery([pevi], "KAD Trading (Pvt) Ltd", new Date("2026-10-15T05:00:00.000Z")),
    ).toBeNull();
  });

  it("writes delivery and invoice times into the admin export", () => {
    const csv = handoverExportCsv([
      {
        riderName: "Amal",
        companyName: "Pevi Trading Lanka (Pvt) Ltd",
        orderNumber: "900-001421",
        cashAmount: "2500.00",
        deliveredAt: new Date("2026-10-15T05:30:00.000Z"),
        invoiceCompleteAt: new Date("2026-10-15T06:10:00.000Z"),
        receivedByName: "Nimal",
        receivedAt: new Date("2026-10-15T07:00:00.000Z"),
      },
    ]);
    expect(csv).toContain("Delivery complete");
    expect(csv).toContain("Invoice complete");
    expect(csv).toContain("Money received by");
    expect(csv).toContain("Pevi Trading Lanka (Pvt) Ltd");
    expect(csv).toContain("Nimal");
    expect(csv).toContain("900-001421");
  });
});
