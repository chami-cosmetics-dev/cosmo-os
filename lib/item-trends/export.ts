import type { ItemMovementRow, RopSuggestionRow } from "@/lib/item-trends/types";

export type FocusExportRow = {
  sku: string;
  title: string | null;
  priority: string;
  unitsCurrent: number;
  signal: string;
  signalSource: string;
  context: string;
};

export function buildFocusListCsv(rows: FocusExportRow[]): string {
  const header = ["sku", "title", "priority", "units", "signal", "signal_source", "context"];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        csvEscape(row.sku),
        csvEscape(row.title ?? ""),
        csvEscape(row.priority),
        String(row.unitsCurrent),
        csvEscape(row.signal),
        csvEscape(row.signalSource),
        csvEscape(row.context),
      ].join(","),
    );
  }
  return lines.join("\n");
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function movementToFocusExport(
  row: ItemMovementRow,
  context = "movement",
): FocusExportRow {
  return {
    sku: row.sku,
    title: row.title,
    priority: row.priority,
    unitsCurrent: row.unitsCurrent,
    signal: row.signal,
    signalSource: row.signalSource,
    context,
  };
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function buildRopSuggestionCsv(rows: RopSuggestionRow[]): string {
  const header = [
    "sku",
    "priority",
    "brand",
    "peak_month",
    "peak_month_units",
    "window_total",
    "current_total_rop",
    "suggested_rop",
    "overlay",
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        csvEscape(row.sku),
        csvEscape(row.priority),
        csvEscape(row.brand ?? ""),
        csvEscape(row.peakMonth ?? ""),
        String(row.peakMonthSales),
        String(row.windowSales),
        String(row.currentRop ?? ""),
        String(row.suggestedRop),
        csvEscape(row.overlay),
      ].join(","),
    );
  }
  return lines.join("\n");
}

export function buildCoverCsv(rows: Array<{
  sku: string;
  title: string | null;
  brand: string | null;
  outletName: string;
  channelKind: string;
  unitsInRange: number;
  stockQty: number;
  weekNeed: number;
  last30AvgDaily: number;
  coverDays: number | null;
  ropQty: number | null;
  isOosInRange: boolean;
}>): string {
  const header = [
    "sku",
    "title",
    "brand",
    "location",
    "channel",
    "rop",
    "units_in_range",
    "stock",
    "week_need",
    "last_30d_avg_sale",
    "cover_days",
    "oos_in_range",
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        csvEscape(row.sku),
        csvEscape(row.title ?? ""),
        csvEscape(row.brand ?? ""),
        csvEscape(row.outletName),
        csvEscape(row.channelKind),
        String(row.ropQty ?? ""),
        String(row.unitsInRange),
        String(row.stockQty),
        String(row.weekNeed),
        String(row.last30AvgDaily),
        String(row.coverDays ?? ""),
        row.isOosInRange ? "yes" : "no",
      ].join(","),
    );
  }
  return lines.join("\n");
}
