"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Copy, ExternalLink, FileJson, Loader2, RefreshCw } from "lucide-react";

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

type FailedWebhook = {
  id: string;
  shopifyOrderId: string;
  shopifyTopic: string | null;
  errorMessage: string;
  errorStack: string | null;
  createdAt: string;
  companyLocation: { id: string; name: string; shopifyLocationId: string | null };
};

export function FailedOrderWebhooksPanel() {
  const [items, setItems] = useState<FailedWebhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    errorMessage: string;
    errorStack: string | null;
    rawPayload: unknown;
    shopifyOrderId: string;
    shopifyAdminOrderUrl: string | null;
  } | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [showJsonModal, setShowJsonModal] = useState(false);

  const fetchPageData = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
    const res = await fetch(`/api/admin/orders/failed-webhooks?${params}`);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      notify.error(data.error ?? "Failed to load failed webhooks");
      return;
    }
    const data = (await res.json()) as {
      items: FailedWebhook[];
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
    fetchPageData()
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
  }, [fetchPageData]);

  async function handleViewDetails(id: string) {
    const res = await fetch(`/api/admin/orders/failed-webhooks/${id}`);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      notify.error(data.error ?? "Failed to load details");
      return;
    }
    const data = (await res.json()) as {
      shopifyOrderId: string;
      errorMessage: string;
      errorStack: string | null;
      rawPayload: unknown;
      shopifyAdminOrderUrl: string | null;
    };
    setSelectedId(id);
    setDetail({
      shopifyOrderId: data.shopifyOrderId,
      errorMessage: data.errorMessage,
      errorStack: data.errorStack,
      rawPayload: data.rawPayload,
      shopifyAdminOrderUrl: data.shopifyAdminOrderUrl ?? null,
    });
  }

  async function handleRetry(id: string) {
    setRetryingId(id);
    try {
      const res = await fetch(`/api/admin/orders/failed-webhooks/${id}/retry`, {
        method: "POST",
      });
      const data = (await res.json()) as { error?: string; message?: string };

      if (!res.ok) {
        notify.error(data.error ?? "Retry failed");
        return;
      }

      notify.success(data.message ?? "Order processed successfully");
      setSelectedId(null);
      setDetail(null);
      await fetchPageData();
    } catch {
      notify.error("Retry failed");
    } finally {
      setRetryingId(null);
    }
  }

  function formatDate(val: string): string {
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-LK");
  }

  async function handleCopyJson() {
    if (!detail?.rawPayload) return;
    const json = JSON.stringify(detail.rawPayload, null, 2);
    await navigator.clipboard.writeText(json);
    notify.success("JSON copied to clipboard");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="size-5 text-destructive" />
            Failed Order Webhooks
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            Orders that failed to save or update. Check the error, fix any issues, then retry or
            trigger the webhook again from Shopify.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <TableSkeleton columns={5} rows={5} />
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground text-sm">
              No failed webhooks. All orders have been processed successfully.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-2 text-left font-medium">Shopify Order ID</th>
                      <th className="px-4 py-2 text-left font-medium">Topic</th>
                      <th className="px-4 py-2 text-left font-medium">Location</th>
                      <th className="px-4 py-2 text-left font-medium">Error</th>
                      <th className="px-4 py-2 text-left font-medium">Failed at</th>
                      <th className="px-4 py-2 text-left font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="px-4 py-2 font-mono text-xs">{item.shopifyOrderId}</td>
                        <td className="px-4 py-2">{item.shopifyTopic ?? "—"}</td>
                        <td className="px-4 py-2">{item.companyLocation.name}</td>
                        <td className="max-w-[240px] truncate px-4 py-2 text-destructive" title={item.errorMessage}>
                          {item.errorMessage}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{formatDate(item.createdAt)}</td>
                        <td className="px-4 py-2">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleViewDetails(item.id)}
                            >
                              View
                            </Button>
                            <Button
                              size="sm"
                              className="flex items-center gap-2"
                              onClick={() => handleRetry(item.id)}
                              disabled={retryingId !== null}
                            >
                              {retryingId === item.id ? (
                                <>
                                  <Loader2 className="size-4 animate-spin" aria-hidden />
                                  Retrying...
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="size-4" aria-hidden />
                                  Retry
                                </>
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
                  onLimitChange={(l) => {
                    setLimit(l);
                    setPage(1);
                  }}
                  limitOptions={[10, 25, 50]}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!selectedId}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null);
            setShowJsonModal(false);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Failed Webhook Details</DialogTitle>
            <DialogDescription>
              Order {detail?.shopifyOrderId ?? ""}. Use this info to fix the issue, then retry or
              trigger from Shopify Admin.
            </DialogDescription>
          </DialogHeader>
          {detail && selectedId && (
            <div className="space-y-4">
              {detail.shopifyAdminOrderUrl && (
                <div>
                  <a
                    href={detail.shopifyAdminOrderUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="size-4" />
                    Open order in Shopify Admin
                  </a>
                  <p className="mt-1 text-muted-foreground text-xs">
                    Make a small edit and save to re-trigger the webhook, or fix the issue and use
                    Retry below.
                  </p>
                </div>
              )}
              <div>
                <h4 className="mb-1 text-sm font-medium">Error</h4>
                <pre className="max-h-32 overflow-auto rounded bg-destructive/10 p-3 text-xs text-destructive">
                  {detail.errorMessage}
                </pre>
              </div>
              {detail.errorStack && (
                <div>
                  <h4 className="mb-1 text-sm font-medium">Stack trace</h4>
                  <pre className="max-h-40 overflow-auto rounded bg-muted p-3 text-xs">
                    {detail.errorStack}
                  </pre>
                </div>
              )}
              <div>
                <h4 className="mb-1 text-sm font-medium">Webhook payload</h4>
                <p className="mb-2 text-muted-foreground text-xs">
                  Raw JSON received from Shopify when this webhook was triggered.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setShowJsonModal(true)}
                >
                  <FileJson className="size-4" />
                  View JSON Payload
                </Button>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSelectedId(null)}>
                  Close
                </Button>
                <Button
                  className="flex items-center gap-2"
                  onClick={() => handleRetry(selectedId)}
                  disabled={retryingId !== null}
                >
                  {retryingId === selectedId ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Retrying...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="size-4" aria-hidden />
                      Retry
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showJsonModal} onOpenChange={setShowJsonModal}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileJson className="size-5" />
              Webhook JSON Payload
            </DialogTitle>
            <DialogDescription>
              Raw payload received from Shopify for order {detail?.shopifyOrderId ?? ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 flex flex-col gap-3">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" className="gap-2" onClick={handleCopyJson}>
                <Copy className="size-4" />
                Copy to clipboard
              </Button>
            </div>
            <pre className="flex-1 overflow-auto rounded-lg border bg-muted/50 p-4 text-xs font-mono">
              <code>
                {detail?.rawPayload != null
                  ? JSON.stringify(detail.rawPayload, null, 2)
                  : "No payload"}
              </code>
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
