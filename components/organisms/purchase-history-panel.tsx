"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Download, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { notify } from "@/lib/notify";
import { formatPercentPoints } from "@/lib/osf/pricing-math";
import { erpProductPriorityFilterOptions } from "@/lib/product-items/erp-priority-options";

type Row = {
  postingDate: string;
  sku: string;
  commonSku: string | null;
  brand: string | null;
  priority: string | null;
  productTitle: string | null;
  country: string | null;
  supplier: string;
  qty: number;
  rate: number;
  netValue: number;
  selling: number | null;
  marginPct: number | null;
  source: "erp_invoice" | "cosmo";
  sourceRef: string | null;
  invoiceUrl: string | null;
  company: string | null;
  erpSlot: "ERP1" | "ERP2" | null;
};

type Summary = {
  lineCount: number;
  qtySum: number;
  costSum: number;
  marginLineCount: number;
};

type HighRiskRow = {
  id: string; sku: string; cycleStart: string; totalRop: number; totalStock: number; reorderQty: number;
  bestPrice: number | string | null; bestSupplier: string | null; orderPlaced: boolean; orderQty: number | null;
  orderSupplier: string | null; orderReceiveDate: string | null; reasonType: string | null;
  replacementSku: string | null; changedPriority: string | null; otherReason: string | null; createdAt: string;
};

function defaultFromTo() {
  const to = formatAppIsoDate(new Date());
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 90);
  const from = formatAppIsoDate(d);
  return { from, to };
}

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return (Math.round(n * 100) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function marginLabel(fraction: number | null): string {
  const pct = formatPercentPoints(fraction);
  return pct == null ? "—" : `${pct}%`;
}

export function PurchaseHistoryPanel() {
  const defaults = defaultFromTo();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [sku, setSku] = useState("");
  const [commonSku, setCommonSku] = useState("");
  const [description, setDescription] = useState("");
  const [supplier, setSupplier] = useState("");
  const [brand, setBrand] = useState("");
  const [priority, setPriority] = useState("");
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [country, setCountry] = useState("");
  const [marginBelow, setMarginBelow] = useState("");
  const [erpSlot, setErpSlot] = useState("");
  const [brands, setBrands] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [priorities, setPriorities] = useState<string[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [generatingMarginReport, setGeneratingMarginReport] = useState(false);
  const [view, setView] = useState<"history" | "high-risk">("history");
  const [highRiskRows, setHighRiskRows] = useState<HighRiskRow[]>([]);
  const [highRiskLoading, setHighRiskLoading] = useState(false);
  const [erpAvailable, setErpAvailable] = useState(true);
  const limit = 200;

  const filterParams = useCallback(
    (fromDate: string, toDate: string) => {
      const params = new URLSearchParams({ from: fromDate, to: toDate });
      if (sku.trim()) params.set("sku", sku.trim());
      if (commonSku.trim()) params.set("commonSku", commonSku.trim());
      if (description.trim()) params.set("description", description.trim());
      if (supplier.trim()) params.set("supplier", supplier.trim());
      if (brand.trim()) params.set("brand", brand.trim());
      if (priority.trim()) params.set("priority", priority.trim());
      if (selectedCompanies.length > 0) params.set("companies", selectedCompanies.join(","));
      if (country.trim()) params.set("country", country.trim());
      if (marginBelow.trim()) params.set("marginBelow", marginBelow.trim());
      if (erpSlot.trim()) params.set("erpSlot", erpSlot.trim());
      return params;
    },
    [sku, commonSku, description, supplier, brand, priority, selectedCompanies, country, marginBelow, erpSlot],
  );

  const load = useCallback(
    async (
      nextOffset: number,
      options?: { from?: string; to?: string; sync?: boolean },
    ) => {
      setLoading(true);
      try {
        const fromDate = options?.from ?? from;
        const toDate = options?.to ?? to;
        const params = filterParams(fromDate, toDate);
        params.set("offset", String(nextOffset));
        params.set("limit", String(limit));
        if (options?.sync) params.set("_ts", String(Date.now()));
        const res = await fetch(
          `/api/admin/purchasing/purchase-history/page-data?${params.toString()}`,
          { cache: "no-store" },
        );
        const json = await res.json();
        if (!res.ok) {
          notify.error(json.error ?? "Failed to load purchase history");
          return;
        }
        setRows(json.rows ?? []);
        setSummary(json.summary ?? null);
        setTotal(json.total ?? 0);
        setOffset(nextOffset);
        setErpAvailable(json.erpAvailable !== false);
        setBrands(json.filterOptions?.brands ?? []);
        setSuppliers(json.filterOptions?.suppliers ?? []);
        setPriorities(json.filterOptions?.priorities ?? []);
        setCompanies(json.filterOptions?.companies ?? []);
        setCountries(json.filterOptions?.countries ?? []);
        if (json.erpError) {
          notify.error(`ERP: ${json.erpError}`);
        } else if (options?.sync) {
          notify.success("ERP purchase invoices refreshed");
        }
      } catch {
        notify.error("Failed to load purchase history");
      } finally {
        setLoading(false);
      }
    },
    [from, to, filterParams],
  );

  const exportRows = useCallback(async () => {
    setExporting(true);
    try {
      const params = filterParams(from, to);
      const res = await fetch(
        `/api/admin/purchasing/purchase-history/export?${params.toString()}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        notify.error(json.error ?? "Failed to export purchase history");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const match = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "");
      link.href = url;
      link.download = match?.[1] ?? `purchase-history-${from}-to-${to}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      notify.error("Failed to export purchase history");
    } finally {
      setExporting(false);
    }
  }, [filterParams, from, to]);

  const generateMarginReport = useCallback(async () => {
    setGeneratingMarginReport(true);
    try {
      const res = await fetch("/api/admin/purchasing/purchase-history/margin-report", {
        cache: "no-store",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        notify.error(json.error ?? "Failed to generate margin report");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const match = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "");
      link.href = url;
      link.download = match?.[1] ?? `margin-issues-${formatAppIsoDate(new Date())}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      notify.success("Margin report generated");
    } catch {
      notify.error("Failed to generate margin report");
    } finally {
      setGeneratingMarginReport(false);
    }
  }, []);

  useEffect(() => {
    void load(0);
    // Initial load only — Apply button refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = loading || exporting || generatingMarginReport;

  const loadHighRisk = async () => {
    setHighRiskLoading(true);
    try {
      const res = await fetch("/api/admin/purchasing/purchase-history/high-risk", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) { notify.error(json.error ?? "Failed to load high risk items"); return; }
      setHighRiskRows(json.rows ?? []);
    } catch { notify.error("Failed to load high risk items"); }
    finally { setHighRiskLoading(false); }
  };

  const saveHighRisk = async (row: HighRiskRow, patch: Record<string, unknown>) => {
    const res = await fetch("/api/admin/purchasing/purchase-history/high-risk", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, ...patch }),
    });
    const json = await res.json();
    if (!res.ok) { notify.error(json.error ?? "Failed to save high risk item"); return; }
    if (json.row?.status === "fulfilled") setHighRiskRows((prev) => prev.filter((item) => item.id !== row.id));
    else setHighRiskRows((prev) => prev.map((item) => item.id === row.id ? { ...item, ...json.row } : item));
  };

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Purchase History</h1>
        <p className="text-sm text-muted-foreground">
          Live ERP Purchase Invoices from both ERPs (cancelled, returns, and intercompany cash
          suppliers excluded). Click a row to open the invoice in ERP.
        </p>
      </div>

      <div className="flex gap-2 border-b">
        <Button variant={view === "history" ? "default" : "ghost"} onClick={() => setView("history")}>Purchase History</Button>
        <Button variant={view === "high-risk" ? "default" : "ghost"} onClick={() => { setView("high-risk"); void loadHighRisk(); }}>High Risk Items</Button>
      </div>

      {view === "high-risk" ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm"><thead className="bg-muted/50"><tr>
            {['SKU','Record Date','Total ROP','Total Stock','Reorder Qty','Best Price','Best Supplier','Order Placed','Qty','Supplier','Receive Date','Reason'].map((h) => <th key={h} className="p-2 text-left">{h}</th>)}
          </tr></thead><tbody>
            {highRiskRows.length === 0 && !highRiskLoading ? <tr><td colSpan={12} className="p-4 text-muted-foreground">No high risk items.</td></tr> : highRiskRows.map((row) => (
              <tr key={row.id} className="border-t align-top">
                <td className="p-2 font-mono">{row.sku}</td><td className="p-2">{row.createdAt.slice(0,10)}</td>
                <td className="p-2 text-right">{money(row.totalRop)}</td><td className="p-2 text-right">{money(row.totalStock)}</td><td className="p-2 text-right">{money(row.reorderQty)}</td>
                <td className="p-2 text-right">{money(Number(row.bestPrice))}</td><td className="p-2">{row.bestSupplier ?? "—"}</td>
                <td className="p-2"><input type="checkbox" checked={row.orderPlaced} onChange={(e) => void saveHighRisk(row, { orderPlaced: e.target.checked })} /></td>
                <td className="p-2"><Input className="w-20" type="number" min={0} defaultValue={row.orderQty ?? ""} onBlur={(e) => void saveHighRisk(row, { orderQty: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                <td className="p-2"><Input className="w-36" defaultValue={row.orderSupplier ?? ""} onBlur={(e) => void saveHighRisk(row, { orderSupplier: e.target.value })} /></td>
                <td className="p-2"><Input type="date" defaultValue={row.orderReceiveDate?.slice(0,10) ?? ""} onBlur={(e) => void saveHighRisk(row, { orderReceiveDate: e.target.value || null })} /></td>
                <td className="p-2 space-y-2">
                  <select className="h-9 rounded-md border bg-background px-2" defaultValue={row.reasonType ?? ""} onChange={(e) => void saveHighRisk(row, { reasonType: e.target.value || null })}>
                    <option value="">—</option><option>Replace</option><option>Priority change</option><option>Other</option>
                  </select>
                  {row.reasonType === "Replace" ? <Input className="w-40" placeholder="Replacement SKU" defaultValue={row.replacementSku ?? ""} onBlur={(e) => void saveHighRisk(row, { replacementSku: e.target.value })} /> : null}
                  {row.reasonType === "Priority change" ? <Input className="w-40" placeholder="New priority" defaultValue={row.changedPriority ?? ""} onBlur={(e) => void saveHighRisk(row, { changedPriority: e.target.value })} /> : null}
                  {row.reasonType === "Other" ? <Input className="w-40" placeholder="Reason details" defaultValue={row.otherReason ?? ""} onBlur={(e) => void saveHighRisk(row, { otherReason: e.target.value })} /> : null}
                </td>
              </tr>
            ))}
          </tbody></table>
        </div>
      ) : (
        <>

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">From</span>
          <Input
            type="date"
            value={from}
            disabled={busy}
            onChange={(e) => setFrom(e.target.value)}
            className="w-[160px]"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">To</span>
          <Input
            type="date"
            value={to}
            disabled={busy}
            onChange={(e) => setTo(e.target.value)}
            className="w-[160px]"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">SKU</span>
          <Input
            value={sku}
            disabled={busy}
            onChange={(e) => setSku(e.target.value)}
            placeholder="All dates…"
            className="w-[140px]"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Common SKU</span>
          <Input
            value={commonSku}
            disabled={busy}
            onChange={(e) => setCommonSku(e.target.value)}
            placeholder="CAN07…"
            className="w-[140px]"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Item</span>
          <Input
            value={description}
            disabled={busy}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description contains…"
            className="w-[220px]"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Brand</span>
          <select
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
            value={brand}
            disabled={busy}
            onChange={(e) => setBrand(e.target.value)}
          >
            <option value="">Any</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Priority</span>
          <select
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
            value={priority}
            disabled={busy}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="">Any</option>
            {[
              ...new Set([...erpProductPriorityFilterOptions(), ...priorities]),
            ].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Supplier</span>
          <Input
            list="purchase-history-suppliers"
            value={supplier}
            disabled={busy}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="Contains…"
            className="w-[180px]"
          />
          <datalist id="purchase-history-suppliers">
            {suppliers.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Company</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                className="h-9 w-[220px] justify-between px-2 font-normal"
              >
                <span className="truncate">
                  {selectedCompanies.length === 0
                    ? "Any"
                    : selectedCompanies.length === 1
                      ? selectedCompanies[0]
                      : `${selectedCompanies.length} selected`}
                </span>
                <ChevronDown className="size-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[240px] p-2" align="start">
              <div className="max-h-64 space-y-1 overflow-auto">
                <button
                  type="button"
                  className="text-muted-foreground hover:bg-muted w-full rounded px-2 py-1 text-left text-sm"
                  onClick={() => setSelectedCompanies([])}
                >
                  Any
                </button>
                {companies.map((c) => {
                  const checked = selectedCompanies.includes(c);
                  return (
                    <label
                      key={c}
                      className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm"
                    >
                      <input
                        type="checkbox"
                        className="size-4 shrink-0"
                        checked={checked}
                        disabled={busy}
                        onChange={() => {
                          setSelectedCompanies((prev) =>
                            prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
                          );
                        }}
                      />
                      <span className="truncate">{c}</span>
                    </label>
                  );
                })}
                {companies.length === 0 ? (
                  <p className="text-muted-foreground px-2 py-1 text-xs">No ERP companies</p>
                ) : null}
              </div>
            </PopoverContent>
          </Popover>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Country</span>
          <select
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
            value={country}
            disabled={busy}
            onChange={(e) => setCountry(e.target.value)}
          >
            <option value="">Any</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Margin below %</span>
          <Input
            type="number"
            min={0}
            max={100}
            step={1}
            value={marginBelow}
            disabled={busy}
            onChange={(e) => setMarginBelow(e.target.value)}
            placeholder="e.g. 30"
            className="w-[110px]"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">ERP</span>
          <select
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
            value={erpSlot}
            disabled={busy}
            onChange={(e) => setErpSlot(e.target.value)}
          >
            <option value="">Any</option>
            <option value="ERP1">ERP1</option>
            <option value="ERP2">ERP2</option>
          </select>
        </label>
        <Button
          disabled={busy}
          onClick={() => {
            void load(0);
          }}
        >
          {busy ? (
            <>
              <Loader2 className="animate-spin" aria-hidden />
              Loading...
            </>
          ) : (
            "Apply"
          )}
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            const today = formatAppIsoDate(new Date());
            if (today && today !== to) setTo(today);
            void load(0, { to: today || to, sync: true });
          }}
        >
          {busy ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <RefreshCw aria-hidden />
          )}
          Sync ERP
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => void exportRows()}>
          {exporting ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Download aria-hidden />
          )}
          Export
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => void generateMarginReport()}>
          {generatingMarginReport ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Download aria-hidden />
          )}
          Margin Report
        </Button>
      </div>

      {summary && (
        <div className="text-sm text-muted-foreground flex flex-wrap gap-4">
          <span>
            Lines: <strong className="text-foreground">{summary.lineCount}</strong>
          </span>
          <span>
            Qty: <strong className="text-foreground">{money(summary.qtySum)}</strong>
          </span>
          <span>
            Cost: <strong className="text-foreground">{money(summary.costSum)}</strong>
          </span>
          <span>
            With margin:{" "}
            <strong className="text-foreground">{summary.marginLineCount}</strong>
          </span>
          {!erpAvailable && (
            <span className="text-amber-700">ERP unavailable — file import only</span>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2 font-medium">SKU</th>
              <th className="p-2 font-medium">Common SKU</th>
              <th className="p-2 font-medium">Priority</th>
              <th className="p-2 font-medium">Item</th>
              <th className="p-2 font-medium">Supplier</th>
              <th className="p-2 font-medium">Company</th>
              <th className="p-2 font-medium">Country</th>
              <th className="p-2 font-medium text-right">Qty</th>
              <th className="p-2 font-medium text-right">Cost</th>
              <th className="p-2 font-medium text-right">Amount</th>
              <th className="p-2 font-medium text-right">Sell</th>
              <th className="p-2 font-medium text-right">Margin</th>
              <th className="p-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !busy ? (
              <tr>
                <td colSpan={13} className="p-4 text-muted-foreground">
                  No purchase lines for these filters.
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr
                  key={`${row.source}-${row.sourceRef ?? ""}-${row.sku}-${row.postingDate}-${idx}`}
                  className={`border-t ${row.invoiceUrl ? "cursor-pointer hover:bg-muted/40" : ""}`}
                  title={row.invoiceUrl ? "Open purchase invoice in ERP" : undefined}
                  onClick={() => {
                    if (!row.invoiceUrl) return;
                    window.open(row.invoiceUrl, "_blank", "noopener,noreferrer");
                  }}
                >
                  <td className="p-2">
                    <div className="font-mono text-sm font-medium">{row.sku}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.brand?.trim() || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {row.postingDate}
                    </div>
                  </td>
                  <td className="p-2 font-mono whitespace-nowrap">{row.commonSku ?? "—"}</td>
                  <td className="p-2 whitespace-nowrap">{row.priority ?? "—"}</td>
                  <td className="p-2 max-w-[220px] truncate" title={row.productTitle ?? undefined}>
                    {row.productTitle ?? "—"}
                  </td>
                  <td className="p-2">{row.supplier}</td>
                  <td className="p-2">{row.company ?? "—"}</td>
                  <td className="p-2">{row.country ?? "—"}</td>
                  <td className="p-2 text-right tabular-nums">{money(row.qty)}</td>
                  <td className="p-2 text-right tabular-nums">{money(row.rate)}</td>
                  <td className="p-2 text-right tabular-nums">{money(row.netValue)}</td>
                  <td className="p-2 text-right tabular-nums">{money(row.selling)}</td>
                  <td className="p-2 text-right tabular-nums">{marginLabel(row.marginPct)}</td>
                  <td className="p-2">
                    <span
                      className={
                        row.source === "erp_invoice"
                          ? "rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-900"
                          : "rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-900"
                      }
                    >
                      {row.source === "erp_invoice" ? "Invoice" : "File"}
                    </span>
                    {row.erpSlot ? (
                      <span className="ml-1 text-xs text-muted-foreground">{row.erpSlot}</span>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <Button
          variant="outline"
          disabled={busy || offset <= 0}
          onClick={() => {
            void load(Math.max(0, offset - limit));
          }}
        >
          Previous
        </Button>
        <span className="text-muted-foreground">
          {total === 0
            ? "0"
            : `${offset + 1}–${Math.min(offset + rows.length, total)} of ${total}`}
        </span>
        <Button
          variant="outline"
          disabled={busy || offset + rows.length >= total}
          onClick={() => {
            void load(offset + limit);
          }}
        >
          Next
        </Button>
      </div>
        </>
      )}
    </div>
  );
}
