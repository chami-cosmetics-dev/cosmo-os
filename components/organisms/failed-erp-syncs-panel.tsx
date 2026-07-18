"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Clock, CreditCard, FileText, Loader2, RefreshCw, Search } from "lucide-react";

import { FailedErpPeSyncsTab } from "@/components/organisms/failed-erp-pe-syncs-tab";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { TableSkeleton } from "@/components/skeletons/table-skeleton";
import { notify } from "@/lib/notify";
import { formatAppDateTime } from "@/lib/format-datetime";
import {
  classifyFailedErpSyncError,
  formatFailedErpSyncErrorMessage,
  resolveOutOfStockItemFromError,
  type OutOfStockLineItemHint,
} from "@/lib/failed-erp-sync-classification";
import { ERP_SYNC_STUCK_PENDING_UI_LABEL } from "@/lib/erp-sync-failure-copy";

type FailedErpSync = {
  id: string;
  name: string | null;
  orderNumber: string | null;
  shopifyOrderId: string;
  customerEmail: string | null;
  customerPhone: string | null;
  erpnextSyncError: string | null;
  erpnextSyncFailedAt: string | null;
  erpnextSyncStartedAt: string | null;
  erpnextSyncAutoRetryCount: number;
  erpnextSyncNextAutoRetryAt: string | null;
  erpnextSyncLastAutoRetryAt: string | null;
  erpnextInvoiceId: string | null;
  createdAt: string;
  companyLocation: { id: string; name: string };
  lineItems: OutOfStockLineItemHint[];
};

export function FailedErpSyncsPanel() {
  const [tab, setTab] = useState<"sales_invoice" | "payment_entry">("sales_invoice");
  const [items, setItems] = useState<FailedErpSync[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [selectedItem, setSelectedItem] = useState<FailedErpSync | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);
  const [approvalBlockedOrder, setApprovalBlockedOrder] = useState<FailedErpSync | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  const effectiveSearch = useMemo(() => debouncedSearch.trim(), [debouncedSearch]);

  useEffect(() => {
    setPage(1);
  }, [effectiveSearch]);

  const fetchData = useCallback(async () => {
    if (tab !== "sales_invoice") return;
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
    if (effectiveSearch) params.set("search", effectiveSearch);
    const res = await fetch(`/api/admin/orders/failed-erp-syncs?${params}`);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      notify.error(data.error ?? "Failed to load");
      return;
    }
    const data = (await res.json()) as {
      items: FailedErpSync[];
      total: number;
      page: number;
      limit: number;
    };
    setItems(data.items);
    setTotal(data.total);
  }, [page, limit, effectiveSearch, tab]);

  useEffect(() => {
    if (tab !== "sales_invoice") {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchData()
      .then(() => { if (!cancelled) setLoading(false); })
      .catch(() => { if (!cancelled) { setLoading(false); notify.error("Failed to load data"); } });
    return () => { cancelled = true; };
  }, [fetchData, tab]);

  function formatSyncError(message: string | null) {
    return message ? formatFailedErpSyncErrorMessage(message) : null;
  }

  function resolveOutOfStock(message: string | null, lineItems: OutOfStockLineItemHint[] = []) {
    if (!message) return null;
    return resolveOutOfStockItemFromError(message, lineItems);
  }

  function renderSyncError(message: string | null, lineItems: OutOfStockLineItemHint[] = []) {
    if (!message) return null;
    const formatted = formatFailedErpSyncErrorMessage(message);
    const outOfStock = resolveOutOfStock(message, lineItems);
    if (outOfStock?.sku) {
      return (
        <div className="space-y-0.5">
          <span className="font-medium text-destructive">Out of stock</span>
          <div className="font-mono text-[11px] text-destructive/90">SKU: {outOfStock.sku}</div>
          {outOfStock.itemName ? (
            <div className="text-[11px] leading-snug text-destructive/80">{outOfStock.itemName}</div>
          ) : null}
        </div>
      );
    }
    return <span className="line-clamp-2 text-destructive">{formatted}</span>;
  }

  async function handleRetry(id: string) {
    setRetryingId(id);
    try {
      const res = await fetch(`/api/admin/orders/${id}/retry-erp-sync`, { method: "POST" });
      const data = (await res.json()) as { error?: string; message?: string; code?: string };
      if (!res.ok) {
        if (data.code === "PENDING_APPROVAL") {
          const item = items.find((i) => i.id === id) ?? null;
          setApprovalBlockedOrder(item);
          setSelectedItem(null);
          return;
        }
        notify.error(data.error ?? "Retry failed");
        return;
      }
      notify.success(data.message ?? "ERP sync succeeded");
      setSelectedItem(null);
      await fetchData();
    } catch {
      notify.error("Retry failed");
    } finally {
      setRetryingId(null);
    }
  }

  async function handleRetryAll() {
    setRetryingAll(true);
    try {
      const res = await fetch("/api/admin/orders/failed-erp-syncs/retry-all", {
        method: "POST",
      });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        total?: number;
        succeeded?: number;
        failed?: number;
      };
      if (!res.ok) {
        notify.error(data.error ?? "Retry all failed");
        return;
      }

      notify.success(
        data.message ??
          `Retried ${data.total ?? 0} orders (${data.succeeded ?? 0} succeeded, ${data.failed ?? 0} failed)`
      );
      await fetchData();
    } catch {
      notify.error("Retry all failed");
    } finally {
      setRetryingAll(false);
    }
  }

  function formatAutoRetryStatus(item: FailedErpSync): string {
    if (item.erpnextSyncNextAutoRetryAt) {
      return `Auto-retry #${item.erpnextSyncAutoRetryCount + 1} at ${formatDate(item.erpnextSyncNextAutoRetryAt)}`;
    }
    if (item.erpnextSyncAutoRetryCount > 0) {
      return `Auto-retry exhausted (${item.erpnextSyncAutoRetryCount} attempts)`;
    }
    return "Manual retry required";
  }

  function formatDate(val: string | null): string {
    return formatAppDateTime(val);
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-5 shadow-[0_18px_40px_-28px_var(--primary)] sm:p-6">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.4),transparent_65%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent_65%)]" />
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">Orders</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          <AlertCircle className="size-5 text-muted-foreground" />
          Failed ERP Syncs
        </h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm sm:text-base">
          Orders that failed to sync with ERPNext — missing Sales Invoices or failed Payment Entries after invoice complete.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant={tab === "sales_invoice" ? "default" : "outline"}
            size="sm"
            className="gap-2"
            onClick={() => setTab("sales_invoice")}
          >
            <FileText className="size-4" aria-hidden />
            Sales Invoice
          </Button>
          <Button
            type="button"
            variant={tab === "payment_entry" ? "default" : "outline"}
            size="sm"
            className="gap-2"
            onClick={() => setTab("payment_entry")}
          >
            <CreditCard className="size-4" aria-hidden />
            Payment Entry
          </Button>
        </div>
      </section>

      {tab === "payment_entry" ? (
        <FailedErpPeSyncsTab />
      ) : (
      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent),color-mix(in_srgb,var(--primary)_8%,transparent))]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="size-5 text-destructive" />
                ERP Sync Failures
              </CardTitle>
              <p className="text-muted-foreground mt-1 text-sm">
                These orders exist in Vault OS but are missing from ERPNext. Fix the root cause if needed, or use Retry All.
              </p>
            </div>
            {items.length > 0 && (
              <Button
                onClick={handleRetryAll}
                disabled={retryingAll || retryingId !== null}
                className="flex items-center gap-2 shadow-[0_10px_24px_-18px_var(--primary)]"
              >
                {retryingAll ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Retrying All...
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
        <CardContent className="space-y-4">
          <div className="relative max-w-md">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              placeholder="Search by order #, ERP invoice, customer, or error..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border-border/70 bg-background/90 pl-9"
            />
          </div>
          {loading ? (
            <TableSkeleton columns={8} rows={5} />
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground text-sm">
              {effectiveSearch
                ? "No failed ERP syncs match your search."
                : "No failed ERP syncs. All orders have been synced to ERPNext successfully."}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-2xl border border-border/70 bg-background/90 shadow-xs">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_94%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))]">
                      <th className="px-4 py-2 text-left font-medium">Order</th>
                      <th className="px-4 py-2 text-left font-medium">Customer</th>
                      <th className="px-4 py-2 text-left font-medium">Location</th>
                      <th className="px-4 py-2 text-left font-medium">Order date</th>
                      <th className="px-4 py-2 text-left font-medium">Error</th>
                      <th className="px-4 py-2 text-left font-medium">Failed at</th>
                      <th className="px-4 py-2 text-left font-medium">Auto-retry</th>
                      <th className="px-4 py-2 text-left font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b border-border/50 transition-colors hover:bg-secondary/10 last:border-0">
                        <td className="px-4 py-2">
                          <div className="font-medium">{item.name ?? item.orderNumber ?? "—"}</div>
                          <div className="font-mono text-xs text-muted-foreground">{item.shopifyOrderId}</div>
                        </td>
                        <td className="px-4 py-2">
                          <div className="text-xs">{item.customerEmail ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{item.customerPhone ?? ""}</div>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{item.companyLocation.name}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{formatDate(item.createdAt)}</td>
                        <td className="max-w-70 px-4 py-2 align-top text-xs" title={formatSyncError(item.erpnextSyncError) ?? ""}>
                          {item.erpnextSyncError ? (
                            renderSyncError(item.erpnextSyncError, item.lineItems)
                          ) : item.erpnextInvoiceId === "pending_approval" ? (
                            <span className="text-amber-500">Legacy placeholder — retry to create unpaid ERP SI</span>
                          ) : item.erpnextInvoiceId === "pending" ? (
                            <span className="text-amber-500">{ERP_SYNC_STUCK_PENDING_UI_LABEL}</span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground text-xs">
                          {formatDate(item.erpnextSyncFailedAt ?? (item.erpnextInvoiceId === "pending" ? item.erpnextSyncStartedAt : null))}
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{formatAutoRetryStatus(item)}</td>
                        <td className="px-4 py-2">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-border/70 bg-background/80 hover:bg-secondary/10"
                              onClick={() => setSelectedItem(item)}
                              disabled={retryingAll}
                            >
                              View
                            </Button>
                            <Button
                              size="sm"
                              className="flex items-center gap-2 shadow-[0_10px_24px_-18px_var(--primary)]"
                              onClick={() => handleRetry(item.id)}
                              disabled={retryingAll || retryingId !== null}
                            >
                              {retryingId === item.id ? (
                                <><Loader2 className="size-4 animate-spin" aria-hidden />Retrying...</>
                              ) : (
                                <><RefreshCw className="size-4" aria-hidden />Retry</>
                              )}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {total > 0 && (
                <Pagination
                  page={page}
                  limit={limit}
                  total={total}
                  onPageChange={setPage}
                  onLimitChange={(l) => { setLimit(l); setPage(1); }}
                  limitOptions={[20, 50, 100]}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>
      )}

      <Dialog open={!!selectedItem} onOpenChange={(open) => { if (!open) setSelectedItem(null); }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-border/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_96%,white),color-mix(in_srgb,var(--secondary)_8%,transparent))]">
          <DialogHeader>
            <DialogTitle>ERP Sync Failure Details</DialogTitle>
            <DialogDescription>
              Order {selectedItem?.name ?? selectedItem?.shopifyOrderId ?? ""}. Fix the issue in ERPNext, then retry.
            </DialogDescription>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Order</p>
                  <p className="font-medium">{selectedItem.name ?? selectedItem.orderNumber ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Shopify Order ID</p>
                  <p className="font-mono text-xs">{selectedItem.shopifyOrderId}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Customer</p>
                  <p>{selectedItem.customerEmail ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Location</p>
                  <p>{selectedItem.companyLocation.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Order created</p>
                  <p>{formatDate(selectedItem.createdAt)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Sync failed at</p>
                  <p>{formatDate(selectedItem.erpnextSyncFailedAt)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Auto-retry status</p>
                  <p>{formatAutoRetryStatus(selectedItem)}</p>
                </div>
              </div>
              <div>
                <h4 className="mb-1 text-sm font-medium">
                  {selectedItem.erpnextInvoiceId === "pending_approval" && !selectedItem.erpnextSyncError ? "Status" : "Error"}
                </h4>
                {selectedItem.erpnextSyncError ? (
                  <div className="space-y-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                    {(() => {
                      const classification = classifyFailedErpSyncError(selectedItem.erpnextSyncError);
                      const outOfStock = resolveOutOfStock(
                        selectedItem.erpnextSyncError,
                        selectedItem.lineItems,
                      );
                      return (
                        <>
                          <p className="font-medium">{classification.type}</p>
                          {outOfStock?.sku ? (
                            <div className="space-y-1">
                              <p>
                                <span className="text-muted-foreground">SKU:</span>{" "}
                                <span className="font-mono">{outOfStock.sku}</span>
                              </p>
                              {outOfStock.itemName ? (
                                <p>
                                  <span className="text-muted-foreground">Item:</span> {outOfStock.itemName}
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap">{formatSyncError(selectedItem.erpnextSyncError)}</p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <pre className="max-h-48 overflow-auto rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs whitespace-pre-wrap text-amber-700 dark:text-amber-400">
                    {selectedItem.erpnextInvoiceId === "pending_approval"
                      ? "Legacy workflow placeholder — click Retry to create the unpaid ERP Sales Invoice while finance approval remains pending."
                      : selectedItem.erpnextInvoiceId === "pending"
                        ? ERP_SYNC_STUCK_PENDING_UI_LABEL
                        : "—"}
                  </pre>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" className="border-border/70 bg-background/85 hover:bg-secondary/10" onClick={() => setSelectedItem(null)}>
                  Close
                </Button>
                <Button
                  className="flex items-center gap-2 shadow-[0_10px_24px_-18px_var(--primary)]"
                  onClick={() => handleRetry(selectedItem.id)}
                  disabled={retryingAll || retryingId !== null}
                >
                  {retryingId === selectedItem.id ? (
                    <><Loader2 className="size-4 animate-spin" aria-hidden />Retrying...</>
                  ) : (
                    <><RefreshCw className="size-4" aria-hidden />Retry ERP Sync</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!approvalBlockedOrder} onOpenChange={(open) => { if (!open) setApprovalBlockedOrder(null); }}>
        <DialogContent className="max-w-md border-border/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_96%,white),color-mix(in_srgb,var(--secondary)_8%,transparent))]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="size-5 text-amber-500" />
              Finance Approval Required
            </DialogTitle>
            <DialogDescription>
              Order {approvalBlockedOrder?.name ?? approvalBlockedOrder?.shopifyOrderId ?? ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>This order still needs its unpaid ERP Sales Invoice. Use Retry to create the SI; finance approval remains separate and continues to block fulfillment until approved.</p>
            <p className="text-muted-foreground">Legacy placeholder rows (pending_approval) can also be retried into a real SI without waiting for approval.</p>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" className="border-border/70 bg-background/85 hover:bg-secondary/10" onClick={() => setApprovalBlockedOrder(null)}>
              OK
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
