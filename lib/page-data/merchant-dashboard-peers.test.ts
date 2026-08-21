import { describe, expect, it } from "vitest";

import {
  buildLocationShareRows,
  type CohortSalesResult,
} from "@/lib/page-data/merchant-dashboard-peers";

function emptyCohort(
  byMerchant: CohortSalesResult["byMerchant"],
): CohortSalesResult {
  return {
    fromYmd: "2026-08-01",
    toYmd: "2026-08-11",
    byMerchant,
    locationNames: new Map([
      ["loc1", "Colombo"],
      ["loc2", "Kandy"],
    ]),
    dmBucketId: null,
  };
}

describe("buildLocationShareRows", () => {
  it("computes self share and excludes self from peers", () => {
    const byMerchant = new Map<string, CohortSalesResult["byMerchant"] extends Map<string, infer V> ? V : never>();

    byMerchant.set("a", {
      merchantId: "a",
      displayName: "Ada",
      total: 100,
      orderCount: 2,
      byLocation: new Map([
        [
          "loc1",
          { locationId: "loc1", locationName: "Colombo", total: 100, orderCount: 2 },
        ],
      ]),
    });
    byMerchant.set("b", {
      merchantId: "b",
      displayName: "Bea",
      total: 300,
      orderCount: 3,
      byLocation: new Map([
        [
          "loc1",
          { locationId: "loc1", locationName: "Colombo", total: 300, orderCount: 3 },
        ],
      ]),
    });

    const rows = buildLocationShareRows(emptyCohort(byMerchant), "a");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.locationTotal).toBe(400);
    expect(rows[0]?.selfSharePct).toBe(25);
    expect(rows[0]?.peers).toHaveLength(1);
    expect(rows[0]?.peers[0]?.merchantId).toBe("b");
    expect(rows[0]?.peers[0]?.sharePct).toBe(75);
  });

  it("includes peer-only locations with zero self share", () => {
    const byMerchant = new Map();
    byMerchant.set("a", {
      merchantId: "a",
      displayName: "Ada",
      total: 50,
      orderCount: 1,
      byLocation: new Map([
        [
          "loc2",
          { locationId: "loc2", locationName: "Kandy", total: 50, orderCount: 1 },
        ],
      ]),
    });
    byMerchant.set("b", {
      merchantId: "b",
      displayName: "Bea",
      total: 200,
      orderCount: 2,
      byLocation: new Map([
        [
          "loc1",
          { locationId: "loc1", locationName: "Colombo", total: 200, orderCount: 2 },
        ],
      ]),
    });

    const rows = buildLocationShareRows(emptyCohort(byMerchant), "a");
    expect(rows.map((r) => r.locationId)).toEqual(["loc2", "loc1"]);
    const peerOnly = rows.find((r) => r.locationId === "loc1");
    expect(peerOnly?.selfAmount).toBe(0);
    expect(peerOnly?.selfSharePct).toBe(0);
    expect(peerOnly?.peers[0]?.merchantId).toBe("b");
  });

  it("caps peers and sorts by amount desc", () => {
    const byLocationSelf = new Map([
      ["loc1", { locationId: "loc1", locationName: "Colombo", total: 10, orderCount: 1 }],
    ]);
    const byMerchant = new Map();
    byMerchant.set("self", {
      merchantId: "self",
      displayName: "Self",
      total: 10,
      orderCount: 1,
      byLocation: byLocationSelf,
    });
    for (let i = 1; i <= 10; i += 1) {
      byMerchant.set(`p${i}`, {
        merchantId: `p${i}`,
        displayName: `Peer ${i}`,
        total: i * 10,
        orderCount: i,
        byLocation: new Map([
          [
            "loc1",
            {
              locationId: "loc1",
              locationName: "Colombo",
              total: i * 10,
              orderCount: i,
            },
          ],
        ]),
      });
    }

    const rows = buildLocationShareRows(emptyCohort(byMerchant), "self", 8);
    expect(rows[0]?.peers).toHaveLength(8);
    expect(rows[0]?.peers[0]?.total).toBeGreaterThanOrEqual(rows[0]?.peers[1]?.total ?? 0);
  });
});
