import { describe, expect, it } from "vitest";

import type { OsfCatalogRow } from "@/lib/osf/catalog-rows";
import {
  applyTaxStatusToCatalog,
  filterCatalogByOsfVariant,
  isVatCatalogRow,
  isVatErpPriority,
  isVatTaxStatus,
  vatStatusLabel,
} from "@/lib/osf/vat-membership";

function row(
  partial: Partial<OsfCatalogRow> & Pick<OsfCatalogRow, "sku">,
): OsfCatalogRow {
  return {
    productTitle: partial.sku,
    brand: null,
    barcode: null,
    imageUrl: null,
    siteStatus: "active",
    itemStatusLabel: null,
    itemStatusCategory: "CONTINUE",
    erp1ProductPriority: null,
    erp2ProductPriority: null,
    erp1TaxStatus: null,
    erp2TaxStatus: null,
    country: null,
    mrp: null,
    discountedPrice: null,
    vendorId: null,
    ...partial,
  };
}

describe("isVatErpPriority", () => {
  it("matches Vat case-insensitively", () => {
    expect(isVatErpPriority("Vat")).toBe(true);
    expect(isVatErpPriority("vat")).toBe(true);
    expect(isVatErpPriority("VAT")).toBe(true);
    expect(isVatErpPriority(" Continue ")).toBe(false);
    expect(isVatErpPriority(null)).toBe(false);
  });
});

describe("isVatTaxStatus", () => {
  it("treats ERP Tax Status Vat and mixed as VAT; Non Vat is not", () => {
    expect(isVatTaxStatus("Vat")).toBe(true);
    expect(isVatTaxStatus("vat")).toBe(true);
    expect(isVatTaxStatus("Vat / Non Vat")).toBe(true);
    expect(isVatTaxStatus("Non Vat")).toBe(false);
    expect(isVatTaxStatus("Non-Vat")).toBe(false);
    expect(isVatTaxStatus("Low")).toBe(false);
    expect(isVatTaxStatus(null)).toBe(false);
  });
});

describe("isVatCatalogRow / filterCatalogByOsfVariant", () => {
  const vatErp1 = row({
    sku: "A",
    erp1ProductPriority: "Low",
    erp1TaxStatus: "Vat",
  });
  const vatErp2 = row({
    sku: "B",
    erp2ProductPriority: "Continue",
    erp2TaxStatus: "Vat / Non Vat",
  });
  const vatBoth = row({
    sku: "C",
    erp1TaxStatus: "Vat",
    erp2TaxStatus: "Vat",
  });
  const nonVat = row({
    sku: "D",
    erp1ProductPriority: "Vat",
    erp1TaxStatus: "Non Vat",
    erp2TaxStatus: "Non Vat",
  });
  const catalog = [vatErp1, vatErp2, vatBoth, nonVat];

  it("uses Tax Status, not Product Priority", () => {
    expect(isVatCatalogRow(vatErp1)).toBe(true);
    expect(isVatCatalogRow(vatErp2)).toBe(true);
    expect(isVatCatalogRow(vatBoth)).toBe(true);
    expect(isVatCatalogRow(nonVat)).toBe(false);
    expect(vatStatusLabel(vatErp1)).toBe("Vat");
    expect(vatStatusLabel(nonVat)).toBe("Non Vat");
    expect(vatStatusLabel(row({ sku: "X", erp1TaxStatus: "Vat", erp2TaxStatus: "Non Vat" }))).toBe(
      "Vat / Non Vat",
    );
  });

  it("main keeps all", () => {
    expect(filterCatalogByOsfVariant(catalog, "main")).toHaveLength(4);
  });

  it("vat keeps only Tax Status Vat rows", () => {
    expect(filterCatalogByOsfVariant(catalog, "vat").map((r) => r.sku)).toEqual(["A", "B", "C"]);
  });

  it("non_vat excludes Tax Status Vat rows", () => {
    expect(filterCatalogByOsfVariant(catalog, "non_vat").map((r) => r.sku)).toEqual(["D"]);
  });

  it("overlays ERP tax maps onto catalog rows", () => {
    const out = applyTaxStatusToCatalog(
      [row({ sku: "ACN01_1" })],
      new Map([["ACN01_1", "Vat"]]),
      new Map(),
      (sku) => sku.trim().toUpperCase(),
    );
    expect(out[0]!.erp1TaxStatus).toBe("Vat");
    expect(vatStatusLabel(out[0]!)).toBe("Vat");
  });
});
