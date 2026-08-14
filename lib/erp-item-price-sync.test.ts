import { describe, expect, it } from "vitest";

import {
  decideErpItemPriceProductSync,
  planStandardSellingPriceUpdates,
} from "@/lib/erp-item-price-decision";

describe("decideErpItemPriceProductSync", () => {
  const base = {
    item_code: "OGX04_1",
    price_list: "Standard Selling",
    price_list_rate: 6250,
    selling: 1 as number | null,
    buying: 0 as number | null,
  };

  it("applies Standard Selling rate as-is", () => {
    expect(decideErpItemPriceProductSync(base)).toEqual({
      apply: true,
      sku: "OGX04_1",
      rate: "6250.00",
    });
  });

  it("skips non-Standard Selling lists", () => {
    expect(
      decideErpItemPriceProductSync({ ...base, price_list: "Standard Buying" }),
    ).toEqual({ apply: false, reason: "not_standard_selling" });
  });

  it("skips buying rows even if list name matches", () => {
    expect(decideErpItemPriceProductSync({ ...base, selling: 0, buying: 1 })).toEqual({
      apply: false,
      reason: "not_selling",
    });
  });

  it("skips invalid rates", () => {
    expect(decideErpItemPriceProductSync({ ...base, price_list_rate: 0 })).toEqual({
      apply: false,
      reason: "invalid_rate",
    });
  });

  it("matches Standard Selling case-insensitively", () => {
    expect(
      decideErpItemPriceProductSync({ ...base, price_list: "standard selling" }),
    ).toMatchObject({ apply: true, rate: "6250.00" });
  });
});

describe("planStandardSellingPriceUpdates", () => {
  it("updates mismatched SKUs and skips already-matching prices", () => {
    expect(
      planStandardSellingPriceUpdates(
        [
          { id: "a", sku: "DRRA30_1", price: "975.00" },
          { id: "b", sku: "drra30_1", price: "1950.00" },
          { id: "c", sku: "OLA11_1", price: "1550.00" },
        ],
        { DRRA30_1: "1950.00", OLA11_1: "1550.00" },
      ),
    ).toEqual([{ price: "1950.00", ids: ["a"] }]);
  });

  it("skips SKUs with no ERP rate", () => {
    expect(
      planStandardSellingPriceUpdates([{ id: "a", sku: "NOPE_1", price: "10.00" }], {
        DRRA30_1: "1950.00",
      }),
    ).toEqual([]);
  });
});
