import { describe, expect, it } from "vitest";

import {
  formatDailySalesSmsBody,
  formatSalesAmount,
  getPreviousColomboReportDate,
  isValidReportDate,
  monthStartYmd,
  normalizeRecipientList,
  shouldSkipAutomaticSend,
} from "@/lib/daily-sales-sms";

describe("daily-sales-sms helpers", () => {
  it("formats amounts with thousand separators", () => {
    expect(formatSalesAmount(1970256)).toBe("1,970,256");
    expect(formatSalesAmount(198)).toBe("198");
  });

  it("builds leadership SMS body layout", () => {
    const body = formatDailySalesSmsBody({
      reportDate: "2026-06-30",
      dayValue: 1970256,
      dayCount: 198,
      mtdValue: 43287867,
      locations: [
        { code: "WEB", value: 25877955 },
        { code: "OGF", value: 5629055 },
      ],
    });

    expect(body).toContain("Day (2026-06-30)");
    expect(body).toContain("Value:  1,970,256");
    expect(body).toContain("Count:        198");
    expect(body).toContain("MTD Sales: 43,287,867");
    expect(body).toContain("MTD Sales (Location Wise):");
    expect(body).toContain("WEB->: 25,877,955");
    expect(body).toContain("OGF->: 5,629,055");
  });

  it("formats empty day with MTD locations", () => {
    const body = formatDailySalesSmsBody({
      reportDate: "2026-07-01",
      dayValue: 0,
      dayCount: 0,
      mtdValue: 1000,
      locations: [{ code: "HO", value: 1000 }],
    });
    expect(body).toContain("Value:  0");
    expect(body).toContain("Count:        0");
    expect(body).toContain("HO->: 1,000");
  });

  it("computes month start and validates report dates", () => {
    expect(monthStartYmd("2026-06-30")).toBe("2026-06-01");
    expect(isValidReportDate("2026-06-30")).toBe(true);
    expect(isValidReportDate("2026-6-30")).toBe(false);
    expect(isValidReportDate("not-a-date")).toBe(false);
  });

  it("returns previous Colombo calendar day", () => {
    // 2026-07-01 00:30 Colombo = 2026-06-30 19:00 UTC
    const prev = getPreviousColomboReportDate(new Date("2026-06-30T19:00:00.000Z"));
    expect(prev).toBe("2026-06-30");
  });

  it("normalizes and dedupes recipients", () => {
    expect(normalizeRecipientList(["0766713205", "0766713205", " 0771234567 "])).toEqual([
      "0766713205",
      "0771234567",
    ]);
    expect(normalizeRecipientList("0766713205\n0771234567")).toEqual([
      "0766713205",
      "0771234567",
    ]);
    expect(normalizeRecipientList(["abc", "12"])).toEqual([]);
  });

  it("skips automatic send when disabled, empty, or already sent", () => {
    expect(
      shouldSkipAutomaticSend({
        enabled: false,
        recipients: ["0766713205"],
        alreadySentSuccessfully: false,
      }),
    ).toEqual({ skip: true, status: "skipped_disabled" });

    expect(
      shouldSkipAutomaticSend({
        enabled: true,
        recipients: [],
        alreadySentSuccessfully: false,
      }),
    ).toEqual({ skip: true, status: "skipped_no_recipients" });

    expect(
      shouldSkipAutomaticSend({
        enabled: true,
        recipients: ["0766713205"],
        alreadySentSuccessfully: true,
      }),
    ).toEqual({ skip: true, status: "skipped_already_sent" });

    expect(
      shouldSkipAutomaticSend({
        enabled: true,
        recipients: ["0766713205"],
        alreadySentSuccessfully: false,
      }),
    ).toEqual({ skip: false });
  });
});
