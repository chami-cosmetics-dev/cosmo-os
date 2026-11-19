"use client";

import { useCallback, useEffect, useState } from "react";
import { notify } from "@/lib/notify";

type FailedReceipt = {
  id: string;
  supplier: string;
  warehouse: string;
  erp?: string;
  erpInstanceId?: string;
  erpLabel?: string;
  error: string | null;
  createdAt: string;
  items: unknown;
};

function itemSummary(items: unknown): string {
  if (!Array.isArray(items)) return "—";
  return items.map((item: { itemCode?: string; sku?: string; qty?: number | string }) =>
    `${item.itemCode ?? item.sku ?? "Item"} × ${item.qty ?? "?"}`,
  ).join(", ");
}

export function FailedPurchaseReceipts({ source, onRetrySuccess }: {
  source: "item-creation" | "store-allocation";
  onRetrySuccess?: (row: FailedReceipt) => void;
}) {
  const base = source === "item-creation"
    ? "/api/item-creation/stock/receipts"
    : "/api/admin/store-allocation/failed-purchase-receipts";
  const [rows, setRows] = useState<FailedReceipt[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(base, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load failed Purchase Receipts");
      setRows(data.rows ?? []);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load failed Purchase Receipts");
    }
  }, [base]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function act(row: FailedReceipt, action: "retry" | "remove") {
    const label = `${row.supplier}, ${row.warehouse}: ${itemSummary(row.items)}`;
    const prompt = action === "retry"
      ? `Retry only this failed Purchase Receipt (${label})? First check ERPNext: a network error can mean the receipt was created but its response was lost.`
      : `Remove this failed Purchase Receipt record (${label})? This does not delete any receipt in ERPNext.`;
    if (!window.confirm(prompt)) return;
    setBusyId(row.id);
    try {
      const url = source === "item-creation" && action === "retry"
        ? `${base}/${row.id}/retry`
        : `${base}/${row.id}`;
      const response = await fetch(url, { method: action === "retry" ? "POST" : "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? `${action} failed`);
      notify.success(action === "remove" ? "Failed record removed" : `Purchase Receipt created: ${data.purchaseReceipt ?? data.receipt?.purchaseReceipt ?? "success"}`);
      if (action === "retry") onRetrySuccess?.(row);
      await refresh();
    } catch (cause) {
      notify.error(cause instanceof Error ? cause.message : `${action} failed`);
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  return <section className="rounded-lg border bg-card p-4">
    <div className="flex items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Failed Purchase Receipts</h2><p className="text-sm text-muted-foreground">Review each warehouse receipt before retrying or removing its record.</p></div>
      <button type="button" onClick={() => void refresh()} className="rounded-md border px-3 py-2 text-sm">Refresh</button>
    </div>
    {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    {rows.length === 0 && !error && <p className="mt-4 text-sm text-muted-foreground">No failed Purchase Receipts.</p>}
    <div className="mt-4 space-y-3">{rows.map((row) => <div key={row.id} className="rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2 font-medium"><span>{row.supplier}</span><span>·</span><span>{row.erp ?? row.erpLabel ?? row.erpInstanceId}</span><span>·</span><span>{row.warehouse}</span><span className="text-xs font-normal text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</span></div>
      <p className="mt-1">{itemSummary(row.items)}</p>
      <p className="mt-2 text-destructive">{row.error || "ERP did not return a reason. Check the ERP connection and receipt details."}</p>
      <div className="mt-3 flex gap-2"><button type="button" disabled={busyId !== null} onClick={() => void act(row, "retry")} className="rounded-md border px-3 py-1.5 disabled:opacity-50">{busyId === row.id ? "Working…" : "Retry this PR"}</button><button type="button" disabled={busyId !== null} onClick={() => void act(row, "remove")} className="rounded-md border border-destructive/40 px-3 py-1.5 text-destructive disabled:opacity-50">Remove record</button></div>
    </div>)}</div>
  </section>;
}
