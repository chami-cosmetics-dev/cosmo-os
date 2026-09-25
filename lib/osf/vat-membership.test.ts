import { describe, expect, it } from "vitest";

import type { OsfCatalogRow } from "@/lib/osf/catalog-rows";
import {
  filterCatalogByOsfVariant,
  isVatCatalogRow,
  isVatErpPriority,
  vatStatusLabel,
} from "@/lib/osf/vat-membership";

function row(
  partial: Partial<OsfCatalogRow> & Pick<OsfCatalogRow, "sku" | "erp1ProductPriority" | "erp2ProductPriority">,
): OsfCatalogRow {
  return {
    productTitle: partial.sku,
    brand: null,
    barcode: null,
    imageUrl: null,
    siteStatus: "active",
    itemStatusLabel: null,
    itemStatusCategory: "CONTINUE",
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

describe("isVatCatalogRow / filterCatalogByOsfVariant", () => {
  const vatErp1 = row({ sku: "A", erp1ProductPriority: "Vat", erp2ProductPriority: "Continue" });
  const vatErp2 = row({ sku: "B", erp1ProductPriority: "Continue", erp2ProductPriority: "Vat" });
  const vatBoth = row({ sku: "C", erp1ProductPriority: "Vat", erp2ProductPriority: "Vat" });
  const nonVat = row({ sku: "D", erp1ProductPriority: "Continue", erp2ProductPriority: "Priority" });
  const catalog = [vatErp1, vatErp2, vatBoth, nonVat];

  it("detects Vat on either ERP", () => {
    expect(isVatCatalogRow(vatErp1)).toBe(true);
    expect(isVatCatalogRow(vatErp2)).toBe(true);
    expect(isVatCatalogRow(vatBoth)).toBe(true);
    expect(isVatCatalogRow(nonVat)).toBe(false);
    expect(vatStatusLabel(vatErp1)).toBe("VAT");
    expect(vatStatusLabel(nonVat)).toBe("Non-VAT");
  });

  it("main keeps all", () => {
    expect(filterCatalogByOsfVariant(catalog, "main")).toHaveLength(4);
  });

  it("vat keeps only Vat rows", () => {
    expect(filterCatalogByOsfVariant(catalog, "vat").map((r) => r.sku)).toEqual(["A", "B", "C"]);
  });

  it("non_vat excludes Vat rows", () => {
    expect(filterCatalogByOsfVariant(catalog, "non_vat").map((r) => r.sku)).toEqual(["D"]);
  });
});
