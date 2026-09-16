import { describe, expect, it } from "vitest";

import { buildLoyaltyEligibleWeeklyEmailHtml } from "@/lib/loyalty-eligible-weekly-email";
import type { LoyaltyEligibleSummaryDto } from "@/lib/customer-insight/loyalty-eligible-summary";

describe("loyalty-eligible-weekly-email", () => {
  it("builds subject and includes merchant row", () => {
    const summary: LoyaltyEligibleSummaryDto = {
      asOf: "2026-09-16",
      mtdFrom: "2026-09-01",
      weekFrom: "2026-09-08",
      weekTo: "2026-09-14",
      company: {
        pending: 3,
        mtdNewlyEligible: 1,
        mtdUpdated: 2,
        weekNewlyEligible: 1,
        weekUpdated: 1,
      },
      merchants: [
        {
          merchantLabel: "MER91",
          pending: 3,
          newlyEligible: 1,
          updated: 2,
          mtdNewlyEligible: 1,
          mtdUpdated: 2,
          weekNewlyEligible: 1,
          weekUpdated: 1,
        },
      ],
    };
    const built = buildLoyaltyEligibleWeeklyEmailHtml(summary, "Cosmetics.lk");
    expect(built.subject).toContain("2026-09-08");
    expect(built.html).toContain("MER91");
    expect(built.text).toContain("MER91");
  });
});
