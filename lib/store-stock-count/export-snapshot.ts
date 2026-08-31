import { difference } from "@/lib/store-stock-count/difference";
import type { StoreStockCountSavedReport } from "@/lib/store-stock-count/types";

export type StockCountSnapshotRow = {
  sku: string;
  name: string;
  barcode: string;
  warehouseStocks: Array<number | "">;
  totalQty: number | "";
  qbStock: number | "";
  manualCount: number | "";
  diff: number | "";
  status: string;
};

export const COUNTED_BUCKETS = ["Ongoing", "Done", "Difference"] as const;

export type CountedBucket = (typeof COUNTED_BUCKETS)[number];

export type StockCountSnapshot = {
  title: string;
  status: string;
  capturedAt: string;
  isDraft: boolean;
  hasQbStock: boolean;
  warehouseLabels: string[];
  pending: number;
  ongoing: number;
  done: number;
  difference: number;
  counted: number;
  itemCount: number;
  totalManualCount: number;
  headers: string[];
  countedListHeaders: string[];
  rows: StockCountSnapshotRow[];
  countedRows: StockCountSnapshotRow[];
  ongoingRows: StockCountSnapshotRow[];
  doneRows: StockCountSnapshotRow[];
  differenceRows: StockCountSnapshotRow[];
};

export function filenameSafe(value: string) {
  return (
    value.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") ||
    "stock-count"
  );
}

export function snapshotItemStatus(
  reportStatus: string,
  manualCount: number | null,
  stockSum: number | null,
) {
  if (manualCount == null) return "Pending";
  if (stockSum == null) return "Difference";
  const diff = manualCount - stockSum;
  if (diff === 0) return "Done";
  if (diff < 0 && reportStatus !== "submitted") return "Ongoing";
  return "Difference";
}

export function buildStockCountSnapshot(
  report: StoreStockCountSavedReport,
  capturedAt = new Date(),
): StockCountSnapshot {
  const hasQbStock = report.items.some((item) => item.qbStock != null);
  const warehouseLabels = report.warehouses.map((w) => w.label);
  const headers = [
    "Item Code",
    "Name",
    "Barcode",
    ...warehouseLabels,
    "Total Quantity",
    ...(hasQbStock ? ["QB Stock"] : []),
    "Manual Count",
    "Difference",
    "Status",
  ];

  let pending = 0;
  let ongoing = 0;
  let done = 0;
  let differenceCount = 0;
  let totalManualCount = 0;

  const rows: StockCountSnapshotRow[] = report.items.map((item) => {
    const status = snapshotItemStatus(
      report.status,
      item.manualCount,
      item.stockSum,
    );
    if (status === "Pending") pending += 1;
    else if (status === "Ongoing") ongoing += 1;
    else if (status === "Done") done += 1;
    else differenceCount += 1;
    if (item.manualCount != null) totalManualCount += item.manualCount;

    const diff = difference(item.manualCount, item.stockSum);
    return {
      sku: item.sku,
      name: item.name,
      barcode: item.barcodes.join(" | "),
      warehouseStocks: report.warehouses.map(
        (w) => item.stockByWarehouse[w.key] ?? "",
      ),
      totalQty: item.stockSum ?? "",
      qbStock: hasQbStock ? (item.qbStock ?? "") : "",
      manualCount: item.manualCount ?? "",
      diff: diff ?? "",
      status,
    };
  });

  const ongoingRows = rows.filter((row) => row.status === "Ongoing");
  const doneRows = rows.filter((row) => row.status === "Done");
  const differenceRows = rows.filter((row) => row.status === "Difference");

  return {
    title: report.title,
    status: report.status,
    capturedAt: capturedAt.toISOString(),
    isDraft: report.status !== "submitted",
    hasQbStock,
    warehouseLabels,
    pending,
    ongoing,
    done,
    difference: differenceCount,
    counted: report.items.length - pending,
    itemCount: report.items.length,
    totalManualCount,
    headers,
    countedListHeaders: [
      "Item",
      "Barcode",
      "Total",
      ...(hasQbStock ? ["QB Stock"] : []),
      "Count",
      "Diff",
    ],
    rows,
    countedRows: [...ongoingRows, ...doneRows, ...differenceRows],
    ongoingRows,
    doneRows,
    differenceRows,
  };
}

export function snapshotRowsForBucket(
  snapshot: StockCountSnapshot,
  bucket: CountedBucket,
) {
  if (bucket === "Ongoing") return snapshot.ongoingRows;
  if (bucket === "Done") return snapshot.doneRows;
  return snapshot.differenceRows;
}

export function snapshotRowValues(
  snapshot: StockCountSnapshot,
  row: StockCountSnapshotRow,
): Array<string | number> {
  return [
    row.sku,
    row.name,
    row.barcode,
    ...row.warehouseStocks,
    row.totalQty,
    ...(snapshot.hasQbStock ? [row.qbStock] : []),
    row.manualCount,
    row.diff,
    row.status,
  ];
}

export function countedListRowValues(
  snapshot: StockCountSnapshot,
  row: StockCountSnapshotRow,
): Array<string | number> {
  return [
    row.sku,
    row.barcode,
    row.totalQty,
    ...(snapshot.hasQbStock ? [row.qbStock] : []),
    row.manualCount,
    row.diff,
  ];
}
