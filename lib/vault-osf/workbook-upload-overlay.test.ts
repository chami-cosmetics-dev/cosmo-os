import { describe, expect, it } from "vitest";

import { applyVaultWorkbookUploadToCatalogRow, vaultWorkbookUploadExtras } from "@/lib/vault-osf/workbook-upload-overlay";

describe("vault workbook upload overlay", () => {
  it("fills missing barcode from uploaded workbook", () => {
    const extra = vaultWorkbookUploadExtras("NW031-1");
    expect(extra?.barcode).toBeTruthy();
    expect(extra?.barcode).not.toMatch(/^'/);

    const row = applyVaultWorkbookUploadToCatalogRow({
      sku: "NW031-1",
      variantSku: "NW031-1",
      barcode: null,
      itemName: "Test",
      brand: "Now",
      category: "Vitamins",
      country: "USA",
      countryClaimType: null,
      priorityStatus: null,
    });
    expect(row.barcode).toBe(extra?.barcode);
    expect(row.priorityStatus).toBeNull();
  });

  it("has barcodes for NT025-1 and NW032-2 from ERP upload", () => {
    expect(vaultWorkbookUploadExtras("NT025-1")?.barcode).toBe("9314807088286");
    expect(vaultWorkbookUploadExtras("NW032-2")?.barcode).toBe("733739000927");
  });

  it("prefers uploaded-file barcode but keeps live Priority Status", () => {
    const extra = vaultWorkbookUploadExtras("NW031-1");
    expect(extra?.barcode).toBeTruthy();

    const row = applyVaultWorkbookUploadToCatalogRow({
      sku: "NW031-1",
      variantSku: "NW031-1",
      barcode: "111",
      itemName: "Test",
      brand: null,
      category: null,
      country: null,
      countryClaimType: null,
      priorityStatus: "Top Priority",
    });
    expect(row.barcode).toBe(extra?.barcode);
    expect(row.priorityStatus).toBe("Top Priority");
  });

  it("does not freeze TE001-1 overlay priority over live ERP status", () => {
    const extra = vaultWorkbookUploadExtras("TE001-1");
    expect(extra?.priorityStatus).toBe("Low priority");

    const row = applyVaultWorkbookUploadToCatalogRow({
      sku: "TE001-1",
      variantSku: "TE001-1",
      barcode: extra?.barcode ?? null,
      itemName: "Test",
      brand: null,
      category: null,
      country: null,
      countryClaimType: null,
      priorityStatus: "Top Priority",
    });
    expect(row.priorityStatus).toBe("Top Priority");
  });
});
