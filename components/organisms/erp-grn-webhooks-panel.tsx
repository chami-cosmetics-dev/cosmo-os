"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Copy, Eye, FileJson, Loader2, RefreshCw } from "lucide-react";

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
import { formatAppDateTime } from "@/lib/format-datetime";
import { notify } from "@/lib/notify";

type WebhookStatus = "unresolved" | "resolved";

type ErpWebhook = {
  id: string;
  documentType: string;
  documentName: string | null;
  erpCompany: string | null;
  endpoint: string;
  status: string;
  errorMessage: string | null;
  attemptCount: number;
  lastAttemptAt: string;
  createdAt: string;
  resolvedAt: string | null;
};

type ErpWebhookDetail = ErpWebhook & {
  errorStack: string | null;
  rawPayload: unknown;
};

const documentLabels: Record<string, string> = {
  purchase_receipt: "Purchase Receipt",
  supplier_stock_return: "Supplier Stock Return",
  purchase_invoice: "Purchase Invoice",
};

function documentLabel(type: string) {
  return documentLabels[type] ?? type;
}

export function ErpGrnWebhooksPanel() {
  const [status, setStatus] = useState<WebhookStatus>("unresolved");
  const [items, setItems] = useState<ErpWebhook[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ErpWebhookDetail | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const fetchPageData = useCallback(async () => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      status,
    });
    const response = await fetch(`/api/admin/orders/failed-webhooks/erp?${params}`);
    const data = (await response.json()) as {
      error?: string;
      items?: ErpWebhook[];
      total?: number;
    };
    if (!response.ok) throw new Error(data.error ?? "Failed to load ERP webhooks");
    setItems(data.items ?? []);
    setTotal(data.total ?? 0);
  }, [limit, page, status]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPageData()
      .catch((error: unknown) => {
        if (!cancelled) notify.error(error instanceof Error ? error.message : "Failed to load ERP webhooks");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPageData]);

  async function refresh() {
    setRefreshing(true);
    try {
      await fetchPageData();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to refresh ERP webhooks");
    } finally {
      setRefreshing(false);
    }
  }

  async function viewDetails(id: string) {
    const response = await fetch(`/api/admin/orders/failed-webhooks/erp/${id}`);
    const data = (await response.json()) as ErpWebhookDetail & { error?: string };
    if (!response.ok) {
      notify.error(data.error ?? "Failed to load webhook details");
      return;
    }
    setDetail(data);
    setDetailsOpen(true);
  }

  async function retry(id: string) {
    setRetryingId(id);
    try {
      const response = await fetch(`/api/admin/orders/failed-webhooks/erp/${id}/retry`, { method: "POST" });
      const data = (await response.json()) as { error?: string; details?: string; message?: string };
      if (!response.ok) {
        notify.error(data.details ?? data.error ?? "Retry failed");
        await fetchPageData();
        return;
      }
      notify.success(data.message ?? "ERP webhook processed successfully");
      setDetailsOpen(false);
      setDetail(null);
      await fetchPageData();
    } catch {
      notify.error("Retry failed");
    } finally {
      setRetryingId(null);
    }
  }

  async function copyPayload() {
    if (!detail) return;
    await navigator.clipboard.writeText(JSON.stringify(detail.rawPayload, null, 2));
    notify.success("JSON copied to clipboard");
  }

  return (
    <Card className="overflow-hidden border-border/70 shadow-xs">
      <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent),color-mix(in_srgb,var(--primary)_8%,transparent))]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-500" />
              ERP GRN Webhooks
            </CardTitle>
            <p className="text-muted-foreground mt-1 text-sm">
              Every purchase receipt, supplier stock return, and purchase invoice delivery is stored here for review and retry.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            {refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div className="inline-flex rounded-xl border border-border/70 bg-background/70 p-1 shadow-xs">
          {(["unresolved", "resolved"] as const).map((nextStatus) => (
            <button
              key={nextStatus}
              type="button"
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${status === nextStatus ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary/10"}`}
              onClick={() => {
                setStatus(nextStatus);
                setPage(1);
              }}
            >
              {nextStatus === "unresolved" ? "Failed ERP Webhooks" : "Processed ERP Webhooks"}
            </button>
          ))}
        </div>

        {loading ? (
          <TableSkeleton columns={7} rows={5} />
        ) : items.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
            {status === "unresolved" ? "No failed ERP webhooks." : "No processed ERP webhook records."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-muted/50 text-left">
                <tr className="border-b">
                  <th className="px-4 py-3 font-medium">Document</th>
                  <th className="px-4 py-3 font-medium">ERP company</th>
                  <th className="px-4 py-3 font-medium">Endpoint</th>
                  <th className="px-4 py-3 font-medium">Failure</th>
                  <th className="px-4 py-3 font-medium">Received</th>
                  <th className="px-4 py-3 font-medium">Attempts</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="px-4 py-3 align-top">
                      <p className="font-medium">{documentLabel(item.documentType)}</p>
                      <p className="text-muted-foreground font-mono text-xs">{item.documentName ?? "-"}</p>
                    </td>
                    <td className="px-4 py-3 align-top">{item.erpCompany ?? "Unknown"}</td>
                    <td className="max-w-[190px] truncate px-4 py-3 align-top font-mono text-xs" title={item.endpoint}>
                      {item.endpoint}
                    </td>
                    <td className="max-w-[260px] px-4 py-3 align-top">
                      <span className="line-clamp-2 text-destructive" title={item.errorMessage ?? "-"}>
                        {item.errorMessage ?? "-"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-top text-xs">{formatAppDateTime(item.createdAt)}</td>
                    <td className="px-4 py-3 align-top">{item.attemptCount}</td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => viewDetails(item.id)}>
                          <Eye />
                          View
                        </Button>
                        {status === "unresolved" && (
                          <Button size="sm" onClick={() => retry(item.id)} disabled={retryingId === item.id}>
                            {retryingId === item.id ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                            Retry
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && <Pagination page={page} limit={limit} total={total} onPageChange={setPage} onLimitChange={(nextLimit) => { setLimit(nextLimit); setPage(1); }} />}
      </CardContent>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileJson className="size-5" />
              ERP webhook details
            </DialogTitle>
            <DialogDescription>
              {detail ? `${documentLabel(detail.documentType)} ${detail.documentName ?? ""}` : "Stored ERP webhook payload"}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="min-h-0 space-y-3">
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <p><span className="font-medium">Company:</span> {detail.erpCompany ?? "Unknown"}</p>
                <p><span className="font-medium">Attempts:</span> {detail.attemptCount}</p>
                <p className="sm:col-span-2"><span className="font-medium">Error:</span> {detail.errorMessage ?? "-"}</p>
              </div>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={copyPayload}>
                  <Copy />
                  Copy JSON
                </Button>
              </div>
              <pre className="max-h-[48vh] overflow-auto rounded-lg border bg-muted/30 p-4 text-xs">
                {JSON.stringify(detail.rawPayload, null, 2)}
              </pre>
              {detail.status === "failed" && (
                <div className="flex justify-end">
                  <Button onClick={() => retry(detail.id)} disabled={retryingId === detail.id}>
                    {retryingId === detail.id ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                    Retry webhook
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
