"use client";

import { useEffect, useMemo, useState } from "react";

import { FileSpreadsheet, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { TableSkeleton } from "@/components/skeletons/table-skeleton";
import { notify } from "@/lib/notify";
import { APP_LOCALE, formatAppDateTime } from "@/lib/format-datetime";
import type {
  AbandonedOrdersListItem,
  AbandonedOrdersPagination,
} from "@/lib/page-data/abandoned-orders-types";
import {
  FOLLOW_UP_STATUS_LABELS,
  getAbandonedOrdersResponseDisplay,
  MANUAL_CUSTOMER_RESPONSES,
  CUSTOMER_RESPONSE_LABELS,
  type FollowUpStatus,
} from "@/lib/abandoned-orders-constants";
import { AbandonedOrderFollowUpForm } from "@/components/molecules/abandoned-order-follow-up-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type SyncInfo = {
  lastSyncedAt: string | null;
  lastSyncError: string | null;
};

function formatMoney(value: string | null, currency: string) {
  if (!value) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return `${value} ${currency}`;
  return `${n.toLocaleString(APP_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function followUpRowBorderClass(status: FollowUpStatus) {
  if (status === "follow_up") {
    return "border-amber-500 bg-amber-500/[0.04]";
  }
  if (status === "closed") {
    return "border-emerald-500 bg-emerald-500/[0.04]";
  }
  return "border-slate-400 bg-secondary/10";
}

export function AbandonedOrdersPanel({
  initialData,
  sync,
  canManage,
}: {
  initialData: { items: AbandonedOrdersListItem[]; pagination: AbandonedOrdersPagination };
  sync: SyncInfo;
  canManage: boolean;
}) {
  const [items, setItems] = useState<AbandonedOrdersListItem[]>(initialData.items);
  const [pagination, setPagination] = useState<AbandonedOrdersPagination>(initialData.pagination);

  const [syncInfo, setSyncInfo] = useState<SyncInfo>(sync);

  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [status, setStatus] = useState<string>(""); // empty = all statuses
  const [response, setResponse] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  const [page, setPage] = useState<number>(initialData.pagination.page);
  const [limit, setLimit] = useState<number>(initialData.pagination.limit);

  const [loading, setLoading] = useState<boolean>(false);

  const [refreshNonce, setRefreshNonce] = useState(0);

  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<AbandonedOrdersListItem | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  const filterSignature = useMemo(
    () => JSON.stringify({ from, to, status, response, search, page, limit, refreshNonce }),
    [from, to, status, response, search, page, limit, refreshNonce]
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        if (status) params.set("status", status);
        if (response) params.set("response", response);
        if (search.trim()) params.set("search", search.trim());
        params.set("page", String(page));
        params.set("limit", String(limit));

        const res = await fetch(`/api/admin/abandoned-orders/page-data?${params.toString()}`);
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          if (!cancelled) notify.error(data.error ?? "Failed to load abandoned orders");
          return;
        }

        const data = (await res.json()) as {
          items: AbandonedOrdersListItem[];
          pagination: AbandonedOrdersPagination;
          sync: SyncInfo & { syncedJustNow?: boolean };
        };

        if (cancelled) return;
        setItems(data.items);
        setPagination(data.pagination);
        setSyncInfo({ lastSyncedAt: data.sync.lastSyncedAt, lastSyncError: data.sync.lastSyncError });
      } catch (e) {
        if (!cancelled) notify.error(e instanceof Error ? e.message : "Failed to load abandoned orders");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    // Avoid double-load when the initial mount uses initialData.
    // The first signature match will still load once; that's acceptable for MVP.
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSignature]);

  const showSyncError = Boolean(syncInfo.lastSyncError);

  async function openEditor(item: AbandonedOrdersListItem) {
    if (!canManage) return;
    setSelectedItem(item);
    setEditorOpen(true);
  }

  async function submitFollowUp(values: {
    followUpStatus: AbandonedOrdersListItem["followUpStatus"];
    customerResponse: AbandonedOrdersListItem["customerResponse"];
    remark: string | undefined;
  }) {
    if (!selectedItem) return;

    setSaveBusy(true);
    try {
      const payload: Record<string, unknown> = {
        followUpStatus: values.followUpStatus,
        customerResponse:
          values.followUpStatus === "closed" ? values.customerResponse : null,
      };

      if (values.remark !== undefined) payload.remark = values.remark;

      const res = await fetch(`/api/admin/abandoned-orders/${selectedItem.id}/follow-up`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to save follow-up");
        return;
      }

      notify.success("Follow-up saved");
      setEditorOpen(false);
      setSelectedItem(null);
      setRefreshNonce((n) => n + 1);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Failed to save follow-up");
    } finally {
      setSaveBusy(false);
    }
  }

  async function exportCsv() {
    setExportBusy(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (status) params.set("status", status);
      if (response) params.set("response", response);
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/admin/abandoned-orders/export?${params.toString()}`);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        notify.error(data.error ?? "Failed to export CSV");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "abandoned-orders.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      notify.success("CSV downloaded");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Failed to export CSV");
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Abandoned Orders
          </CardTitle>
          <div className="text-muted-foreground text-sm">
            Track Shopify abandoned checkouts and manage follow-up status.
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showSyncError && (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-200">
              Sync error: {syncInfo.lastSyncError}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">From</label>
              <Input type="date" value={from} onChange={(e) => { setPage(1); setFrom(e.target.value); }} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">To</label>
              <Input type="date" value={to} onChange={(e) => { setPage(1); setTo(e.target.value); }} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Search</label>
              <Input placeholder="Name, phone, email..." value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="abandoned-filter-status">
                Follow-up status
              </label>
              <Select
                value={status || "__all__"}
                onValueChange={(v) => {
                  setPage(1);
                  setStatus(v === "__all__" ? "" : v);
                }}
              >
                <SelectTrigger id="abandoned-filter-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All statuses</SelectItem>
                  <SelectItem value="pending,follow_up">Active (Pending + Follow up)</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="follow_up">Follow up</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="abandoned-filter-response">
                Customer response
              </label>
              <Select
                value={response || "__any__"}
                onValueChange={(v) => {
                  setPage(1);
                  setResponse(v === "__any__" ? "" : v);
                }}
              >
                <SelectTrigger id="abandoned-filter-response" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any__">Any</SelectItem>
                  {MANUAL_CUSTOMER_RESPONSES.map((key) => (
                    <SelectItem key={key} value={key}>
                      {CUSTOMER_RESPONSE_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFrom("");
                  setTo("");
                  setStatus("");
                  setResponse("");
                  setSearch("");
                  setPage(1);
                }}
              >
                Reset
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  // Trigger a reload by bumping page; signature dependency handles the refetch.
                  setPage(1);
                }}
              >
                View
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={exportBusy || loading}
                onClick={() => void exportCsv()}
              >
                <FileSpreadsheet className="mr-2 size-4" aria-hidden />
                {exportBusy ? "Exporting..." : "Export CSV"}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="text-muted-foreground text-sm">
              {syncInfo.lastSyncedAt ? (
                <>Last synced: {formatAppDateTime(new Date(syncInfo.lastSyncedAt))}</>
              ) : (
                <>No sync timestamp yet</>
              )}
            </div>
          </div>

          {loading ? (
            <TableSkeleton rows={10} />
          ) : items.length === 0 ? (
            <div className="rounded-md border border-border/70 p-4 text-muted-foreground">
              No abandoned checkouts found for the selected filters.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm border-2 border-slate-400" aria-hidden />
                  Pending
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm border-2 border-amber-500" aria-hidden />
                  Follow up
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm border-2 border-emerald-500" aria-hidden />
                  Closed
                </span>
              </div>

              <div className="space-y-2">
                {items.map((item) => {
                  const responseText = getAbandonedOrdersResponseDisplay(item);
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "rounded-md border-2 p-3",
                        followUpRowBorderClass(item.followUpStatus)
                      )}
                      title={`Follow-up: ${FOLLOW_UP_STATUS_LABELS[item.followUpStatus] ?? item.followUpStatus}`}
                    >
                      <div className="grid gap-3 lg:grid-cols-[150px_minmax(0,1fr)_auto]">
                        <div className="min-w-0 space-y-1 border-b border-border/40 pb-2 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-3">
                          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            Abandoned
                          </div>
                          <div className="text-sm font-medium leading-snug">
                            {formatAppDateTime(new Date(item.abandonedAt))}
                          </div>
                          {(item.lastFollowUpBy?.name || item.lastFollowUpAt) && (
                            <div className="text-xs leading-snug text-muted-foreground">
                              Updated
                              {item.lastFollowUpBy?.name ? ` by ${item.lastFollowUpBy.name}` : ""}
                              {item.lastFollowUpAt
                                ? ` · ${formatAppDateTime(new Date(item.lastFollowUpAt))}`
                                : ""}
                            </div>
                          )}
                        </div>

                        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          <div className="min-w-0 space-y-1">
                            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              Customer
                            </div>
                            <div className="font-medium break-words">
                              {item.customerName ?? "—"}
                            </div>
                            <div className="space-y-0.5">
                              {item.customerPhone ? (
                                <a
                                  href={`tel:${item.customerPhone}`}
                                  className="inline-flex items-center gap-1.5 font-medium hover:underline"
                                >
                                  <Phone className="size-3.5 shrink-0" aria-hidden />
                                  <span className="break-all">{item.customerPhone}</span>
                                </a>
                              ) : (
                                <div className="text-sm">Phone: —</div>
                              )}
                              {item.customerEmail ? (
                                <a
                                  href={`mailto:${item.customerEmail}`}
                                  className="block break-all font-medium hover:underline"
                                  title={item.customerEmail}
                                >
                                  {item.customerEmail}
                                </a>
                              ) : (
                                <div className="text-sm">Email: —</div>
                              )}
                            </div>
                          </div>

                          <div className="min-w-0 space-y-1">
                            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              Billing
                            </div>
                            <div className="text-sm break-words leading-snug">
                              {item.billingAddressText ?? "—"}
                            </div>
                          </div>

                          <div className="min-w-0 space-y-1">
                            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              Shipping
                            </div>
                            <div className="text-sm break-words leading-snug">
                              {item.shippingAddressText ?? "—"}
                            </div>
                          </div>

                          <div className="min-w-0 space-y-1">
                            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              Cart
                            </div>
                            <div className="text-sm break-words leading-snug">
                              {item.lineItemsSummary || "—"}
                            </div>
                            <div className="font-medium">
                              {formatMoney(item.totalPrice, item.currency)}
                            </div>
                          </div>

                          <div className="min-w-0 space-y-1 sm:col-span-2 xl:col-span-1">
                            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              Response
                            </div>
                            <div className="text-sm break-words leading-snug" title={responseText}>
                              {responseText}
                            </div>
                          </div>
                        </div>

                        {canManage && (
                          <div className="flex items-start justify-end lg:pl-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void openEditor(item)}
                              disabled={loading || saveBusy}
                            >
                              Update
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="pt-4">
            <Pagination
              page={pagination.page}
              limit={pagination.limit}
              total={pagination.total}
              onPageChange={(p) => setPage(p)}
              onLimitChange={(newLimit) => {
                setLimit(newLimit);
                setPage(1);
              }}
            />
          </div>

          {!canManage && (
            <div className="text-muted-foreground text-xs">
              View-only: follow-up editing is not available for your role.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) {
            setSelectedItem(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Follow-up update</DialogTitle>
            <DialogDescription>
              Update follow-up status, customer response (when closing), and optional remark.
            </DialogDescription>
          </DialogHeader>

          {selectedItem ? (
            <div className="space-y-4">
              <div className="space-y-2 text-sm text-muted-foreground">
                <div>
                  {selectedItem.customerName ?? "Customer"} • Total: {selectedItem.totalPrice}{" "}
                  {selectedItem.currency}
                </div>
                <div>
                  <span className="font-medium text-foreground">Billing:</span>{" "}
                  {selectedItem.billingAddressText ?? "—"}
                </div>
                <div>
                  <span className="font-medium text-foreground">Shipping:</span>{" "}
                  {selectedItem.shippingAddressText ?? "—"}
                </div>
              </div>

              <AbandonedOrderFollowUpForm
                key={selectedItem.id}
                initialFollowUpStatus={selectedItem.followUpStatus}
                initialCustomerResponse={selectedItem.customerResponse}
                initialRemark={selectedItem.remark}
                busy={saveBusy}
                onSubmit={submitFollowUp}
              />
            </div>
          ) : (
            <div className="text-muted-foreground text-sm">No row selected.</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

