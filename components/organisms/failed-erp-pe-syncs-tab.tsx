"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, Search } from "lucide-react";

import { ErpPaymentModeSelect } from "@/components/molecules/erp-payment-mode-select";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { TableSkeleton } from "@/components/skeletons/table-skeleton";
import { formatFailedErpSyncErrorMessage } from "@/lib/failed-erp-sync-classification";
import { getPaymentMethodInfo } from "@/lib/payment-method-label";
import { notify } from "@/lib/notify";
import { formatAppDateTime } from "@/lib/format-datetime";

const ERP_PE_MOP_ORDER_AUTO = "order payment mode";

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
  paymentGatewayPrimary: string | null;
  paymentGatewayNames: string[] | null;
  financialStatus: string | null;
  companyLocation: { id: string; name: string };
};

function formatAttemptedErpMop(item: FailedErpPeSync): string {
  const stored = item.erpPeSyncMop?.trim();
  if (stored && stored !== ERP_PE_MOP_ORDER_AUTO) {
    return stored;
  }
  const vault = getPaymentMethodInfo({
    paymentGatewayPrimary: item.paymentGatewayPrimary,
    paymentGatewayNames: item.paymentGatewayNames,
    financialStatus: item.financialStatus,
  });
  return `From order (${vault.label})`;
}

export function FailedErpPeSyncsTab() {
  const [items, setItems] = useState<FailedErpPeSync[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [retryMopOverride, setRetryMopOverride] = useState<Record<string, string>>({});
  const isBusy = busyId !== null || retryingAll;

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
    const override = retryMopOverride[item.id]?.trim();
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/admin/orders/${item.id}/retry-erp-pe-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(override ? { modeOfPayment: override } : {}),
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
      setBusyId(null);
    }
  }

  async function handleDismiss(item: FailedErpPeSync) {
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/admin/orders/${item.id}/dismiss-erp-pe-sync`, {
        method: "POST",
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Could not clear failure");
        return;
      }
      notify.success(data.message ?? "Cleared from failed list");
      await fetchData();
    } catch {
      notify.error("Could not clear failure");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRetryAll() {
    setRetryingAll(true);
    try {
      const res = await fetch("/api/admin/orders/failed-erp-syncs/retry-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "payment_entry" }),
      });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        total?: number;
        succeeded?: number;
        failed?: number;
        skipped?: number;
      };
      if (!res.ok) {
        notify.error(data.error ?? "Retry all failed");
        return;
      }
      notify.success(
        data.message ??
          `Retried ${data.total ?? 0} payment entries (${data.succeeded ?? 0} succeeded, ${data.failed ?? 0} failed)`,
      );
      await fetchData();
    } catch {
      notify.error("Retry all failed");
    } finally {
      setRetryingAll(false);
    }
  }

  function formatDate(val: string | null) {
    return formatAppDateTime(val);
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50 pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <CardTitle className="text-base">Failed Payment Entries</CardTitle>
              <p className="text-muted-foreground text-sm">
                Orders where the ERP Payment Entry failed (prepaid PE at intake/approval, or
                invoice-complete PE). Each row shows the{" "}
                <span className="font-medium">attempted ERP payment mode</span> and error. Retry
                with the same mode, pick a different mode only if needed, or create the Payment
                Entry manually in ERPNext against the Sales Invoice and clear this row.
              </p>
            </div>
            {total > 0 && (
              <Button
                onClick={() => void handleRetryAll()}
                disabled={isBusy}
                className="gap-2 shadow-[0_10px_24px_-18px_var(--primary)]"
              >
                {retryingAll ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Retrying All…
                  </>
                ) : (
                  <>
                    <RefreshCw className="size-4" aria-hidden />
                    Retry All
                  </>
                )}
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

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
        <TableSkeleton columns={8} rows={5} />
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
                  <th className="px-4 py-2 text-left font-medium">Attempted ERP MOP</th>
                  <th className="px-4 py-2 text-left font-medium">Failure reason</th>
                  <th className="px-4 py-2 text-left font-medium">Failed at</th>
                  <th className="px-4 py-2 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const attemptedMop = formatAttemptedErpMop(item);
                  const rowBusy = busyId === item.id;
                  return (
                    <tr key={item.id} className="border-b border-border/50 last:border-0 align-top">
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
                      <td className="px-4 py-2">
                        <p className="font-medium">{attemptedMop}</p>
                        <p className="text-muted-foreground mt-1 text-xs">Used when invoice complete ran</p>
                      </td>
                      <td className="max-w-[300px] px-4 py-2 text-xs text-destructive">
                        {item.erpPeSyncError
                          ? formatFailedErpSyncErrorMessage(item.erpPeSyncError)
                          : "—"}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(item.erpPeSyncFailedAt)}
                      </td>
                      <td className="min-w-[220px] px-4 py-2">
                        <div className="space-y-2">
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">
                              Retry with different MOP (optional)
                            </p>
                            <ErpPaymentModeSelect
                              value={retryMopOverride[item.id] ?? ""}
                              onChange={(mop) =>
                                setRetryMopOverride((prev) => ({ ...prev, [item.id]: mop }))
                              }
                              disabled={isBusy}
                              allowEmpty
                              emptyLabel="Same as attempted"
                              placeholder="Same as attempted"
                            />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              className="gap-2"
                              onClick={() => void handleRetry(item)}
                              disabled={isBusy}
                            >
                              {rowBusy ? (
                                <>
                                  <Loader2 className="size-4 animate-spin" aria-hidden />
                                  Working…
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="size-4" aria-hidden />
                                  Retry PE
                                </>
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              onClick={() => void handleDismiss(item)}
                              disabled={isBusy}
                            >
                              <CheckCircle2 className="size-4" aria-hidden />
                              Cleared in ERP
                            </Button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
