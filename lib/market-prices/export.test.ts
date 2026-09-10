import { describe, expect, it } from "vitest";

import { formatMarketCompareCsvRows } from "./export";
import type { MarketCompareSummaryRow } from "./types";

describe("formatMarketCompareCsvRows", () => {
  it("formats summary rows into valid CSV lines", () => {
    const mockRows: MarketCompareSummaryRow[] = [
      {
        sku: "CERAVE-236",
        title: "CeraVe Moisturising Lotion, 236ml",
        brand: "CeraVe",
        barcode: "3337875597203",
        priority: "Top Priority",
        prices: {
          mrp: 9500,
          promo: 8200,
          ogf: 7900,
          hasPromo: true,
        },
        competitorMin: 7800,
        competitorMax: 8500,
        competitorMedian: 8200,
        competitorCount: 4,
        gapPctMrp: 15.9,
        gapPctPromo: 0,
        gapPctOgf: -3.7,
        cheapestMrp: false,
        cheapestPromo: false,
        cheapestOgf: true,
        anyStale: false,
        latestCheckDate: "2026-09-01",
      },
    ];

    const csv = formatMarketCompareCsvRows(mockRows);
    expect(csv).toContain("sku,title,brand,mrp,promo,ogf");
    expect(csv).toContain('"CeraVe Moisturising Lotion, 236ml"');
    expect(csv).toContain("7900,8200,15.9,0,-3.7,4,2026-09-01,no");
  });
});
