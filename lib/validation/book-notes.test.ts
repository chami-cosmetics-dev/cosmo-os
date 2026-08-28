import { describe, expect, it } from "vitest";

import {
  bookNotePutBodySchema,
  bookNoteRetrieveQuerySchema,
} from "@/lib/validation/book-notes";

const LOC = "clabcdefghijklmnopqrstuvwx";

describe("bookNotePutBodySchema", () => {
  it("accepts valid body", () => {
    const r = bookNotePutBodySchema.safeParse({
      companyLocationId: LOC,
      postingDate: "2026-08-03",
      rows: [
        {
          idxNo: "1",
          salesInvoice: "INV-1",
          cash: 100,
          card: 0,
          koko: 0,
          bankTransfer: 0,
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("rejects invalid date", () => {
    const r = bookNotePutBodySchema.safeParse({
      companyLocationId: LOC,
      postingDate: "03-08-2026",
      rows: [],
    });
    expect(r.success).toBe(false);
  });

  it("requires card receipt last 4 when card amount > 0", () => {
    const missing = bookNotePutBodySchema.safeParse({
      companyLocationId: LOC,
      postingDate: "2026-08-03",
      rows: [
        {
          idxNo: "1",
          salesInvoice: "INV-1",
          cash: 0,
          card: 500,
          koko: 0,
          bankTransfer: 0,
        },
      ],
    });
    expect(missing.success).toBe(false);

    const ok = bookNotePutBodySchema.safeParse({
      companyLocationId: LOC,
      postingDate: "2026-08-03",
      rows: [
        {
          idxNo: "1",
          salesInvoice: "INV-1",
          cash: 0,
          card: 500,
          cardReceiptRefLast4: "1234",
          koko: 0,
          bankTransfer: 0,
        },
      ],
    });
    expect(ok.success).toBe(true);
  });
});

describe("bookNoteRetrieveQuerySchema", () => {
  it("requires postingDate or from+to", () => {
    expect(
      bookNoteRetrieveQuerySchema.safeParse({ companyLocationId: LOC }).success,
    ).toBe(false);
  });

  it("accepts single postingDate", () => {
    const r = bookNoteRetrieveQuerySchema.safeParse({
      companyLocationId: LOC,
      postingDate: "2026-08-03",
    });
    expect(r.success).toBe(true);
  });

  it("rejects from after to", () => {
    const r = bookNoteRetrieveQuerySchema.safeParse({
      companyLocationId: LOC,
      from: "2026-08-10",
      to: "2026-08-01",
    });
    expect(r.success).toBe(false);
  });
});
