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

type WebhookStatusFilter = "unresolved" | "resolved";

type FailedWebhook = {
  id: string;
  shopifyOrderId: string;
  shopifyTopic: string | null;
  errorMessage: string;
  errorStack: string | null;
  createdAt: string;
  resolvedAt: string | null;
  companyLocation: { id: string; name: string; shopifyLocationId: string | null };
};

type FailedWebhookSummary = {
  totalWebhooks: number;
  uniqueOrders: number;
  topTopics: Array<{ topic: string; count: number }>;
  topFailureTypes: Array<{ type: string; count: number }>;
  topErrorMessages: Array<{ message: string; count: number }>;
  oldestFailureAt: string | null;
  newestFailureAt: string | null;
};

export function FailedOrderWebhooksPanel() {
  const [items, setItems] = useState<FailedWebhook[]>([]);
  const [summary, setSummary] = useState<FailedWebhookSummary | null>(null);
  const [resolvedOverview, setResolvedOverview] = useState<FailedWebhookSummary | null>(null);
  const [resolvedOverviewTotal, setResolvedOverviewTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<WebhookStatusFilter>("unresolved");
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
  const [retryingAll, setRetryingAll] = useState(false);
  const [showJsonModal, setShowJsonModal] = useState(false);

  const fetchPageData = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
    params.set("status", status);
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
      status: WebhookStatusFilter;
      summary: FailedWebhookSummary;
    };
    setItems(data.items);
    setTotal(data.total);
    setSummary(data.summary);
  }, [page, limit, status]);

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

  useEffect(() => {
    if (status !== "unresolved") return;

    let cancelled = false;

    async function fetchResolvedOverview() {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("limit", "1");
      params.set("status", "resolved");

      try {
        const res = await fetch(`/api/admin/orders/failed-webhooks?${params}`);
        if (!res.ok) return;

        const data = (await res.json()) as {
          total: number;
          summary: FailedWebhookSummary;
        };

        if (!cancelled) {
          setResolvedOverview(data.summary);
          setResolvedOverviewTotal(data.total);
        }
      } catch {
        if (!cancelled) {
          setResolvedOverview(null);
          setResolvedOverviewTotal(0);
        }
      }
    }

    fetchResolvedOverview();

    return () => {
      cancelled = true;
    };
  }, [status, total]);

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

  async function handleRetryAll() {
    setRetryingAll(true);
    try {
      const res = await fetch("/api/admin/orders/failed-webhooks/retry-all", {
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
          `Retried ${data.total ?? 0} webhooks (${data.succeeded ?? 0} succeeded, ${data.failed ?? 0} failed)`
      );
      await fetchPageData();
    } catch {
      notify.error("Retry all failed");
    } finally {
      setRetryingAll(false);
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

  function renderSummaryBlock(
    currentSummary: FailedWebhookSummary,
    currentStatus: WebhookStatusFilter
  ) {
    return (
      <div className="space-y-4 rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_96%,white),color-mix(in_srgb,var(--secondary)_8%,transparent))] p-4 shadow-xs">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border/70 bg-background/90 p-3 shadow-xs">
            <p className="text-muted-foreground text-xs">
              {currentStatus === "unresolved" ? "Failed webhook records" : "Resolved webhook records"}
            </p>
            <p className="mt-1 font-semibold text-lg">{currentSummary.totalWebhooks}</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/90 p-3 shadow-xs">
            <p className="text-muted-foreground text-xs">Unique Shopify orders</p>
            <p className="mt-1 font-semibold text-lg">{currentSummary.uniqueOrders}</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/90 p-3 shadow-xs">
            <p className="text-muted-foreground text-xs">Oldest failure</p>
            <p className="mt-1 text-sm">
              {currentSummary.oldestFailureAt ? formatDate(currentSummary.oldestFailureAt) : "—"}
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/90 p-3 shadow-xs">
            <p className="text-muted-foreground text-xs">Latest failure</p>
            <p className="mt-1 text-sm">
              {currentSummary.newestFailureAt ? formatDate(currentSummary.newestFailureAt) : "—"}
            </p>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-border/70 bg-background/90 p-3 shadow-xs">
            <p className="mb-2 font-medium text-sm">Top failure types</p>
            {currentSummary.topFailureTypes.length === 0 ? (
              <p className="text-muted-foreground text-xs">No data</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {currentSummary.topFailureTypes.map((item) => (
                  <li key={item.type} className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{item.type}</span>
                    <span className="font-medium">{item.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-border/70 bg-background/90 p-3 shadow-xs">
            <p className="mb-2 font-medium text-sm">Top webhook topics</p>
            {currentSummary.topTopics.length === 0 ? (
              <p className="text-muted-foreground text-xs">No data</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {currentSummary.topTopics.map((item) => (
                  <li key={item.topic} className="flex items-center justify-between gap-3">
                    <span className="font-mono text-muted-foreground">{item.topic}</span>
                    <span className="font-medium">{item.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-border/70 bg-background/90 p-3 shadow-xs">
            <p className="mb-2 font-medium text-sm">Top error messages</p>
            {currentSummary.topErrorMessages.length === 0 ? (
              <p className="text-muted-foreground text-xs">No data</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {currentSummary.topErrorMessages.map((item, index) => (
                  <li
                    key={`${item.message}-${index}`}
                    className="flex items-start justify-between gap-3"
                  >
                    <span className="line-clamp-2 text-muted-foreground" title={item.message}>
                      {item.message}
                    </span>
                    <span className="font-medium">{item.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-5 shadow-[0_18px_40px_-28px_var(--primary)] sm:p-6">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.4),transparent_65%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent_65%)]" />
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
          Orders
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          <AlertCircle className="size-5 text-muted-foreground" />
          Failed Webhooks
        </h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm sm:text-base">
          Review unresolved Shopify order failures, inspect payloads, and retry processing once the issue is fixed.
        </p>
      </section>

      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent),color-mix(in_srgb,var(--primary)_8%,transparent))]">
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="size-5 text-destructive" />
            Webhook Monitor
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            Orders that failed to save or update. Check the error, fix any issues, then retry or
            trigger the webhook again from Shopify.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-xl border border-border/70 bg-background/70 p-1 shadow-xs">
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${status === "unresolved" ? "bg-primary text-primary-foreground shadow-[0_10px_24px_-18px_var(--primary)]" : "text-muted-foreground hover:bg-secondary/10"}`}
                onClick={() => {
                  setStatus("unresolved");
                  setPage(1);
                }}
              >
                Failed Webhooks
              </button>
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${status === "resolved" ? "bg-primary text-primary-foreground shadow-[0_10px_24px_-18px_var(--primary)]" : "text-muted-foreground hover:bg-secondary/10"}`}
                onClick={() => {
                  setStatus("resolved");
                  setPage(1);
                }}
              >
                Resolved Webhooks
              </button>
            </div>

            {status === "unresolved" && items.length > 0 && (
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
                    Retry All Unresolved
                  </>
                )}
              </Button>
            )}
          </div>

          {loading ? (
            <TableSkeleton columns={5} rows={5} />
          ) : items.length === 0 ? (
            <div className="space-y-4">
              <p className="py-4 text-center text-muted-foreground text-sm">
                {status === "unresolved"
                  ? "No failed webhooks. All orders have been processed successfully."
                  : "No resolved webhooks yet."}
              </p>

              {status === "unresolved" && resolvedOverview && resolvedOverviewTotal > 0 && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-medium text-sm">Resolved Webhook Overview</h3>
                      <p className="text-muted-foreground text-xs">
                        All current failures are cleared. Recent resolved webhook records are shown
                        below.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setStatus("resolved");
                        setPage(1);
                      }}
                    >
                      View Resolved Webhooks
                    </Button>
                  </div>
                  {renderSummaryBlock(resolvedOverview, "resolved")}
                </div>
              )}
            </div>
          ) : (
            <>
              {summary && renderSummaryBlock(summary, status)}

              <div className="overflow-x-auto rounded-2xl border border-border/70 bg-background/90 shadow-xs">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_94%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))]">
                      <th className="px-4 py-2 text-left font-medium">Shopify Order ID</th>
                      <th className="px-4 py-2 text-left font-medium">Topic</th>
                      <th className="px-4 py-2 text-left font-medium">Location</th>
                      <th className="px-4 py-2 text-left font-medium">Error</th>
                      <th className="px-4 py-2 text-left font-medium">Failed at</th>
                      <th className="px-4 py-2 text-left font-medium">Resolved at</th>
                      <th className="px-4 py-2 text-left font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b border-border/50 transition-colors hover:bg-secondary/10 last:border-0">
                        <td className="px-4 py-2 font-mono text-xs">{item.shopifyOrderId}</td>
                        <td className="px-4 py-2">{item.shopifyTopic ?? "—"}</td>
                        <td className="px-4 py-2">{item.companyLocation.name}</td>
                        <td className="max-w-[240px] truncate px-4 py-2 text-destructive" title={item.errorMessage}>
                          {item.errorMessage}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{formatDate(item.createdAt)}</td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {item.resolvedAt ? formatDate(item.resolvedAt) : "—"}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-border/70 bg-background/80 hover:bg-secondary/10"
                              onClick={() => handleViewDetails(item.id)}
                            >
                              View
                            </Button>
                            {status === "unresolved" && (
                              <Button
                                size="sm"
                                className="flex items-center gap-2 shadow-[0_10px_24px_-18px_var(--primary)]"
                                onClick={() => handleRetry(item.id)}
                                disabled={retryingId !== null || retryingAll}
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
                            )}
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
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-border/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_96%,white),color-mix(in_srgb,var(--secondary)_8%,transparent))]">
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
                <pre className="max-h-32 overflow-auto rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                  {detail.errorMessage}
                </pre>
              </div>
              {detail.errorStack && (
                <div>
                  <h4 className="mb-1 text-sm font-medium">Stack trace</h4>
                  <pre className="max-h-40 overflow-auto rounded-xl border border-border/70 bg-background/80 p-3 text-xs">
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
                  className="gap-2 border-border/70 bg-background/85 hover:bg-secondary/10"
                  onClick={() => setShowJsonModal(true)}
                >
                  <FileJson className="size-4" />
                  View JSON Payload
                </Button>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" className="border-border/70 bg-background/85 hover:bg-secondary/10" onClick={() => setSelectedId(null)}>
                  Close
                </Button>
                <Button
                  className="flex items-center gap-2 shadow-[0_10px_24px_-18px_var(--primary)]"
                  onClick={() => handleRetry(selectedId)}
                  disabled={status !== "unresolved" || retryingId !== null || retryingAll}
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
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden border-border/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_96%,white),color-mix(in_srgb,var(--secondary)_8%,transparent))] flex flex-col">
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
              <Button variant="outline" size="sm" className="gap-2 border-border/70 bg-background/85 hover:bg-secondary/10" onClick={handleCopyJson}>
                <Copy className="size-4" />
                Copy to clipboard
              </Button>
            </div>
            <pre className="flex-1 overflow-auto rounded-xl border border-border/70 bg-background/85 p-4 text-xs font-mono">
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
