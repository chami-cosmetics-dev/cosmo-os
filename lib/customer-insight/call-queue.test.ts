import { describe, expect, it } from "vitest";

import {
  compareOldestContactedFirst,
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
