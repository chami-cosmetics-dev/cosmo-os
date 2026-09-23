import { describe, expect, it } from "vitest";

import { bookNoteErpSyncStatus } from "@/lib/book-notes/erp-sync-status";

describe("bookNoteErpSyncStatus", () => {
  it("returns synced when erpSyncedAt set", () => {
    expect(
      bookNoteErpSyncStatus({
        erpSyncedAt: new Date(),
        erpSyncFailedAt: null,
      }),
    ).toBe("synced");
  });

  it("returns failed when only failedAt set", () => {
    expect(
      bookNoteErpSyncStatus({
        erpSyncedAt: null,
        erpSyncFailedAt: new Date(),
      }),
    ).toBe("failed");
  });

  it("returns pending when neither set", () => {
    expect(
      bookNoteErpSyncStatus({
        erpSyncedAt: null,
        erpSyncFailedAt: null,
      }),
    ).toBe("pending");
  });

  it("prefers synced over failed", () => {
    expect(
      bookNoteErpSyncStatus({
        erpSyncedAt: new Date(),
        erpSyncFailedAt: new Date(),
      }),
    ).toBe("synced");
  });
});
