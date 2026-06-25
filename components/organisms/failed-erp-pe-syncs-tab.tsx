"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";

import { ErpPaymentModeSelect } from "@/components/molecules/erp-payment-mode-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { TableSkeleton } from "@/components/skeletons/table-skeleton";
import { formatFailedErpSyncErrorMessage } from "@/lib/failed-erp-sync-classification";
import { notify } from "@/lib/notify";

type FailedErpPeSync = {
  id: string;
  name: string | null;
  orderNumber: string | null;
  shopifyOrderId: string;
  customerEmail: string | null;
  customerPhone: string | null;
  erpPeSyncError: string | null;
  erpPeSyncFailedAt: string | null;
  erpPeSyncMop: string | null;
  erpnextInvoiceId: string | null;
  companyLocation: { id: string; name: string };
};

export function FailedErpPeSyncsTab() {
  const [items, setItems] = useState<FailedErpPeSync[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [retryMop, setRetryMop] = useState<Record<string, string>>({});

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  const effectiveSearch = useMemo(() => debouncedSearch.trim(), [debouncedSearch]);

  useEffect(() => {
    setPage(1);
  }, [effectiveSearch]);

  const fetchData = useCallback(async () => {
    const params = new URLSearchParams({
      kind: "payment_entry",
      page: String(page),
      limit: String(limit),
    });
    if (effectiveSearch) params.set("search", effectiveSearch);
    const res = await fetch(`/api/admin/orders/failed-erp-syncs?${params}`);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      notify.error(data.error ?? "Failed to load payment entry failures");
      return;
    }
    const data = (await res.json()) as {
      items: FailedErpPeSync[];
      total: number;
      page: number;
      limit: number;
    };
    setItems(data.items);
    setTotal(data.total);
    setRetryMop((prev) => {
      const next = { ...prev };
      for (const item of data.items) {
        if (!next[item.id] && item.erpPeSyncMop) {
          next[item.id] = item.erpPeSyncMop;
        }
      }
      return next;
    });
  }, [page, limit, effectiveSearch]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchData()
      .then(() => {
        if (!cancelled) setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
          notify.error("Failed to load data");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fetchData]);

  async function handleRetry(item: FailedErpPeSync) {
    const mop = retryMop[item.id]?.trim() || item.erpPeSyncMop?.trim() || "";
    if (!mop) {
      notify.error("Select an ERP payment mode before retrying.");
      return;
    }
    setRetryingId(item.id);
    try {
      const res = await fetch(`/api/admin/orders/${item.id}/retry-erp-pe-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modeOfPayment: mop }),
      });
      const data = (await res.json()) as { error?: string; message?: string; details?: string };
      if (!res.ok) {
        notify.error(data.details ?? data.error ?? "Retry failed");
        await fetchData();
        return;
      }
      notify.success(data.message ?? "ERP payment entry created");
      await fetchData();
    } catch {
      notify.error("Retry failed");
    } finally {
      setRetryingId(null);
    }
  }

  function formatDate(val: string | null) {
    if (!val) return "—";
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-LK");
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          placeholder="Search by order #, ERP invoice, payment mode, or error..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border-border/70 bg-background/90 pl-9"
        />
      </div>

      {loading ? (
        <TableSkeleton columns={7} rows={5} />
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {effectiveSearch
            ? "No failed payment entries match your search."
            : "No failed ERP payment entries. Invoice-complete PEs are all synced."}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-border/70 bg-background/90 shadow-xs">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/40">
                  <th className="px-4 py-2 text-left font-medium">Order</th>
                  <th className="px-4 py-2 text-left font-medium">Customer</th>
                  <th className="px-4 py-2 text-left font-medium">Location</th>
                  <th className="px-4 py-2 text-left font-medium">ERP SI</th>
                  <th className="px-4 py-2 text-left font-medium">Payment mode</th>
                  <th className="px-4 py-2 text-left font-medium">Error</th>
                  <th className="px-4 py-2 text-left font-medium">Failed at</th>
                  <th className="px-4 py-2 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2">
                      <div className="font-medium">{item.name ?? item.orderNumber ?? "—"}</div>
                      <div className="font-mono text-xs text-muted-foreground">{item.shopifyOrderId}</div>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      <div>{item.customerEmail ?? "—"}</div>
                      <div className="text-muted-foreground">{item.customerPhone ?? ""}</div>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{item.companyLocation.name}</td>
                    <td className="px-4 py-2 font-mono text-xs">{item.erpnextInvoiceId ?? "—"}</td>
                    <td className="min-w-[180px] px-4 py-2">
                      <ErpPaymentModeSelect
                        value={retryMop[item.id] ?? item.erpPeSyncMop ?? ""}
                        onChange={(mop) =>
                          setRetryMop((prev) => ({
                            ...prev,
                            [item.id]: mop,
                          }))
                        }
                        disabled={retryingId !== null}
                      />
                    </td>
                    <td className="max-w-[280px] px-4 py-2 text-xs text-destructive">
                      {item.erpPeSyncError
                        ? formatFailedErpSyncErrorMessage(item.erpPeSyncError)
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {formatDate(item.erpPeSyncFailedAt)}
                    </td>
                    <td className="px-4 py-2">
                      <Button
                        size="sm"
                        className="gap-2"
                        onClick={() => void handleRetry(item)}
                        disabled={retryingId !== null}
                      >
                        {retryingId === item.id ? (
                          <>
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                            Retrying…
                          </>
                        ) : (
                          <>
                            <RefreshCw className="size-4" aria-hidden />
                            Retry PE
                          </>
                        )}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            limit={limit}
            total={total}
            onPageChange={setPage}
            onLimitChange={(next) => {
              setLimit(next);
              setPage(1);
            }}
          />
        </>
      )}
    </div>
  );
}
