import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deleteBookNoteFromErp,
  erpDeletedCount,
} from "@/lib/book-notes/erp-verify";

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

/** Pull the form-encoded body out of the fetch mock's last call. */
function sentForm(fetchMock: ReturnType<typeof vi.fn>): URLSearchParams {
  const [, init] = fetchMock.mock.calls[0]!;
  return new URLSearchParams((init as RequestInit).body as string);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("deleteBookNoteFromErp", () => {
  it("sends an empty rows_json with the sheet id so ss9 removes the entries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ message: { summary: { deleted_count: 3 }, rows: [] } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await deleteBookNoteFromErp({
      erpnextInstance: instance,
      bookNoteId: "day_abc123",
      company: "SPK Trading (Pvt) Ltd",
      postingDate: "2026-09-10",
    });

    expect(result.ok).toBe(true);
    const form = sentForm(fetchMock);
    expect(form.get("rows_json")).toBe("[]");
    expect(form.get("book_note_id")).toBe("day_abc123");
    expect(form.get("company")).toBe("SPK Trading (Pvt) Ltd");
    expect(form.get("posting_date")).toBe("2026-09-10");
    expect(erpDeletedCount(result)).toBe(3);
  });

  it("accepts a delete response carrying no rows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ message: { summary: { deleted_count: 0 }, rows: [] } }),
      ),
    );

    const result = await deleteBookNoteFromErp({
      erpnextInstance: instance,
      bookNoteId: "day_abc123",
      company: "SPK",
      postingDate: "2026-09-10",
    });

    // A verify push would call this shape a failure; a delete must not.
    expect(result.ok).toBe(true);
    expect(erpDeletedCount(result)).toBe(0);
  });

  it("reads deleted_count when ss9 reports it without a summary wrapper", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ message: { deleted_count: 2 } })),
    );

    const result = await deleteBookNoteFromErp({
      erpnextInstance: instance,
      bookNoteId: "day_abc123",
      company: "SPK",
      postingDate: "2026-09-10",
    });

    expect(result.ok).toBe(true);
    expect(erpDeletedCount(result)).toBe(2);
  });

  it("reports an ERP error instead of silently succeeding", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ exception: "PermissionError: not allowed" }, 403),
      ),
    );

    const result = await deleteBookNoteFromErp({
      erpnextInstance: instance,
      bookNoteId: "day_abc123",
      company: "SPK",
      postingDate: "2026-09-10",
    });

    expect(result.ok).toBe(false);
    expect(result.httpStatus).toBe(403);
    expect(erpDeletedCount(result)).toBe(0);
  });

  it("fails closed when the shop has no ERP credentials", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await deleteBookNoteFromErp({
      erpnextInstance: null,
      bookNoteId: "day_abc123",
      company: "SPK",
      postingDate: "2026-09-10",
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("ERP_CREDENTIALS_MISSING");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses to call ERP without a book note id", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await deleteBookNoteFromErp({
      erpnextInstance: instance,
      bookNoteId: "   ",
      company: "SPK",
      postingDate: "2026-09-10",
    });

    expect(result.code).toBe("BOOK_NOTE_ID_MISSING");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
