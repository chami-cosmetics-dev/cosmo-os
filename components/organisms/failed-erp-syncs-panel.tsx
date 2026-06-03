"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pagination } from "@/components/ui/pagination";
import { TableSkeleton } from "@/components/skeletons/table-skeleton";
import { notify } from "@/lib/notify";

type FailedErpSync = {
  id: string;
  name: string | null;
  orderNumber: string | null;
  shopifyOrderId: string;
  customerEmail: string | null;
  customerPhone: string | null;
  erpnextSyncError: string | null;
  erpnextSyncFailedAt: string | null;
  createdAt: string;
  companyLocation: { id: string; name: string };
};

export function FailedErpSyncsPanel() {
  const [items, setItems] = useState<FailedErpSync[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [selectedItem, setSelectedItem] = useState<FailedErpSync | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
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
  }, [page, limit]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchData()
      .then(() => { if (!cancelled) setLoading(false); })
      .catch(() => { if (!cancelled) { setLoading(false); notify.error("Failed to load data"); } });
    return () => { cancelled = true; };
  }, [fetchData]);

  async function handleRetry(id: string) {
    setRetryingId(id);
    try {
      const res = await fetch(`/api/admin/orders/${id}/retry-erp-sync`, { method: "POST" });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
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

  function formatDate(val: string | null): string {
    if (!val) return "—";
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-LK");
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
          Orders that arrived from Shopify but failed to sync to ERPNext. Fix the underlying issue in ERPNext, then retry.
        </p>
      </section>

      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent),color-mix(in_srgb,var(--primary)_8%,transparent))]">
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="size-5 text-destructive" />
            ERP Sync Failures
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            These orders exist in Vault OS but are missing from ERPNext. Inspect the error, fix the root cause, then retry.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <TableSkeleton columns={6} rows={5} />
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground text-sm">
              No failed ERP syncs. All orders have been synced to ERPNext successfully.
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
                      <th className="px-4 py-2 text-left font-medium">Error</th>
                      <th className="px-4 py-2 text-left font-medium">Failed at</th>
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
                        <td className="max-w-[260px] truncate px-4 py-2 text-destructive text-xs" title={item.erpnextSyncError ?? ""}>
                          {item.erpnextSyncError ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground text-xs">{formatDate(item.erpnextSyncFailedAt)}</td>
                        <td className="px-4 py-2">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-border/70 bg-background/80 hover:bg-secondary/10"
                              onClick={() => setSelectedItem(item)}
                            >
                              View
                            </Button>
                            <Button
                              size="sm"
                              className="flex items-center gap-2 shadow-[0_10px_24px_-18px_var(--primary)]"
                              onClick={() => handleRetry(item.id)}
                              disabled={retryingId !== null}
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
              </div>
              <div>
                <h4 className="mb-1 text-sm font-medium">Error</h4>
                <pre className="max-h-48 overflow-auto rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive whitespace-pre-wrap">
                  {selectedItem.erpnextSyncError ?? "—"}
                </pre>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" className="border-border/70 bg-background/85 hover:bg-secondary/10" onClick={() => setSelectedItem(null)}>
                  Close
                </Button>
                <Button
                  className="flex items-center gap-2 shadow-[0_10px_24px_-18px_var(--primary)]"
                  onClick={() => handleRetry(selectedItem.id)}
                  disabled={retryingId !== null}
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
    </div>
  );
}
