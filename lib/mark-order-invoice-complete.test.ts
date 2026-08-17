import { describe, expect, it } from "vitest";

import { resolveInvoiceCompleteStamp } from "@/lib/mark-order-invoice-complete";

describe("resolveInvoiceCompleteStamp", () => {
  const now = new Date("2026-08-17T12:00:00.000Z");

  it("keeps finance approval stamp when closing fulfillment after delivery", () => {
    const financeAt = new Date("2026-08-06T03:40:47.000Z");
    expect(
      resolveInvoiceCompleteStamp({
        invoiceCompleteAt: financeAt,
        invoiceCompleteById: "finance-user",
        now,
        userId: "rider-user",
      }),
    ).toEqual({
      invoiceCompleteAt: financeAt,
      invoiceCompleteById: "finance-user",
    });
  });

  it("stamps now when finance never set invoice complete", () => {
    expect(
      resolveInvoiceCompleteStamp({
        invoiceCompleteAt: null,
        invoiceCompleteById: null,
        now,
        userId: "finance-user",
      }),
    ).toEqual({
      invoiceCompleteAt: now,
      invoiceCompleteById: "finance-user",
    });
  });

  it("ignores blank actor when stamp already exists", () => {
    const financeAt = new Date("2026-08-06T03:40:47.000Z");
    expect(
      resolveInvoiceCompleteStamp({
        invoiceCompleteAt: financeAt,
        invoiceCompleteById: "finance-user",
        now,
        userId: "  ",
      }),
    ).toEqual({
      invoiceCompleteAt: financeAt,
      invoiceCompleteById: "finance-user",
    });
  });
});
