import { describe, expect, it } from "vitest";

import {
  companiesForErp2,
  companyForWarehouses,
  defaultSourceWarehouse,
  defaultTargetWarehouse,
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
