import { describe, expect, it } from "vitest";

import { buildVatStatusSlot, pickErpTaxHit, productPriorityLabel } from "@/lib/vat-status/types";

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

  it("copies Product Priority from the ERP hit", () => {
    expect(
      buildVatStatusSlot({
        id: "erp1",
        label: "ERP1",
        configured: true,
        hit: {
          itemCode: "AB-1",
          itemName: "Cream",
          taxStatus: "Vat",
          productPriority: "Top Priority",
        },
      }),
    ).toMatchObject({ found: true, productPriority: "Top Priority" });
  });

  it("hides Product Priority when the ERP errors", () => {
    expect(
      buildVatStatusSlot({
        id: "erp2",
        label: "ERP2",
        configured: true,
        error: "ERP down",
        hit: {
          itemCode: "AB-1",
          itemName: "Cream",
          taxStatus: "Vat",
          productPriority: "Top Priority",
        },
      }).productPriority,
    ).toBeNull();
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
    ).toMatchObject({ found: false, vat: false, taxStatus: null, productPriority: null });
  });
});

describe("productPriorityLabel", () => {
  it("returns one value when both ERPs match or one is empty", () => {
    expect(productPriorityLabel("Top Priority", "Top Priority")).toBe("Top Priority");
    expect(productPriorityLabel("Top Priority", null)).toBe("Top Priority");
    expect(productPriorityLabel("", "Newly Added")).toBe("Newly Added");
  });

  it("joins different ERP values", () => {
    expect(productPriorityLabel("Top Priority", "Non Priority")).toBe("Top Priority / Non Priority");
  });
});
