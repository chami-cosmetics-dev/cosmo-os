"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { notify } from "@/lib/notify";
import { formatPercentPoints } from "@/lib/osf/pricing-math";
import { ERP_PRODUCT_PRIORITY_OPTIONS } from "@/lib/product-items/erp-priority-options";

type Row = {
  postingDate: string;
  sku: string;
  brand: string | null;
  priority: string | null;
  productTitle: string | null;
  supplier: string;
  qty: number;
  rate: number;
  netValue: number;
  selling: number | null;
  marginPct: number | null;
  source: "erp_invoice" | "cosmo";
  sourceRef: string | null;
  invoiceUrl: string | null;
};

type Summary = {
  lineCount: number;
  qtySum: number;
  costSum: number;
  marginLineCount: number;
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
  const [description, setDescription] = useState("");
  const [supplier, setSupplier] = useState("");
  const [brand, setBrand] = useState("");
  const [priority, setPriority] = useState("");
  const [brands, setBrands] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [priorities, setPriorities] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [erpAvailable, setErpAvailable] = useState(true);
  const limit = 200;

  const load = useCallback(
    async (nextOffset: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          from,
          to,
          offset: String(nextOffset),
          limit: String(limit),
        });
        if (sku.trim()) params.set("sku", sku.trim());
        if (description.trim()) params.set("description", description.trim());
        if (supplier.trim()) params.set("supplier", supplier.trim());
        if (brand.trim()) params.set("brand", brand.trim());
        if (priority.trim()) params.set("priority", priority.trim());
        const res = await fetch(
          `/api/admin/purchasing/purchase-history/page-data?${params.toString()}`,
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
        if (json.erpError) {
          notify.error(`ERP: ${json.erpError}`);
        }
      } catch {
        notify.error("Failed to load purchase history");
      } finally {
        setLoading(false);
      }
    },
    [from, to, sku, description, supplier, brand, priority],
  );

  useEffect(() => {
    void load(0);
    // Initial load only — Apply button refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = loading;

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Purchase History</h1>
        <p className="text-sm text-muted-foreground">
          Live ERP Purchase Invoices (cancelled, returns, and intercompany cash suppliers
          excluded). Cosmo OS uses Cosmetics.lk ERP for current invoices. Click a row to open
          the invoice in ERP.
        </p>
      </div>

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
              ...new Set([...ERP_PRODUCT_PRIORITY_OPTIONS, ...priorities]),
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
            <span className="text-amber-700">ERP unavailable — Cosmo import only</span>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2 font-medium">Date</th>
              <th className="p-2 font-medium">SKU</th>
              <th className="p-2 font-medium">Brand</th>
              <th className="p-2 font-medium">Priority</th>
              <th className="p-2 font-medium">Item</th>
              <th className="p-2 font-medium">Supplier</th>
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
                <td colSpan={12} className="p-4 text-muted-foreground">
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
                  <td className="p-2 whitespace-nowrap">{row.postingDate}</td>
                  <td className="p-2 font-mono text-xs">{row.sku}</td>
                  <td className="p-2">{row.brand ?? "—"}</td>
                  <td className="p-2 whitespace-nowrap">{row.priority ?? "—"}</td>
                  <td className="p-2 max-w-[220px] truncate" title={row.productTitle ?? undefined}>
                    {row.productTitle ?? "—"}
                  </td>
                  <td className="p-2">{row.supplier}</td>
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
                      {row.source === "erp_invoice" ? "Invoice" : "Cosmo"}
                    </span>
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
    </div>
  );
}
