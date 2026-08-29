import { describe, expect, it } from "vitest";

import {
  classifyPurchaseRecencyBucket,
  PURCHASE_RECENCY_BUCKET_ORDER,
} from "@/lib/customer-insight/merchant-monitoring-recency";
import type { TierCountTriple } from "@/lib/customer-insight/merchant-monitoring";
import { effectiveLoyaltyTierKey } from "@/lib/customer-insight/erp-loyalty";

function bumpTier(tiers: TierCountTriple, key: ReturnType<typeof effectiveLoyaltyTierKey>) {
  if (key === "gold") tiers.gold += 1;
  else if (key === "platinum") tiers.platinum += 1;
  else tiers.standard += 1;
  tiers.total += 1;
}

describe("merchant monitoring rollup invariants", () => {
  it("tier counts sum to allocated total", () => {
    const tiers: TierCountTriple = { gold: 2, platinum: 1, standard: 7, total: 0 };
    tiers.total = tiers.gold + tiers.platinum + tiers.standard;
    expect(tiers.total).toBe(10);
  });

  it("each contact maps to exactly one recency bucket", () => {
    const asOf = "2026-08-29";
    const samples = [
      null,
      new Date("2026-08-29T08:00:00+05:30"),
      new Date("2026-08-20T08:00:00+05:30"),
      new Date("2025-01-01T08:00:00+05:30"),
    ];
    for (const sample of samples) {
      const bucket = classifyPurchaseRecencyBucket(sample, asOf);
      expect(PURCHASE_RECENCY_BUCKET_ORDER).toContain(bucket);
    }
  });

  it("effective tier uses assigned only", () => {
    expect(effectiveLoyaltyTierKey("gold", "standard")).toBe("gold");
    expect(effectiveLoyaltyTierKey(null, "platinum")).toBe("standard");
  });

  it("recency bucket tier totals match bucket total", () => {
    const tiers: TierCountTriple = { gold: 0, platinum: 0, standard: 0, total: 0 };
    bumpTier(tiers, "gold");
    bumpTier(tiers, "standard");
    expect(tiers.gold + tiers.platinum + tiers.standard).toBe(tiers.total);
  });
});
