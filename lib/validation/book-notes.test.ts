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

  it("requires a KOKO order reference when the KOKO amount is above 0", () => {
    const missing = bookNotePutBodySchema.safeParse({
      companyLocationId: LOC,
      postingDate: "2026-08-03",
      rows: [
        {
          idxNo: "3",
          salesInvoice: "400-000401",
          cash: 0,
          card: 4450,
          cardReceiptRefLast4: "3109",
          koko: 13000,
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
          idxNo: "3",
          salesInvoice: "400-000401",
          cash: 0,
          card: 4450,
          cardReceiptRefLast4: "3109",
          koko: 13000,
          kokoReference: " ORDER 11465305 ",
          bankTransfer: 0,
        },
      ],
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.rows[0]!.kokoReference).toBe("ORDER11465305");
    }
  });

  it("requires a reference on every KOKO split line", () => {
    const missing = bookNotePutBodySchema.safeParse({
      companyLocationId: LOC,
      postingDate: "2026-08-03",
      rows: [
        {
          idxNo: "1",
          salesInvoice: "INV-1",
          splitLines: [
            { paymentMethod: "KOKO", amount: 1000, kokoReference: "11465305" },
            { paymentMethod: "KOKO", amount: 500 },
          ],
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
          splitLines: [
            { paymentMethod: "KOKO", amount: 1000, kokoReference: "#11465305" },
            { paymentMethod: "KOKO", amount: 500, kokoReference: "00011465305" },
          ],
        },
      ],
    });
    expect(ok.success).toBe(true);
  });

  it("accepts split payment rows without legacy card ref", () => {
    const r = bookNotePutBodySchema.safeParse({
      companyLocationId: LOC,
      postingDate: "2026-08-03",
      rows: [
        {
          idxNo: "1",
          salesInvoice: "INV-1",
          cash: 0,
          card: 0,
          koko: 0,
          bankTransfer: 0,
          splitLines: [
            { paymentMethod: "Card", amount: 10000, cardLast4: "1234" },
            { paymentMethod: "Cash", amount: 5000 },
          ],
        },
      ],
    });
    expect(r.success).toBe(true);
  });
  it("accepts special notes up to 1500 chars and rejects longer", () => {
    const ok = bookNotePutBodySchema.safeParse({
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
          specialNote: "x".repeat(1500),
        },
      ],
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.rows[0]!.specialNote).toHaveLength(1500);
    }

    const tooLong = bookNotePutBodySchema.safeParse({
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
          specialNote: "x".repeat(1501),
        },
      ],
    });
    expect(tooLong.success).toBe(false);
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
