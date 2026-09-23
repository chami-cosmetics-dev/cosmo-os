import { afterEach, describe, expect, it, vi } from "vitest";

import {
  pushBookNoteSpecialNotesToErp,
  setBookNoteSpecialNoteOnErp,
} from "@/lib/book-notes/erp-special-note";

const instance = {
  baseUrl: "https://erp.example.com",
  apiKey: "key",
  apiSecret: "secret",
} as never;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sentForm(fetchMock: ReturnType<typeof vi.fn>, call = 0): URLSearchParams {
  const [, init] = fetchMock.mock.calls[call]!;
  return new URLSearchParams((init as RequestInit).body as string);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("setBookNoteSpecialNoteOnErp", () => {
  it("posts book_note_id, idx_no, special_note, and optional company", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        message: {
          book_note_id: "day_1",
          idx_no: "1",
          special_note: "split cash/card",
          rows_updated: 1,
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await setBookNoteSpecialNoteOnErp({
      erpnextInstance: instance,
      bookNoteId: "day_1",
      idxNo: "1",
      specialNote: "split cash/card",
      company: "SPK Trading",
    });

    expect(result.ok).toBe(true);
    expect(result.rowsUpdated).toBe(1);
    const form = sentForm(fetchMock);
    expect(form.get("book_note_id")).toBe("day_1");
    expect(form.get("idx_no")).toBe("1");
    expect(form.get("special_note")).toBe("split cash/card");
    expect(form.get("company")).toBe("SPK Trading");
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://erp.example.com/api/method/bank_recon_set_book_note_special_note",
    );
  });

  it("rejects notes over 1500 characters before calling ERP", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await setBookNoteSpecialNoteOnErp({
      erpnextInstance: instance,
      bookNoteId: "day_1",
      idxNo: "1",
      specialNote: "x".repeat(1501),
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/1500/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("pushBookNoteSpecialNotesToErp", () => {
  it("posts only rows with non-empty notes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        message: {
          book_note_id: "day_1",
          idx_no: "2",
          special_note: "keep",
          rows_updated: 1,
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await pushBookNoteSpecialNotesToErp({
      erpnextInstance: instance,
      bookNoteId: "day_1",
      company: "SPK",
      rows: [
        { idx_no: "1", special_note: null },
        { idx_no: "2", special_note: "keep" },
        { idx_no: "3", special_note: "   " },
      ],
    });

    expect(result.attempted).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentForm(fetchMock).get("idx_no")).toBe("2");
  });

  it("skips the ERP call when no notes are set", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await pushBookNoteSpecialNotesToErp({
      erpnextInstance: instance,
      bookNoteId: "day_1",
      company: "SPK",
      rows: [
        { idx_no: "1", special_note: null },
        { idx_no: "2", special_note: "" },
      ],
    });

    expect(result).toEqual({
      attempted: 0,
      succeeded: 0,
      failed: 0,
      errors: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
