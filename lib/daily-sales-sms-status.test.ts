import { describe, expect, it } from "vitest";

import {
  DAILY_SALES_SMS_NEXT_RUN_LABEL,
  buildDailySalesSmsStatusSummary,
} from "@/lib/daily-sales-sms-status";

describe("buildDailySalesSmsStatusSummary", () => {
  it("handles empty config", () => {
    const summary = buildDailySalesSmsStatusSummary({
      enabled: undefined,
      recipients: [],
      lastLog: null,
    });
    expect(summary.enabled).toBe(false);
    expect(summary.recipientCount).toBe(0);
    expect(summary.lastAttempt).toBeNull();
    expect(summary.nextScheduledLabel).toBe(DAILY_SALES_SMS_NEXT_RUN_LABEL);
  });

  it("counts recipients and maps last attempt", () => {
    const createdAt = new Date("2026-07-14T10:00:00.000Z");
    const summary = buildDailySalesSmsStatusSummary({
      enabled: true,
      recipients: ["0773215011", " 0773215011 ", "0761234567"],
      lastLog: {
        reportDate: "2026-07-13",
        status: "failed",
        createdAt,
        errorSummary: "provider error",
      },
    });
    expect(summary.enabled).toBe(true);
    expect(summary.recipientCount).toBe(2);
    expect(summary.lastAttempt).toEqual({
      reportDate: "2026-07-13",
      status: "failed",
      createdAt,
      errorSummary: "provider error",
    });
  });
});
