import type { ItemMovementRow } from "@/lib/item-trends/types";

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
