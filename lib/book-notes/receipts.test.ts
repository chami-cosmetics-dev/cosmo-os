import { describe, expect, it } from "vitest";

import { collectBookNoteNamesFromVerifyRows } from "@/lib/book-notes/receipts";

describe("collectBookNoteNamesFromVerifyRows", () => {
  it("collects unique book_note_name values", () => {
    const names = collectBookNoteNamesFromVerifyRows([
      { book_note_name: "BNE-1" },
      { book_note_name: "BNE-2" },
      { book_note_name: "BNE-1" },
      { status: "no_invoice_number" },
      null,
    ]);
    expect(names).toEqual(["BNE-1", "BNE-2"]);
  });

  it("ignores blank names", () => {
    expect(
      collectBookNoteNamesFromVerifyRows([
        { book_note_name: "  " },
        { book_note_name: "" },
      ]),
    ).toEqual([]);
  });
});
