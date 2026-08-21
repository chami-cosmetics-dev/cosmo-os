import { describe, expect, it } from "vitest";

import { compareOldestContactedFirst } from "@/lib/customer-insight/call-queue";

describe("compareOldestContactedFirst", () => {
  it("puts never-contacted first", () => {
    const never = { lastContactedAt: null };
    const old = { lastContactedAt: new Date("2026-01-01") };
    const recent = { lastContactedAt: new Date("2026-08-01") };
    const rows = [recent, never, old].sort(compareOldestContactedFirst);
    expect(rows).toEqual([never, old, recent]);
  });
});
