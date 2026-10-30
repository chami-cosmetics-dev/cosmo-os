import { describe, expect, it } from "vitest";

import {
  insightCatalogLabelsBySku,
  insightLineCatalogLabels,
} from "@/lib/customer-insight/line-catalog";

describe("insightLineCatalogLabels", () => {
  it("merges ERP priority and tax status", () => {
    expect(
      insightLineCatalogLabels({
        erp1ProductPriority: "Top Priority",
        erp2ProductPriority: "Low",
        erp1TaxStatus: "Vat",
        erp2TaxStatus: "Non Vat",
      }),
    ).toEqual({
      priority: "Top Priority / Low",
      vatStatus: "Vat / Non Vat",
    });
  });

  it("returns null when catalog fields are empty", () => {
    expect(
      insightLineCatalogLabels({
        erp1ProductPriority: "  ",
        erp2ProductPriority: null,
        erp1TaxStatus: null,
        erp2TaxStatus: "",
      }),
    ).toEqual({ priority: null, vatStatus: null });
  });
});

describe("insightCatalogLabelsBySku", () => {
  it("keys by upper-case SKU and keeps the first row", () => {
    const map = insightCatalogLabelsBySku([
      {
        sku: "ng15-a",
        erp1ProductPriority: "New",
        erp2ProductPriority: null,
        erp1TaxStatus: "Vat",
        erp2TaxStatus: null,
      },
      {
        sku: "NG15-A",
        erp1ProductPriority: "Low",
        erp2ProductPriority: null,
        erp1TaxStatus: "Non Vat",
        erp2TaxStatus: null,
      },
    ]);
    expect(map.get("NG15-A")).toEqual({ priority: "New", vatStatus: "Vat" });
  });
});
