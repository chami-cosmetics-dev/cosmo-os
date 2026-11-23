"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import { formatAppIsoDate } from "@/lib/format-datetime";
import type { AgeingItem, AgeingDiagnostic } from "@/lib/inventory-ageing/calculate";
import { AGE_BUCKETS } from "@/lib/inventory-ageing/calculate";

type Report = {
  reportDate: string;
  historicalState: string;
  dataWarnings: string[];
  items: AgeingItem[];
  brandSummary: { brand: string; currency: string | null; stockUom: string; totalStock: number; totalCost: number; unpricedQty: number; costStatus: string; buckets: AgeingItem["buckets"] }[];
  grandTotal: { currency: string | null; stockUom: string; totalStock: number; totalCost: number; unpricedQty: number; costStatus: string; buckets: AgeingItem["buckets"] }[];
  reconciliation: { actualStockQty: number; eligibleStockQty: number; excludedIntercompanyQty: number; unallocatedStockQty: number; unpricedEligibleQty: number; discrepancies: AgeingDiagnostic[] };
  calculationStatus: string;
};
type Progress = { percent: number; status: string };
const fmt = (n: number | null) => n == null ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const labels = ["0–30", "31–60", "61–90", "91–150", "Above 150"];

export function InventoryAgeingPanel() {
  const [date, setDate] = useState(() => formatAppIsoDate(new Date()));
  const [report, setReport] = useState<Report | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [filter, setFilter] = useState("");
  const [exporting, setExporting] = useState(false);
  const load = async () => {
    if (progress) return;
    setProgress({ percent: 0, status: "Preparing Ageing Summary" });
    try {
      const response = await fetch(`/api/admin/purchasing/purchase-history/ageing-summary?date=${encodeURIComponent(date)}`, { cache: "no-store" });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to calculate ageing");
      }
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffered = "";
      let result: Report | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (value) buffered += value;
        const lines = buffered.split("\n");
        buffered = lines.pop() ?? "";
        for (const line of lines.filter(Boolean)) {
          const message = JSON.parse(line) as { percent?: number; status?: string; error?: string; report?: Report };
          if (message.error) throw new Error(message.error);
          if (typeof message.percent === "number") setProgress({ percent: message.percent, status: message.status ?? "Calculating Ageing Summary" });
          if (message.report) result = message.report;
        }
        if (done) break;
      }
      if (!result) throw new Error("Ageing Summary did not return a report");
      setReport(result);
    } catch (error) { notify.error(error instanceof Error ? error.message : "Failed to calculate ageing"); }
    finally { setProgress(null); }
  };
  const visible = report?.items.filter((row) => `${row.itemCode} ${row.description} ${row.brand}`.toLowerCase().includes(filter.toLowerCase())) ?? [];
  const exportReport = async () => {
    if (!report || exporting) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx-js-style");
      const book = XLSX.utils.book_new();
      const bucketValues = (buckets: AgeingItem["buckets"]) => AGE_BUCKETS.flatMap((bucket) => [buckets[bucket].qty, buckets[bucket].cost]);
      const append = (name: string, rows: (string | number | null)[][]) => {
        const sheet = XLSX.utils.aoa_to_sheet(rows);
        const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
        for (let column = 0; column <= range.e.c; column++) {
          const cell = sheet[XLSX.utils.encode_cell({ r: 0, c: column })];
          if (cell) cell.s = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "254A78" } } };
        }
        sheet["!cols"] = rows[0]?.map((header) => ({ wch: Math.min(48, Math.max(14, String(header ?? "").length + 3)) }));
        XLSX.utils.book_append_sheet(book, sheet, name);
      };
      const ageHeaders = labels.flatMap((label) => [`${label} Qty`, `${label} Cost`]);
      append("Ageing Summary", [
        ["Item Code", "Barcode", "Description", "Brand", "Selling Rate", "Opening Stock", "Total Stock Left", "Known Cost", "Unpriced Qty", ...ageHeaders, "Cost Status"],
        ...report.items.map((row) => [row.itemCode, row.barcode, row.description, row.brand, row.sellingRate, row.openingStock, row.totalStockLeft, row.totalCost, row.unpricedQty, ...bucketValues(row.buckets), row.costStatus]),
      ]);
      append("Brand Summary", [
        ["Brand", "Currency", "UOM", "Stock", "Known Cost", "Unpriced Qty", ...ageHeaders, "Cost Status"],
        ...report.brandSummary.map((row) => [row.brand, row.currency, row.stockUom, row.totalStock, row.totalCost, row.unpricedQty, ...bucketValues(row.buckets), row.costStatus]),
      ]);
      append("Grand Total", [
        ["Currency", "UOM", "Stock", "Known Cost", "Unpriced Qty", ...ageHeaders, "Cost Status"],
        ...report.grandTotal.map((row) => [row.currency, row.stockUom, row.totalStock, row.totalCost, row.unpricedQty, ...bucketValues(row.buckets), row.costStatus]),
      ]);
      append("Reconciliation", [
        ["Company", "Item Code", "Warehouse", "Issue", "Detail", "Difference"],
        ...report.reconciliation.discrepancies.map((row) => [row.company, row.itemCode, row.warehouse, row.kind, row.detail, row.difference ?? null]),
      ]);
      const bytes = XLSX.write(book, { bookType: "xlsx", type: "array", cellStyles: true }) as ArrayBuffer | Uint8Array;
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(new Uint8Array(bytes));
      const url = URL.createObjectURL(new Blob([copy], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `ageing-summary-${report.reportDate}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) { notify.error(error instanceof Error ? error.message : "Failed to export Ageing Summary"); }
    finally { setExporting(false); }
  };
  return <div className="space-y-4">
    <div className="flex flex-wrap items-end gap-3">
      <label className="space-y-1 text-sm"><span>Report date</span><Input type="date" value={date} max={formatAppIsoDate(new Date())} onChange={(e) => setDate(e.target.value)} /></label>
      <div className="min-w-60 space-y-1.5"><Button className="w-full" disabled={Boolean(progress) || !date} onClick={() => void load()}>{progress && <Loader2 className="animate-spin" />}{progress ? `${progress.percent}%` : "Calculate"}</Button>{progress ? <><p className="text-xs text-muted-foreground">{progress.status}</p><div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-label="Ageing Summary calculation"><div className="h-full rounded-full bg-sky-500 transition-[width] duration-300" style={{ width: `${progress.percent}%` }} /></div></> : null}</div>
      {report && <Input className="max-w-xs" placeholder="Filter item or brand" value={filter} onChange={(e) => setFilter(e.target.value)} />}
      {report && <Button variant="outline" disabled={Boolean(progress) || exporting} onClick={() => void exportReport()}>{exporting ? <Loader2 className="animate-spin" /> : <Download />} Export</Button>}
    </div>
    {report && <>
      <div className="grid gap-2 text-sm sm:grid-cols-4">
        <div className="rounded border p-2">Eligible PR stock: <strong>{fmt(report.reconciliation.eligibleStockQty)}</strong></div>
        <div className="rounded border p-2">Intercompany excluded: <strong>{fmt(report.reconciliation.excludedIntercompanyQty)}</strong></div>
        <div className="rounded border p-2">Unallocated stock: <strong>{fmt(report.reconciliation.unallocatedStockQty)}</strong></div>
        <div className="rounded border p-2">Unpriced eligible stock: <strong>{fmt(report.reconciliation.unpricedEligibleQty)}</strong></div>
      </div>
      <p className="text-sm text-muted-foreground">Rows combine the same SKU across all companies and ERPs. Opening stock is shown separately and excluded from ageing and cost totals. Cost figures use linked Purchase Invoices, or Supplier Return Stock Entry rates for legacy transfers. Legacy transfers without an original PR use the Stock Entry posting date for ageing. Incomplete rows have unpriced stock, so costs cannot be treated as full inventory value.</p>
      {report.dataWarnings.map((warning) => <p key={warning} className="text-sm text-amber-600">{warning}</p>)}
      {date < formatAppIsoDate(new Date()) && <p className="text-sm text-amber-600">Historical snapshot: {report.historicalState}</p>}
      <div className="overflow-auto rounded border"><table className="min-w-max w-full text-sm"><thead className="bg-muted"><tr>
        {['Item Code', 'Barcode', 'Description', 'Brand', 'Selling Rate', 'Opening Stock', 'Total Stock Left', 'Known Cost', 'Unpriced Qty', ...labels.flatMap((l) => [`${l} Qty`, `${l} Cost`]), 'Cost Status'].map((label) => <th key={label} className="border-b px-2 py-2 text-left">{label}</th>)}
      </tr></thead><tbody>{visible.map((row) => <tr key={`${row.itemCode}-${row.stockUom}-${row.currency}`} className="border-t align-top">
        <td className="px-2 py-2 font-medium">{row.itemCode}</td><td className="px-2 py-2">{row.barcode ?? '—'}</td><td className="max-w-48 px-2 py-2">{row.description ?? '—'}</td><td className="px-2 py-2">{row.brand ?? '—'}</td><td className="px-2 py-2 text-right">{fmt(row.sellingRate)}</td><td className="px-2 py-2 text-right">{fmt(row.openingStock)}</td><td className="px-2 py-2 text-right">{fmt(row.totalStockLeft)}</td><td className="px-2 py-2 text-right">{fmt(row.totalCost)}</td><td className="px-2 py-2 text-right">{fmt(row.unpricedQty)}</td>
        {AGE_BUCKETS.flatMap((b) => [<td key={`${b}-q`} className="px-2 py-2 text-right">{fmt(row.buckets[b].qty)}</td>, <td key={`${b}-c`} className="px-2 py-2 text-right">{fmt(row.buckets[b].cost)}</td>])}<td className="px-2 py-2">{row.costStatus}</td>
      </tr>)}</tbody></table></div>
      <section className="space-y-2"><h2 className="font-semibold">Brand summary</h2><div className="overflow-auto rounded border"><table className="min-w-max w-full text-sm"><thead><tr>{['Brand', 'Currency', 'UOM', 'Stock', 'Known Cost', 'Unpriced Qty', ...labels.flatMap((l) => [`${l} Qty`, `${l} Cost`]), 'Cost Status'].map((h) => <th key={h} className="border-b px-2 py-2 text-left">{h}</th>)}</tr></thead><tbody>{report.brandSummary.map((r) => <tr key={`${r.brand}-${r.currency}-${r.stockUom}`} className="border-t"><td className="px-2 py-2">{r.brand}</td><td className="px-2 py-2">{r.currency ?? '—'}</td><td className="px-2 py-2">{r.stockUom}</td><td className="px-2 py-2">{fmt(r.totalStock)}</td><td className="px-2 py-2">{fmt(r.totalCost)}</td><td className="px-2 py-2">{fmt(r.unpricedQty)}</td>{AGE_BUCKETS.flatMap((b) => [<td key={`${b}-q`} className="px-2 py-2">{fmt(r.buckets[b].qty)}</td>, <td key={`${b}-c`} className="px-2 py-2">{fmt(r.buckets[b].cost)}</td>])}<td className="px-2 py-2">{r.costStatus}</td></tr>)}</tbody></table></div></section>
      <section className="text-sm"><h2 className="font-semibold">Grand total by currency and UOM</h2>{report.grandTotal.map((r) => <p key={`${r.currency}-${r.stockUom}`}>{r.currency ?? 'Unknown'} / {r.stockUom}: stock {fmt(r.totalStock)}, known cost {fmt(r.totalCost)}, unpriced {fmt(r.unpricedQty)} ({r.costStatus})</p>)}</section>
      {report.reconciliation.discrepancies.length > 0 && <details className="rounded border p-3 text-sm"><summary className="cursor-pointer font-medium">Reconciliation exceptions ({report.reconciliation.discrepancies.length})</summary><div className="mt-2 max-h-80 overflow-auto">{report.reconciliation.discrepancies.map((d, i) => <p key={i} className="border-t py-1">{d.company} / {d.itemCode} / {d.warehouse}: {d.kind} — {d.detail}{d.difference != null ? ` (${fmt(d.difference)})` : ''}</p>)}</div></details>}
    </>}
  </div>;
}
