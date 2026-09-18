import { describe, expect, it, vi } from "vitest";

import {
  fillMissingItemBarcodes,
  firstBarcodeFromErpItem,
  lookupBarcode,
} from "@/lib/vault-osf/erp-barcodes";

describe("firstBarcodeFromErpItem", () => {
  it("reads barcodes child table when Item.barcode field is empty", () => {
    expect(
      firstBarcodeFromErpItem({
        barcode: null,
        barcodes: [{ barcode: "9314807088286" }],
      }),
    ).toBe("9314807088286");
  });

  it("prefers Item.barcode when present", () => {
    expect(
      firstBarcodeFromErpItem({
        barcode: "733739000927",
        barcodes: [{ barcode: "other" }],
      }),
    ).toBe("733739000927");
  });

  it("skips blank child rows", () => {
    expect(
      firstBarcodeFromErpItem({
        barcodes: [{ barcode: "  " }, { barcode: "733739000927" }],
      }),
    ).toBe("733739000927");
  });
});

describe("fillMissingItemBarcodes", () => {
  it("loads child barcodes via GET Item when bulk list is empty", async () => {
    const getJson = vi.fn(async (path: string) => {
      if (path.includes("/Item/NT025-1")) {
        return { data: { barcodes: [{ barcode: "9314807088286" }] } };
      }
      if (path.includes("/Item/NW032-2")) {
        return { data: { barcodes: [{ barcode: "733739000927" }] } };
      }
      throw new Error(`unexpected ${path}`);
    });

    const map = await fillMissingItemBarcodes(getJson, ["NT025-1", "NW032-2"]);
    expect(lookupBarcode(map, "NT025-1")).toBe("9314807088286");
    expect(lookupBarcode(map, "nw032-2")).toBe("733739000927");
    expect(getJson).toHaveBeenCalledTimes(2);
  });

  it("ignores SKUs whose Item GET fails", async () => {
    const getJson = vi.fn(async () => {
      throw new Error("404");
    });
    const map = await fillMissingItemBarcodes(getJson, ["MISSING-1"]);
    expect(map.size).toBe(0);
  });
});
