import { describe, expect, it } from "vitest";

import { isBookNoteDayLocked, isBookNoteWritable } from "@/lib/book-notes/lock";

describe("book-notes lock", () => {
  it("allows today in Asia/Colombo", () => {
    // Fixed instant: 2026-08-03 10:00 +05:30
    const now = new Date("2026-08-03T04:30:00.000Z");
    expect(isBookNoteWritable("2026-08-03", now)).toBe(true);
    expect(isBookNoteDayLocked("2026-08-03", now)).toBe(false);
  });

  it("locks yesterday", () => {
    const now = new Date("2026-08-03T04:30:00.000Z");
    expect(isBookNoteWritable("2026-08-02", now)).toBe(false);
    expect(isBookNoteDayLocked("2026-08-02", now)).toBe(true);
  });

  it("locks future dates", () => {
    const now = new Date("2026-08-03T04:30:00.000Z");
    expect(isBookNoteWritable("2026-08-04", now)).toBe(false);
  });
});
