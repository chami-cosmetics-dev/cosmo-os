import { describe, expect, it } from "vitest";

import {
  companiesForErp2,
  companyForWarehouses,
  defaultSourceWarehouse,
  defaultTargetWarehouse,
  erp1NonVatTransferWarning,
  erp1RequiresVatItems,
  isOgfWarehouseName,
  warehouseOptions,
} from "@/lib/material-transfer/warehouses";
import type { TransferWarehouse } from "@/lib/material-transfer/types";

const warehouses: TransferWarehouse[] = [
  { name: "Main Warehouse - Chami", company: "Chami Trading Lanka (Pvt) Ltd" },
  { name: "Shop Warehouse - Chami", company: "Chami Trading Lanka (Pvt) Ltd" },
  { name: "Main Warehouse - AJS", company: "AJS Trading Lanka (Pvt) Ltd" },
  { name: "Shop Warehouse - AJS", company: "AJS Trading Lanka (Pvt) Ltd" },
  { name: "Stores - CCON", company: "Cosmetics Consolidated" },
  { name: "Goods In Transit - CCON", company: "Cosmetics Consolidated" },
  { name: "Main Warehouse - Cosmo", company: "Cosmetics.lk" },
  { name: "GCC Shop Warehouse - Cosmo", company: "Cosmetics.lk" },
  { name: "Pepiliyana Shop Warehouse - Cosmo", company: "Cosmetics.lk" },
];

describe("warehouseOptions", () => {
  it("shows every ERP1 warehouse", () => {
    const options = warehouseOptions("erp1", warehouses, null);
    expect(options.map((row) => row.name)).toEqual([
      "Main Warehouse - AJS",
      "Main Warehouse - Chami",
      "Main Warehouse - Cosmo",
      "GCC Shop Warehouse - Cosmo",
      "Goods In Transit - CCON",
      "Pepiliyana Shop Warehouse - Cosmo",
      "Shop Warehouse - AJS",
      "Shop Warehouse - Chami",
      "Stores - CCON",
    ]);
  });

  it("limits ERP2 to main and shop warehouses of the selected company", () => {
    const options = warehouseOptions("erp2", warehouses, "Chami Trading Lanka (Pvt) Ltd");
    expect(options.map((row) => row.name)).toEqual([
      "Main Warehouse - Chami",
      "Shop Warehouse - Chami",
    ]);
    expect(defaultSourceWarehouse(options)).toBe("Main Warehouse - Chami");
    expect(defaultTargetWarehouse(options)).toBe("Shop Warehouse - Chami");
  });

  it("hides ERP2 warehouses until a company is selected", () => {
    expect(warehouseOptions("erp2", warehouses, "")).toEqual([]);
    expect(companiesForErp2(warehouses)).toEqual([
      "AJS Trading Lanka (Pvt) Ltd",
      "Chami Trading Lanka (Pvt) Ltd",
      "Cosmetics.lk",
    ]);
  });

  it("rejects the same warehouse on both sides", () => {
    const options = warehouseOptions("erp2", warehouses, "Chami Trading Lanka (Pvt) Ltd");
    expect(() =>
      companyForWarehouses("Main Warehouse - Chami", "Main Warehouse - Chami", options),
    ).toThrow(/different/);
    expect(
      companyForWarehouses("Main Warehouse - Chami", "Shop Warehouse - Chami", options),
    ).toBe("Chami Trading Lanka (Pvt) Ltd");
  });
});

describe("erp1RequiresVatItems", () => {
  it("recognizes the OGF shop warehouse", () => {
    expect(isOgfWarehouseName("OGF Shop Warehouse - Cosmo")).toBe(true);
    expect(isOgfWarehouseName("Main Warehouse - Cosmo")).toBe(false);
    expect(isOgfWarehouseName("GCC Shop Warehouse - Cosmo")).toBe(false);
    expect(isOgfWarehouseName("")).toBe(false);
  });

  it("skips the VAT-only rule when OGF is source or target", () => {
    expect(erp1RequiresVatItems("Main Warehouse - Cosmo", "OGF Shop Warehouse - Cosmo")).toBe(false);
    expect(erp1RequiresVatItems("OGF Shop Warehouse - Cosmo", "Main Warehouse - Cosmo")).toBe(false);
    expect(erp1RequiresVatItems("OGF Shop Warehouse - Cosmo", "")).toBe(false);
  });

  it("keeps VAT-only for other ERP1 warehouse pairs", () => {
    expect(erp1RequiresVatItems("Main Warehouse - Cosmo", "GCC Shop Warehouse - Cosmo")).toBe(true);
    expect(erp1RequiresVatItems("Main Warehouse - Cosmo", "Maharagama Shop Warehouse - Cosmo")).toBe(
      true,
    );
  });
});

describe("erp1NonVatTransferWarning", () => {
  it("warns on OGF ERP1 non-VAT items without blocking", () => {
    expect(
      erp1NonVatTransferWarning(
        "erp1",
        "Main Warehouse - Cosmo",
        "OGF Shop Warehouse - Cosmo",
        "Non Vat",
        "SKU1",
      ),
    ).toBe("SKU1 is Non Vat. Not Vat or Vat / Non Vat.");
    expect(
      erp1NonVatTransferWarning(
        "erp1",
        "OGF Shop Warehouse - Cosmo",
        "Main Warehouse - Cosmo",
        null,
        "SKU1",
      ),
    ).toBe("SKU1 is not VAT. Not Vat or Vat / Non Vat.");
  });

  it("stays quiet for VAT items, ERP2, and non-OGF ERP1 pairs", () => {
    expect(
      erp1NonVatTransferWarning(
        "erp1",
        "Main Warehouse - Cosmo",
        "OGF Shop Warehouse - Cosmo",
        "Vat",
        "SKU1",
      ),
    ).toBeNull();
    expect(
      erp1NonVatTransferWarning(
        "erp1",
        "Main Warehouse - Cosmo",
        "OGF Shop Warehouse - Cosmo",
        "Vat / Non Vat",
        "SKU1",
      ),
    ).toBeNull();
    expect(
      erp1NonVatTransferWarning(
        "erp2",
        "Main Warehouse - Chami",
        "Shop Warehouse - Chami",
        "Non Vat",
        "SKU1",
      ),
    ).toBeNull();
    expect(
      erp1NonVatTransferWarning(
        "erp1",
        "Main Warehouse - Cosmo",
        "GCC Shop Warehouse - Cosmo",
        "Non Vat",
        "SKU1",
      ),
    ).toBeNull();
  });
});
