import { describe, expect, it } from "vitest";

import {
  buildKokoOrderErpRow,
  customerLabelForKokoOrder,
} from "@/lib/koko-orders/erp-sync";

describe("customerLabelForKokoOrder", () => {
  it("prefers customerPhone", () => {
    expect(
      customerLabelForKokoOrder({
        customerPhone: "0774223062",
        shippingAddress: { phone: "0112000000", first_name: "Rameesh" },
      }),
    ).toBe("0774223062");
  });

  it("falls back to shipping phone then name", () => {
    expect(
      customerLabelForKokoOrder({
        customerPhone: null,
        shippingAddress: { phone: "0112000000", first_name: "Rameesh", last_name: "Perera" },
      }),
    ).toBe("0112000000");

    expect(
      customerLabelForKokoOrder({
        customerPhone: "  ",
        shippingAddress: { first_name: "Rameesh", last_name: "Perera" },
      }),
    ).toBe("Rameesh Perera");
  });
});

describe("buildKokoOrderErpRow", () => {
  it("maps approval fields to ss16 row shape", () => {
    const row = buildKokoOrderErpRow({
      salesInvoice: "SINV-2026-00421",
      kokoReference: "ORDER#0010502020",
      amount: 9950.006,
      customer: "0774223062",
      requestedAt: new Date("2026-08-28T04:00:00.000Z"),
      reviewedBy: "finance@example.com",
      company: "DRO Trading (Pvt) Ltd",
    });

    expect(row).toEqual({
      sales_invoice: "SINV-2026-00421",
      koko_reference: "ORDER#0010502020",
      amount: 9950.01,
      customer: "0774223062",
      requested_time: expect.stringMatching(/^2026-08-28 \d{2}:\d{2}:\d{2}$/),
      reviewed_by: "finance@example.com",
      company: "DRO Trading (Pvt) Ltd",
    });
  });
});
