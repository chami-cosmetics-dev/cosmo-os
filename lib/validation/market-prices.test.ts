import { describe, expect, it } from "vitest";

import {
  marketPriceLinkCreateSchema,
  marketPriceLinkUpdateSchema,
  marketPricePageDataQuerySchema,
} from "./market-prices";

describe("market-prices validation schemas", () => {
  it("defaults query params correctly", () => {
    const res = marketPricePageDataQuerySchema.parse({});
    expect(res.layer).toBe("ogf");
    expect(res.sort).toBe("gap_desc");
    expect(res.page).toBe(1);
    expect(res.limit).toBe(50);
  });

  it("validates link creation schema with positive price", () => {
    const valid = marketPriceLinkCreateSchema.safeParse({
      sku: "TEST-SKU-1",
      competitorSlug: "liberty-store",
      productUrl: "https://libertystore.lk/products/test",
      competitorTitle: "Test Product",
      listedPriceLkr: "8200.50",
      checkDate: "2026-09-01",
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.listedPriceLkr).toBe(8200.5);
      expect(valid.data.inStock).toBe(true);
      expect(valid.data.sizeMismatchConfirmed).toBe(false);
    }

    const invalidPrice = marketPriceLinkCreateSchema.safeParse({
      sku: "TEST-SKU-1",
      competitorSlug: "liberty-store",
      productUrl: "https://libertystore.lk/products/test",
      competitorTitle: "Test Product",
      listedPriceLkr: "-50",
      checkDate: "2026-09-01",
    });
    expect(invalidPrice.success).toBe(false);

    const invalidDate = marketPriceLinkCreateSchema.safeParse({
      sku: "TEST-SKU-1",
      competitorSlug: "liberty-store",
      productUrl: "https://libertystore.lk/products/test",
      competitorTitle: "Test Product",
      listedPriceLkr: "500",
      checkDate: "01-09-2026",
    });
    expect(invalidDate.success).toBe(false);
  });

  it("validates partial link updates", () => {
    const res = marketPriceLinkUpdateSchema.parse({
      listedPriceLkr: 7500,
      inStock: false,
    });
    expect(res.listedPriceLkr).toBe(7500);
    expect(res.inStock).toBe(false);
    expect(res.productUrl).toBeUndefined();
  });
});
