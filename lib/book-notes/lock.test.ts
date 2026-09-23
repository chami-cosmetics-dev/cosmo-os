import { describe, expect, it } from "vitest";

import { isBookNoteDayLocked, isBookNoteWritable } from "@/lib/book-notes/lock";

const now = new Date("2026-09-02T04:30:00.000Z");
const todayOnly = { canBackdate: false };
const canBackdate = { canBackdate: true };
const ownerTodayOnly = { canBackdate: false, isOwner: true };

describe("book-notes lock", () => {
  it("allows today without backdate", () => {
    expect(isBookNoteWritable("2026-09-02", now, todayOnly)).toBe(true);
    expect(isBookNoteDayLocked("2026-09-02", now, todayOnly)).toBe(false);
  });

  it("locks past dates without backdate", () => {
    expect(isBookNoteWritable("2026-09-01", now, todayOnly)).toBe(false);
    expect(isBookNoteDayLocked("2026-09-01", now, todayOnly)).toBe(true);
    expect(isBookNoteWritable("2026-08-31", now, todayOnly)).toBe(false);
  });

  it("allows past dates when canBackdate is set", () => {
    expect(isBookNoteWritable("2026-08-31", now, canBackdate)).toBe(true);
    expect(isBookNoteDayLocked("2026-08-31", now, canBackdate)).toBe(false);
  });

  it("ownership alone does not unlock past dates", () => {
    expect(isBookNoteWritable("2026-08-31", now, ownerTodayOnly)).toBe(false);
    expect(isBookNoteDayLocked("2026-08-31", now, ownerTodayOnly)).toBe(true);
  });

  it("still locks a past sheet without canBackdate", () => {
    expect(
      isBookNoteWritable("2026-08-31", now, { canBackdate: false, isOwner: false }),
    ).toBe(false);
  });

  it("locks future dates for everyone", () => {
    expect(isBookNoteWritable("2026-09-03", now, todayOnly)).toBe(false);
    expect(isBookNoteWritable("2026-09-03", now, canBackdate)).toBe(false);
    expect(isBookNoteWritable("2026-09-03", now, ownerTodayOnly)).toBe(false);
    expect(isBookNoteDayLocked("2026-09-03", now, canBackdate)).toBe(true);
  });
});
