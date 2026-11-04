import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildSendDraftStorageKey,
  loadSendDraft,
  normalizeSendDraft,
  saveSendDraft,
  SEND_DRAFT_KEY,
  SEND_DRAFT_VERSION,
  type MaterialTransferSendDraft,
} from "@/lib/material-transfer/send-draft";

function draft(partial: Partial<MaterialTransferSendDraft> = {}): MaterialTransferSendDraft {
  return {
    version: SEND_DRAFT_VERSION,
    companyId: "co",
    userId: "usr",
    updatedAt: "2026-10-19T12:00:00.000Z",
    slot: "erp1",
    company: "",
    source: "Main Warehouse - Cosmo",
    target: "OGF Warehouse - Cosmo",
    lines: [
      {
        itemCode: "NEH09_1",
        itemName: "Item",
        barcode: "123",
        uom: "Nos",
        qty: 2,
        availableQty: 5,
      },
    ],
    ...partial,
  };
}

describe("buildSendDraftStorageKey", () => {
  it("scopes the key by company and user", () => {
    expect(buildSendDraftStorageKey("co", "usr")).toBe(`${SEND_DRAFT_KEY}:co:usr`);
  });
});

describe("normalizeSendDraft", () => {
  it("keeps the first row for a repeated SKU and drops a bad qty", () => {
    const normalized = normalizeSendDraft(
      draft({
        lines: [
          {
            itemCode: "NEH09_1",
            itemName: "First",
            barcode: "123",
            uom: "Nos",
            qty: 2,
            availableQty: 5,
          },
          {
            itemCode: "neh09_1",
            itemName: "Duplicate",
            barcode: "999",
            uom: "Nos",
            qty: 9,
            availableQty: 1,
          },
          {
            itemCode: "BAD",
            itemName: "Bad",
            barcode: "",
            uom: "Nos",
            qty: 0,
            availableQty: null,
          },
        ],
      }),
    );
    expect(normalized.lines).toEqual([
      {
        itemCode: "NEH09_1",
        itemName: "First",
        barcode: "123",
        uom: "Nos",
        qty: 2,
        availableQty: 5,
        taxStatus: null,
        slot: null,
      },
    ]);
  });

  it("keeps ERP tax status on a line", () => {
    const normalized = normalizeSendDraft(
      draft({
        lines: [
          {
            itemCode: "AJCC01_1",
            itemName: "Non vat item",
            barcode: "",
            uom: "Nos",
            qty: 1,
            availableQty: 4,
            taxStatus: "Non Vat",
          },
        ],
      }),
    );
    expect(normalized.lines[0]?.taxStatus).toBe("Non Vat");
  });
});

describe("saveSendDraft", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips a draft and removes it when the list is empty", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
      },
    });

    saveSendDraft(draft());
    expect(loadSendDraft("co", "usr")?.lines).toHaveLength(1);
    expect(loadSendDraft("co", "usr")?.source).toBe("Main Warehouse - Cosmo");

    saveSendDraft(draft({ lines: [] }));
    expect(loadSendDraft("co", "usr")).toBeNull();
  });
});
