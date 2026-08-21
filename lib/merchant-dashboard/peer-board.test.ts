import { describe, expect, it } from "vitest";

import { buildPeerBoard, classifyPeerBand } from "@/lib/merchant-dashboard/peer-board";

describe("classifyPeerBand", () => {
  it("returns solo for single merchant", () => {
    expect(
      classifyPeerBand({
        cohortSize: 1,
        viewedRank: 1,
        viewedTotal: 100,
        leaderTotal: 100,
      }),
    ).toBe("solo");
  });

  it("returns no_sales when viewed has zero", () => {
    expect(
      classifyPeerBand({
        cohortSize: 3,
        viewedRank: 3,
        viewedTotal: 0,
        leaderTotal: 100,
      }),
    ).toBe("no_sales");
  });

  it("returns leader when rank 1 with sales", () => {
    expect(
      classifyPeerBand({
        cohortSize: 5,
        viewedRank: 1,
        viewedTotal: 200,
        leaderTotal: 200,
      }),
    ).toBe("leader");
  });
});

describe("buildPeerBoard", () => {
  const cheer = (band: string) => `band:${band}`;

  it("ranks full cohort and keeps top 10 + self outside top when limited", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      merchantId: `m${i + 1}`,
      displayName: `Merchant ${String(i + 1).padStart(2, "0")}`,
      total: 1200 - i * 100,
      orderCount: 12 - i,
    }));

    const board = buildPeerBoard(rows, {
      period: "mtd",
      fromYmd: "2026-08-01",
      toYmd: "2026-08-11",
      viewedMerchantId: "m12",
      limit: 10,
      cheerMessageForBand: (band) => cheer(band),
    });

    expect(board.viewedRank).toBe(12);
    expect(board.entries).toHaveLength(11);
    expect(board.entries.slice(0, 10).every((e) => e.rank <= 10)).toBe(true);
    expect(board.entries[10]?.merchantId).toBe("m12");
    expect(board.entries[10]?.isViewed).toBe(true);
    expect(board.gapToLeader).toBe(1100);
    expect(board.peerBand).toBe("behind");
  });

  it("includes every merchant by default", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      merchantId: `m${i + 1}`,
      displayName: `Merchant ${String(i + 1).padStart(2, "0")}`,
      total: 1200 - i * 100,
      orderCount: 12 - i,
    }));

    const board = buildPeerBoard(rows, {
      period: "mtd",
      fromYmd: "2026-08-01",
      toYmd: "2026-08-11",
      viewedMerchantId: "m12",
      cheerMessageForBand: (band) => cheer(band),
    });

    expect(board.entries).toHaveLength(12);
    expect(board.entries.map((e) => e.merchantId)).toEqual(
      rows.map((r) => r.merchantId),
    );
  });

  it("marks viewed inside top 10 without duplicating", () => {
    const board = buildPeerBoard(
      [
        { merchantId: "a", displayName: "Ada", total: 300, orderCount: 3 },
        { merchantId: "b", displayName: "Bea", total: 200, orderCount: 2 },
        { merchantId: "c", displayName: "Cid", total: 100, orderCount: 1 },
      ],
      {
        period: "today",
        fromYmd: "2026-08-11",
        toYmd: "2026-08-11",
        viewedMerchantId: "b",
        limit: 10,
        cheerMessageForBand: (band) => cheer(band),
      },
    );

    expect(board.entries).toHaveLength(3);
    expect(board.entries.filter((e) => e.merchantId === "b")).toHaveLength(1);
    expect(board.viewedRank).toBe(2);
    expect(board.peerBand).toBe("chasing");
  });

  it("handles solo cohort", () => {
    const board = buildPeerBoard(
      [{ merchantId: "solo", displayName: "Only", total: 50, orderCount: 1 }],
      {
        period: "mtd",
        fromYmd: "2026-08-01",
        toYmd: "2026-08-11",
        viewedMerchantId: "solo",
        cheerMessageForBand: (band) => cheer(band),
      },
    );
    expect(board.peerBand).toBe("solo");
    expect(board.entries).toHaveLength(1);
  });

  it("keeps DM sales on board but ranks race without DM", () => {
    const board = buildPeerBoard(
      [
        {
          merchantId: "__dm_general__",
          displayName: "DM-General",
          total: 900,
          orderCount: 9,
          excludeFromRace: true,
        },
        { merchantId: "a", displayName: "Ada", total: 300, orderCount: 3 },
        { merchantId: "b", displayName: "Bea", total: 200, orderCount: 2 },
      ],
      {
        period: "today",
        fromYmd: "2026-08-11",
        toYmd: "2026-08-11",
        viewedMerchantId: "b",
        alwaysIncludeMerchantIds: ["__dm_general__"],
        cheerMessageForBand: (band) => cheer(band),
      },
    );

    expect(board.viewedRank).toBe(2);
    expect(board.leaderTotal).toBe(300);
    expect(board.gapToLeader).toBe(100);
    expect(board.entries.some((e) => e.merchantId === "__dm_general__")).toBe(
      true,
    );
    expect(
      board.entries.find((e) => e.merchantId === "__dm_general__")?.excludeFromRace,
    ).toBe(true);
    expect(board.entries.find((e) => e.merchantId === "a")?.rank).toBe(1);
  });
});
