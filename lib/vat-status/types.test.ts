import { describe, expect, it } from "vitest";

import { buildVatStatusSlot, pickErpTaxHit } from "@/lib/vat-status/types";

describe("pickErpTaxHit", () => {
  it("matches SKU ignoring case", () => {
    const hit = pickErpTaxHit(
      [{ itemCode: "Ab-1", itemName: "Cream", taxStatus: "Vat" }],
      "ab-1",
    );
    expect(hit?.itemName).toBe("Cream");
  });

  it("returns null when the SKU is missing", () => {
    expect(pickErpTaxHit([], "AB-1")).toBeNull();
  });
});

describe("buildVatStatusSlot", () => {
  it("marks an unconfigured ERP", () => {
    expect(
      buildVatStatusSlot({ id: "erp1", label: "ERP1", configured: false }),
    ).toMatchObject({ configured: false, found: false, vat: false, taxStatus: null });
  });

  it("keeps the ERP error and hides a status", () => {
    expect(
      buildVatStatusSlot({
        id: "erp2",
        label: "ERP2",
        configured: true,
        error: "ERP down",
        hit: { itemCode: "AB-1", itemName: "Cream", taxStatus: "Vat" },
      }),
    ).toMatchObject({ found: false, vat: false, taxStatus: null, error: "ERP down" });
  });

  it("treats Vat and Vat / Non Vat as VAT", () => {
    expect(
      buildVatStatusSlot({
        id: "erp1",
        label: "ERP1",
        configured: true,
        hit: { itemCode: "AB-1", itemName: "Cream", taxStatus: "Vat" },
      }).vat,
    ).toBe(true);
    expect(
      buildVatStatusSlot({
        id: "erp2",
        label: "ERP2",
        configured: true,
        hit: { itemCode: "AB-1", itemName: "Cream", taxStatus: "Vat / Non Vat" },
      }).vat,
    ).toBe(true);
  });

  it("treats Non Vat and a missing item as not VAT", () => {
    expect(
      buildVatStatusSlot({
        id: "erp1",
        label: "ERP1",
        configured: true,
        hit: { itemCode: "AB-1", itemName: "Cream", taxStatus: "Non Vat" },
      }),
    ).toMatchObject({ found: true, vat: false, taxStatus: "Non Vat" });
    expect(
      buildVatStatusSlot({ id: "erp2", label: "ERP2", configured: true, hit: null }),
    ).toMatchObject({ found: false, vat: false, taxStatus: null });
  });
});
