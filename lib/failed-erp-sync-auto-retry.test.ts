import { describe, expect, it } from "vitest";

import {
  ERP_SYNC_INTERRUPTED_MESSAGE,
  isStalePendingErpSync,
} from "@/lib/failed-erp-sync-auto-retry";

describe("isStalePendingErpSync", () => {
  const now = new Date("2026-07-18T12:00:00.000Z");

  it("is false while pending is still within the 5-minute allowance", () => {
    expect(
      isStalePendingErpSync({
        erpnextInvoiceId: "pending",
        erpnextSyncError: null,
        erpnextSyncStartedAt: new Date("2026-07-18T11:56:00.000Z"),
        now,
      })
    ).toBe(false);
  });

  it("is true when pending without error is older than 5 minutes", () => {
    expect(
      isStalePendingErpSync({
        erpnextInvoiceId: "pending",
        erpnextSyncError: null,
        erpnextSyncStartedAt: new Date("2026-07-18T11:54:00.000Z"),
        now,
      })
    ).toBe(true);
  });

  it("falls back to updatedAt when startedAt is missing", () => {
    expect(
      isStalePendingErpSync({
        erpnextInvoiceId: "pending",
        erpnextSyncError: null,
        erpnextSyncStartedAt: null,
        updatedAt: new Date("2026-07-18T11:50:00.000Z"),
        now,
      })
    ).toBe(true);
  });

  it("is false when an error is already recorded", () => {
    expect(
      isStalePendingErpSync({
        erpnextInvoiceId: "pending",
        erpnextSyncError: ERP_SYNC_INTERRUPTED_MESSAGE,
        erpnextSyncStartedAt: new Date("2026-07-18T11:00:00.000Z"),
        now,
      })
    ).toBe(false);
  });

  it("is false for non-pending invoice ids", () => {
    expect(
      isStalePendingErpSync({
        erpnextInvoiceId: "ACC-SINV-2026-0001",
        erpnextSyncError: null,
        erpnextSyncStartedAt: new Date("2026-07-18T11:00:00.000Z"),
        now,
      })
    ).toBe(false);
  });
});
