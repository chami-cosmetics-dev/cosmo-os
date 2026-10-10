import { describe, expect, it } from "vitest";

import { erpErrorMessage } from "@/lib/material-transfer/erp-error";
import { itemCodeFromScanBarcode } from "@/lib/material-transfer/scan-barcode";
import { buildMaterialTransferBody } from "@/lib/material-transfer/payload";

describe("buildMaterialTransferBody", () => {
  it("builds a direct Material Transfer stock entry", () => {
    expect(
      buildMaterialTransferBody({
        company: "Chami Trading Lanka (Pvt) Ltd",
        sourceWarehouse: "Main Warehouse - Chami",
        targetWarehouse: "Shop Warehouse - Chami",
        lines: [{ itemCode: "NEH09_1", qty: 2, uom: "Nos" }],
      }),
    ).toEqual({
      naming_series: "MAT-STE-.YYYY.-",
      stock_entry_type: "Material Transfer",
      purpose: "Material Transfer",
      add_to_transit: 0,
      company: "Chami Trading Lanka (Pvt) Ltd",
      from_warehouse: "Main Warehouse - Chami",
      to_warehouse: "Shop Warehouse - Chami",
      items: [
        {
          item_code: "NEH09_1",
          qty: 2,
          s_warehouse: "Main Warehouse - Chami",
          t_warehouse: "Shop Warehouse - Chami",
          uom: "Nos",
          conversion_factor: 1,
        },
      ],
    });
  });
});

describe("itemCodeFromScanBarcode", () => {
  it("reads the item code from ERP scan_barcode", () => {
    expect(
      itemCodeFromScanBarcode({
        message: { barcode: "062600656827", item_code: "NEH09_1" },
      }),
    ).toBe("NEH09_1");
    expect(itemCodeFromScanBarcode({ message: {} })).toBeNull();
  });
});

describe("erpErrorMessage", () => {
  it("reads the ERPNext server message", () => {
    const payload = {
      message: "ValidationError",
      _server_messages: JSON.stringify([
        JSON.stringify({ message: "Row #1: Qty cannot be greater than available qty" }),
      ]),
    };
    const error = new Error(`ERPNext POST /api/resource/Stock Entry [417]: ${JSON.stringify(payload)}`);
    expect(erpErrorMessage(error)).toBe("Row #1: Qty cannot be greater than available qty");
  });
});
