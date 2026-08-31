import { describe, expect, it } from "vitest";

import {
  buildStockCountSnapshot,
  countedListRowValues,
  snapshotItemStatus,
  snapshotRowsForBucket,
} from "@/lib/store-stock-count/export-snapshot";
import type {
  StoreStockCountSavedItem,
  StoreStockCountSavedReport,
} from "@/lib/store-stock-count/types";

function item(
  sku: string,
  stock: number,
  manualCount: number | null,
): StoreStockCountSavedItem {
  return {
    id: sku.toLowerCase(),
    reportId: "r1",
    sku,
    skuKey: sku,
    name: `Item ${sku}`,
    description: "",
    barcodes: [`${sku}-bc`],
    stockByCompany: {},
    stockByWarehouse: { w1: stock },
    stockSum: stock,
    qbStock: null,
    manualCount,
  };
}

describe("snapshotItemStatus", () => {
  it("keeps uncounted rows pending", () => {
    expect(snapshotItemStatus("draft", null, 10)).toBe("Pending");
  });

  it("marks short counts ongoing only while draft", () => {
    expect(snapshotItemStatus("draft", 3, 10)).toBe("Ongoing");
    expect(snapshotItemStatus("submitted", 3, 10)).toBe("Difference");
  });

  it("marks exact match done", () => {
    expect(snapshotItemStatus("draft", 10, 10)).toBe("Done");
  });
});

describe("buildStockCountSnapshot", () => {
  it("groups counted rows into Ongoing, Done, and Difference", () => {
    const report: StoreStockCountSavedReport = {
      id: "r1",
      title: "Bay A",
      status: "draft",
      selectedCompanies: [],
      warehouses: [
        {
          key: "w1",
          label: "Shop",
          warehouse: "Shop",
          instanceId: "i1",
          instanceLabel: "ERP1",
          erpCompany: "Pevi",
        },
      ],
      createdAt: "2026-08-31T00:00:00.000Z",
      updatedAt: "2026-08-31T00:00:00.000Z",
      submittedAt: null,
      createdByName: null,
      updatedByName: null,
      submittedByName: null,
      items: [
        item("DONE1", 5, 5),
        item("PEND1", 2, null),
        item("ONG1", 10, 3),
        item("DIFF1", 4, 7),
      ],
    };

    const snapshot = buildStockCountSnapshot(
      report,
      new Date("2026-08-31T10:00:00.000Z"),
    );
    expect(snapshot.isDraft).toBe(true);
    expect(snapshot.pending).toBe(1);
    expect(snapshot.ongoing).toBe(1);
    expect(snapshot.done).toBe(1);
    expect(snapshot.difference).toBe(1);
    expect(snapshot.ongoingRows.map((row) => row.sku)).toEqual(["ONG1"]);
    expect(snapshot.doneRows.map((row) => row.sku)).toEqual(["DONE1"]);
    expect(snapshot.differenceRows.map((row) => row.sku)).toEqual(["DIFF1"]);
    expect(snapshot.countedRows.map((row) => row.sku)).toEqual([
      "ONG1",
      "DONE1",
      "DIFF1",
    ]);
    expect(snapshot.countedListHeaders).toEqual([
      "Item",
      "Barcode",
      "Total",
      "Count",
      "Diff",
    ]);
    expect(snapshotRowsForBucket(snapshot, "Done")[0]?.sku).toBe("DONE1");
    expect(countedListRowValues(snapshot, snapshot.doneRows[0]!)).toEqual([
      "DONE1",
      "DONE1-bc",
      5,
      5,
      0,
    ]);
    expect(countedListRowValues(snapshot, snapshot.ongoingRows[0]!)).toEqual([
      "ONG1",
      "ONG1-bc",
      10,
      3,
      -7,
    ]);
  });
});
