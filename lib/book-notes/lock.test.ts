import { describe, expect, it } from "vitest";

import { isBookNoteDayLocked, isBookNoteWritable } from "@/lib/book-notes/lock";

const now = new Date("2026-09-02T04:30:00.000Z");
const merchant = { canBackdate: false };
const admin = { canBackdate: true };

describe("book-notes lock", () => {
  it("allows today for merchants", () => {
    expect(isBookNoteWritable("2026-09-02", now, merchant)).toBe(true);
    expect(isBookNoteDayLocked("2026-09-02", now, merchant)).toBe(false);
  });

  it("locks past dates for merchants", () => {
    expect(isBookNoteWritable("2026-09-01", now, merchant)).toBe(false);
    expect(isBookNoteDayLocked("2026-09-01", now, merchant)).toBe(true);
    expect(isBookNoteWritable("2026-08-31", now, merchant)).toBe(false);
  });

  it("allows past dates for book_notes.admin", () => {
    expect(isBookNoteWritable("2026-08-31", now, admin)).toBe(true);
    expect(isBookNoteDayLocked("2026-08-31", now, admin)).toBe(false);
  });

  it("locks future dates for everyone", () => {
    expect(isBookNoteWritable("2026-09-03", now, merchant)).toBe(false);
    expect(isBookNoteWritable("2026-09-03", now, admin)).toBe(false);
    expect(isBookNoteDayLocked("2026-09-03", now, admin)).toBe(true);
  });
});
