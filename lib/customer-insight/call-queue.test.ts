import { describe, expect, it } from "vitest";

import {
  compareCallQueueCandidateOrder,
  compareOldestContactedFirst,
  compareOldestPurchaseFirst,
  takeFirstEligibleContactIds,
} from "@/lib/customer-insight/call-queue";

describe("compareOldestContactedFirst", () => {
  it("puts never-contacted first", () => {
    const never = { lastContactedAt: null };
    const old = { lastContactedAt: new Date("2026-01-01") };
    const recent = { lastContactedAt: new Date("2026-08-01") };
    const rows = [recent, never, old].sort(compareOldestContactedFirst);
    expect(rows).toEqual([never, old, recent]);
  });
});

describe("compareCallQueueCandidateOrder", () => {
  it("uses oldest last purchase when last contacted ties", () => {
    const olderPurchase = {
      lastContactedAt: null,
      lastPurchaseAt: new Date("2026-01-01"),
    };
    const newerPurchase = {
      lastContactedAt: null,
      lastPurchaseAt: new Date("2026-08-01"),
    };
    const rows = [newerPurchase, olderPurchase].sort(compareCallQueueCandidateOrder);
    expect(rows).toEqual([olderPurchase, newerPurchase]);
  });

  it("still sorts by last contacted before last purchase", () => {
    const contactedRecently = {
      lastContactedAt: new Date("2026-08-01"),
      lastPurchaseAt: new Date("2026-01-01"),
    };
    const neverContacted = {
      lastContactedAt: null,
      lastPurchaseAt: new Date("2026-08-01"),
    };
    const rows = [contactedRecently, neverContacted].sort(compareCallQueueCandidateOrder);
    expect(rows).toEqual([neverContacted, contactedRecently]);
  });
});

describe("compareOldestPurchaseFirst", () => {
  it("puts missing last purchase last", () => {
    const withPurchase = { lastPurchaseAt: new Date("2026-01-01") };
    const withoutPurchase = { lastPurchaseAt: null };
    const rows = [withoutPurchase, withPurchase].sort(compareOldestPurchaseFirst);
    expect(rows).toEqual([withPurchase, withoutPurchase]);
  });
});

describe("takeFirstEligibleContactIds", () => {
  it("skips queued and hidden when filling N", () => {
    const rows = [
      { contactId: "q1", hidden: false, queued: true },
      { contactId: "q2", hidden: false, queued: true },
      { contactId: "q3", hidden: false, queued: true },
      { contactId: "a", hidden: false, queued: false },
      { contactId: "h", hidden: true, queued: false },
      { contactId: "b", hidden: false, queued: false },
    ];
    expect(takeFirstEligibleContactIds(rows, 2)).toEqual(["a", "b"]);
  });
});
