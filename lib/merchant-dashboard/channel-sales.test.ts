import { describe, expect, it } from "vitest";

import {
  computeChannelPercent,
  isPosChannelOrder,
  mergeMerchantCohortWithDmBucket,
  resolveChannelPercent,
  resolveEffectiveTotalTarget,
  resolveMonthlyTargetUpsert,
  splitMerchantChannelSales,
  sumChannelBuckets,
} from "@/lib/merchant-dashboard/channel-sales";
import type { CohortMerchantTotals } from "@/lib/page-data/merchant-dashboard-peers";

function merchantRow(input: {
  shop?: { amount: number; orderCount: number };
  online?: { amount: number; orderCount: number };
}): CohortMerchantTotals {
  const shop = input.shop ?? { amount: 0, orderCount: 0 };
  const online = input.online ?? { amount: 0, orderCount: 0 };
  return {
    merchantId: "m1",
    displayName: "Test",
    total: shop.amount + online.amount,
    orderCount: shop.orderCount + online.orderCount,
    byLocation: new Map(),
    byChannel: { shop: { ...shop }, online: { ...online } },
  };
}

describe("isPosChannelOrder", () => {
  it("detects POS sources", () => {
    expect(isPosChannelOrder("pos")).toBe(true);
    expect(isPosChannelOrder("erpnext-pos")).toBe(true);
    expect(isPosChannelOrder("shopify")).toBe(false);
    expect(isPosChannelOrder("erpnext")).toBe(false);
  });
});

describe("splitMerchantChannelSales", () => {
  it("reads shop vs online from cohort byChannel", () => {
    const split = splitMerchantChannelSales(
      merchantRow({
        shop: { amount: 100, orderCount: 2 },
        online: { amount: 50, orderCount: 1 },
      }),
    );
    expect(split.shop).toEqual({ amount: 100, orderCount: 2 });
    expect(split.online).toEqual({ amount: 50, orderCount: 1 });
  });
});

describe("resolveEffectiveTotalTarget", () => {
  it("sums channel targets when set", () => {
    expect(
      resolveEffectiveTotalTarget({
        targetAmount: 100,
        shopTargetAmount: 500,
        onlineTargetAmount: 300,
      }),
    ).toBe(800);
  });

  it("falls back to combined target", () => {
    expect(
      resolveEffectiveTotalTarget({
        targetAmount: 1000,
        shopTargetAmount: null,
        onlineTargetAmount: null,
      }),
    ).toBe(1000);
  });
});

describe("resolveMonthlyTargetUpsert", () => {
  const existing = {
    targetAmount: 800_000,
    shopTargetAmount: 500_000,
    onlineTargetAmount: 300_000,
  };

  it("combined-only save replaces this month and clears leftover channels", () => {
    expect(
      resolveMonthlyTargetUpsert({
        incoming: { targetAmount: 1_000_000 },
        existing,
      }),
    ).toEqual({
      targetAmount: 1_000_000,
      shopTargetAmount: null,
      onlineTargetAmount: null,
    });
  });

  it("shop/online save updates combined to the channel sum", () => {
    expect(
      resolveMonthlyTargetUpsert({
        incoming: { shopTargetAmount: 600_000, onlineTargetAmount: 400_000 },
        existing,
      }),
    ).toEqual({
      targetAmount: 1_000_000,
      shopTargetAmount: 600_000,
      onlineTargetAmount: 400_000,
    });
  });

  it("shop-only save keeps existing online", () => {
    expect(
      resolveMonthlyTargetUpsert({
        incoming: { shopTargetAmount: 700_000 },
        existing,
      }),
    ).toEqual({
      targetAmount: 1_000_000,
      shopTargetAmount: 700_000,
      onlineTargetAmount: 300_000,
    });
  });
});

describe("resolveChannelPercent", () => {
  it("uses target when set", () => {
    expect(
      resolveChannelPercent({
        actual: 250,
        target: 500,
        channelTotal: 1000,
      }),
    ).toBe(50);
  });

  it("falls back to share of shop+online total", () => {
    expect(
      resolveChannelPercent({
        actual: 300,
        target: null,
        channelTotal: 1000,
      }),
    ).toBe(30);
  });
});

describe("computeChannelPercent", () => {
  it("returns null when no target", () => {
    expect(computeChannelPercent(100, null)).toBeNull();
  });

  it("computes percentage", () => {
    expect(computeChannelPercent(250, 500)).toBe(50);
  });
});

describe("sumChannelBuckets", () => {
  it("aggregates rows", () => {
    const sum = sumChannelBuckets([
      {
        shop: { amount: 100, orderCount: 1 },
        online: { amount: 50, orderCount: 1 },
      },
      {
        shop: { amount: 200, orderCount: 2 },
        online: { amount: 25, orderCount: 1 },
      },
    ]);
    expect(sum.shop.amount).toBe(300);
    expect(sum.online.amount).toBe(75);
  });
});

describe("mergeMerchantCohortWithDmBucket", () => {
  it("merges DM-General bucket into DM holder totals", () => {
    const personal = merchantRow({
      shop: { amount: 100, orderCount: 1 },
      online: { amount: 50, orderCount: 1 },
    });
    const dm = merchantRow({
      shop: { amount: 200, orderCount: 2 },
      online: { amount: 80, orderCount: 1 },
    });
    const merged = mergeMerchantCohortWithDmBucket({
      merchantRow: personal,
      dmRow: dm,
      dmShare: 1,
    });
    expect(merged.total).toBe(430);
    expect(merged.orderCount).toBe(5);
    expect(merged.channel.shop.amount).toBe(300);
    expect(merged.channel.online.amount).toBe(130);
  });

  it("leaves non-holders unchanged", () => {
    const personal = merchantRow({
      shop: { amount: 100, orderCount: 1 },
      online: { amount: 0, orderCount: 0 },
    });
    const dm = merchantRow({
      shop: { amount: 200, orderCount: 2 },
      online: { amount: 0, orderCount: 0 },
    });
    const merged = mergeMerchantCohortWithDmBucket({
      merchantRow: personal,
      dmRow: dm,
      dmShare: 0,
    });
    expect(merged.total).toBe(100);
    expect(merged.channel.shop.amount).toBe(100);
  });
});
