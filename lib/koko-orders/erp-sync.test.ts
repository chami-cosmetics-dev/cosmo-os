import { describe, expect, it } from "vitest";

import {
  buildKokoOrderErpRow,
  customerLabelForKokoOrder,
  serializeKokoOrderRowsForErp,
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
      requested_time: "8/28/2026, 9:30:00 AM",
      reviewed_by: "finance@example.com",
      company: "DRO Trading (Pvt) Ltd",
    });
  });
});

describe("serializeKokoOrderRowsForErp", () => {
  it("serializes multi-KOKO rows for bank_recon_sync_koko_orders", () => {
    const rows = [
      buildKokoOrderErpRow({
        salesInvoice: "110-000289",
        kokoReference: "ref_1",
        amount: 10000,
        customer: "0765969696",
        requestedAt: new Date("2026-08-28T04:20:24.000Z"),
        reviewedBy: "Akeel Hilal",
        company: "Company Name",
      }),
      buildKokoOrderErpRow({
        salesInvoice: "110-000289",
        kokoReference: "ref_2",
        amount: 5650,
        customer: "0765969696",
        requestedAt: new Date("2026-08-28T04:20:24.000Z"),
        reviewedBy: "Akeel Hilal",
        company: "Company Name",
      }),
    ];

    expect(JSON.parse(serializeKokoOrderRowsForErp(rows))).toEqual([
      {
        invoice: "110-000289",
        koko_reference: "ref_1",
        amount: 10000,
        customer: "0765969696",
        requested: "8/28/2026, 9:50:24 AM",
        reviewed_by: "Akeel Hilal",
        company: "Company Name",
      },
      {
        invoice: "110-000289",
        koko_reference: "ref_2",
        amount: 5650,
        customer: "0765969696",
        requested: "8/28/2026, 9:50:24 AM",
        reviewed_by: "Akeel Hilal",
        company: "Company Name",
      },
    ]);
  });
});
