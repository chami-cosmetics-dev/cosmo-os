import { describe, expect, it } from "vitest";

import { isBookNoteDayLocked, isBookNoteWritable } from "@/lib/book-notes/lock";

describe("book-notes lock", () => {
  it("allows today in Asia/Colombo", () => {
    const now = new Date("2026-08-03T04:30:00.000Z");
    expect(isBookNoteWritable("2026-08-03", now)).toBe(true);
    expect(isBookNoteDayLocked("2026-08-03", now)).toBe(false);
  });

  it("allows yesterday (history edit / resend)", () => {
    const now = new Date("2026-08-03T04:30:00.000Z");
    expect(isBookNoteWritable("2026-08-02", now)).toBe(true);
    expect(isBookNoteDayLocked("2026-08-02", now)).toBe(false);
  });

  it("locks future dates", () => {
    const now = new Date("2026-08-03T04:30:00.000Z");
    expect(isBookNoteWritable("2026-08-04", now)).toBe(false);
    expect(isBookNoteDayLocked("2026-08-04", now)).toBe(true);
  });
});
