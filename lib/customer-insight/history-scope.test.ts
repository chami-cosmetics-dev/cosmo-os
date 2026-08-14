import { describe, expect, it } from "vitest";

import {
  lineMatchesHistoryScope,
  scopeCosmoOrdersForHistory,
} from "@/lib/customer-insight/history-scope";

describe("history-scope", () => {
  it("matches brand and item on lines", () => {
    expect(
      lineMatchesHistoryScope(
        {
          productTitle: "Anua Peach Serum",
          variantTitle: "30ml",
          brand: "Anua",
        },
        { brands: ["Anua"] }
      )
    ).toBe(true);
    expect(
      lineMatchesHistoryScope(
        {
          productTitle: "Anua Peach Serum",
          variantTitle: "30ml",
          sku: "ANU-123",
          brand: "Anua",
        },
        { items: ["ANU-123"] }
      )
    ).toBe(true);
    expect(
      lineMatchesHistoryScope(
        {
          productTitle: "Other Product",
          brand: "Other",
        },
        { brands: ["Anua"] }
      )
    ).toBe(false);
  });

  it("scopes cosmo orders to matching lines and spend", () => {
    const { orders, scopedSpend } = scopeCosmoOrdersForHistory(
      [
        {
          totalPrice: { toString: () => "1000" },
          lineItems: [
            {
              id: "1",
              quantity: 2,
              price: { toString: () => "100" },
              productItem: {
                productTitle: "Anua Serum",
                variantTitle: null,
                sku: "A1",
                vendor: { name: "Anua" },
              },
            },
            {
              id: "2",
              quantity: 1,
              price: { toString: () => "500" },
              productItem: {
                productTitle: "Other",
                variantTitle: null,
                sku: "B1",
                vendor: { name: "Other" },
              },
            },
          ],
        },
      ],
      { brands: ["Anua"] }
    );
    expect(orders.length).toBe(1);
    expect(orders[0].lineItems.length).toBe(1);
    expect(scopedSpend).toBe(200);
  });
});
