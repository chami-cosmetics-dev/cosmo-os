import { describe, expect, it } from "vitest";

import {
  createCsvRowCounter,
  dumpProgressPercent,
  parseContentDispositionFilename,
  parseDumpTotalHeader,
} from "@/lib/reports/dump-download";
import { createOrderInvoiceRow, joinDumpCouponCodes, resolveDumpCompletedAt } from "@/lib/reports/order-dump";
import { getOrderDiscountCouponCode } from "@/lib/order-discount-coupon";
import { getMerchantCouponCode } from "@/lib/order-merchant-coupon";

describe("joinDumpCouponCodes", () => {
  it("joins POS merchant + customer coupons without duplicates", () => {
    const merchant = getMerchantCouponCode({
      sourceName: "erpnext-pos",
      discountCodes: [
        { code: "SV20" },
        { code: "MER99-Dinuli", amount: 0 },
      ],
      rawPayload: {
        data: {
          coupon_code: "SV20",
          custom_merchant_coupon_code: "MER99-Dinuli",
        },
      },
    });
    const discount = getOrderDiscountCouponCode({
      sourceName: "erpnext-pos",
      discountCodes: [
        { code: "SV20" },
        { code: "MER99-Dinuli", amount: 0 },
      ],
      rawPayload: {
        data: {
          coupon_code: "SV20",
          custom_merchant_coupon_code: "MER99-Dinuli",
        },
      },
    });

    expect(merchant).toBe("MER99-Dinuli");
    expect(discount).toBe("SV20");
    expect(joinDumpCouponCodes(merchant, discount)).toBe("MER99-Dinuli,SV20");
  });

  it("keeps a POS customer coupon when no merchant code exists", () => {
    expect(
      joinDumpCouponCodes(
        getMerchantCouponCode({
          sourceName: "erpnext-pos",
          discountCodes: [{ code: "June15" }],
          rawPayload: { coupon_code: "June15" },
        }),
        getOrderDiscountCouponCode({
          sourceName: "erpnext-pos",
          discountCodes: [{ code: "June15" }],
          rawPayload: { coupon_code: "June15" },
        }),
      ),
    ).toBe("June15");
  });
});

describe("resolveDumpCompletedAt", () => {
  const invoiceAt = new Date("2026-10-04T06:46:44.000Z");
  const deliveryAt = new Date("2026-10-11T08:15:00.000Z");

  it("uses delivery complete when invoice complete was earlier", () => {
    expect(
      resolveDumpCompletedAt({
        deliveryCompleteAt: deliveryAt,
        invoiceCompleteAt: invoiceAt,
      }),
    ).toBe(deliveryAt);
  });

  it("keeps invoice complete when it is after delivery", () => {
    expect(
      resolveDumpCompletedAt({
        deliveryCompleteAt: invoiceAt,
        invoiceCompleteAt: deliveryAt,
      }),
    ).toBe(deliveryAt);
  });

  it("keeps the early invoice stamp until delivery exists", () => {
    expect(
      resolveDumpCompletedAt({
        deliveryCompleteAt: null,
        invoiceCompleteAt: invoiceAt,
      }),
    ).toBe(invoiceAt);
  });
});

describe("createOrderInvoiceRow completed columns", () => {
  it("writes delivery date and time into completed columns when invoice was early", () => {
    const row = createOrderInvoiceRow({
      invoiceNo: "6001",
      erpInvoiceId: null,
      sourceName: "web",
      merchantCouponCode: null,
      merchantName: "",
      fulfillmentStage: "invoice_complete",
      financialStatus: "paid",
      shippingService: "",
      createdAt: new Date("2026-10-01T04:00:00.000Z"),
      companyName: "Cosmo",
      posProfile: null,
      posWarehouse: null,
      customerName: "Ada",
      customerEmail: null,
      customerPhone: null,
      shippingPhone: null,
      billingAddress: "",
      shippingAddress: "",
      fulfillmentStatus: "fulfilled",
      paymentGateway: "koko",
      subtotalPrice: "100",
      discounts: "0",
      shippingTotal: "0",
      grandTotal: "100",
      itemCount: 1,
      printCount: 1,
      packageReadyAt: null,
      dispatchedAt: null,
      dispatchedBy: "",
      lastPrintedAt: null,
      lastPrintedBy: "",
      revertedFromInvoiceCompleteAt: null,
      deliveryCompleteAt: new Date("2026-10-11T08:15:00.000Z"),
      deliveryCompleteBy: "Rider",
      invoiceCompleteAt: new Date("2026-10-04T06:46:44.000Z"),
      invoiceCompleteBy: "Finance",
      shippingRule: null,
      createdBy: "",
    });

    expect(row.status).toBe("Completed");
    expect(row.completed_date).toBe("2026-10-11");
    expect(row.completed_time).toBe("13:45:00");
    expect(row.delivery_completed_date).toBe("2026-10-11");
    expect(row.completed_by).toBe("Finance");
  });
});

describe("dump download progress", () => {
  it("counts CSV data rows ignoring quoted newlines", () => {
    const counter = createCsvRowCounter();
    counter.consume("INVOICE_NO,ADDRESS\r\n");
    counter.consume('6001,"Line 1\r\nLine 2"\r\n6002,Colombo\r\n');
    expect(counter.dataRows()).toBe(2);
  });

  it("caps in-progress percent below 100", () => {
    expect(dumpProgressPercent(9, 10)).toBe(90);
    expect(dumpProgressPercent(10, 10)).toBe(99);
    expect(parseDumpTotalHeader("250")).toBe(250);
    expect(parseContentDispositionFilename('attachment; filename="utility-order-invoice-last-90.csv"')).toBe(
      "utility-order-invoice-last-90.csv",
    );
  });
});
