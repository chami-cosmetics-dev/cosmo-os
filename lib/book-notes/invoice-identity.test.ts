import { describe, expect, it } from "vitest";

import { resolveBookNoteSalesInvoice } from "@/lib/book-notes/invoice-identity";

describe("resolveBookNoteSalesInvoice", () => {
  it("prefers real erpnextInvoiceId", () => {
    expect(
      resolveBookNoteSalesInvoice({
        erpnextInvoiceId: "INV-500-00063",
        name: "other",
        orderNumber: "1",
      }),
    ).toBe("INV-500-00063");
  });

  it("skips pending placeholders", () => {
    expect(
      resolveBookNoteSalesInvoice({
        erpnextInvoiceId: "pending",
        name: "INV-500-00071",
      }),
    ).toBe("INV-500-00071");
  });

  it("falls back to orderNumber then shopifyOrderId", () => {
    expect(
      resolveBookNoteSalesInvoice({
        orderNumber: "900001",
        shopifyOrderId: "sid",
      }),
    ).toBe("900001");
    expect(resolveBookNoteSalesInvoice({ shopifyOrderId: "sid" })).toBe("sid");
  });
});
