"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Copy,
  Download,
  Loader2,
  Mail,
  Phone,
  Search,
  ShoppingBag,
  UserRoundCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  buildCopyContactBatch,
  formatCopyContactToastSummary,
} from "@/lib/merchant-review-copy-contacts";
import { notify } from "@/lib/notify";
import { APP_TIME_ZONE, formatAppDateTime } from "@/lib/format-datetime";

type QueueItem = {
  orderId: string;
  orderLabel: string;
  orderNumber: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  totalPrice: string;
  currency: string | null;
  createdAt: string;
  assignedMerchant: { id: string; name: string | null; email: string | null } | null;
  reviewMerchant: { id: string; name: string };
  reviewStatus: "pending" | "reviewed" | "follow_up" | "no_response";
  reviewMarkedAt: string | null;
};

/** Status dropdown: single statuses, all, or open calling queue (pending + follow_up) */
type StatusFilter = "__all" | "__open" | QueueItem["reviewStatus"];

type MerchantReviewPanelInitialData = {
  orders: QueueItem[];
  merchantOptions: Array<{ id: string; name: string }>;
  defaultMerchantFilter: string;
  defaultStatusFilter: StatusFilter;
  defaultDateFrom: string;
  defaultDateTo: string;
  counts: {
    all: number;
    pending: number;
    reviewed: number;
    followUp: number;
    noResponse: number;
  };
};

type DetailResponse = {
  order: {
    id: string;
    shopifyOrderId: string;
    orderNumber: string | null;
    name: string | null;
    sourceName: string;
    totalPrice: string;
    currency: string | null;
    createdAt: string;
    customerEmail: string | null;
    customerPhone: string | null;
    assignedMerchant: { id: string; name: string | null; email: string | null } | null;
    companyLocation: { id: string; name: string };
    shippingAddress: unknown;
    lineItems: Array<{
      id: string;
      productTitle: string;
      variantTitle: string | null;
      sku: string | null;
      quantity: number;
      price: string;
    }>;
  };
  review: {
    reviewStatus: "pending" | "reviewed" | "follow_up" | "no_response";
    callMade: boolean;
    callbackDate: string | null;
    customerResponseStatus: string | null;
    reviewerFirstName: string | null;
    reviewerLastName: string | null;
    reviewerEmail: string | null;
    reason: string | null;
    reviewMarkedAt: string | null;
    updatedAt: string;
  } | null;
};

type ReviewForm = {
  reviewStatus: "pending" | "reviewed" | "follow_up" | "no_response";
  callMade: "yes" | "no";
  callbackDate: string;
  customerResponseStatus: string;
  reviewerFirstName: string;
  reviewerLastName: string;
  reviewerEmail: string;
  reason: string;
};

function formatDateTime(value?: string | null) {
  return formatAppDateTime(value, "N/A");
}

function formatDateInputValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isInDateRange(value: string, from: string, to: string) {
  const dateValue = formatDateInputValue(value);
  if (!dateValue) return false;
  if (from && dateValue < from) return false;
  if (to && dateValue > to) return false;
  return true;
}

function formatAmount(value: string, currency?: string | null) {
  const amount = Number.parseFloat(value);
  if (Number.isNaN(amount)) return value;
  const formatted = amount.toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${formatted} ${currency}` : formatted;
}

function buildInitialForm(review: DetailResponse["review"]): ReviewForm {
  return {
    reviewStatus: review?.reviewStatus ?? "pending",
    callMade: review?.callMade ? "yes" : "no",
    callbackDate: review?.callbackDate?.slice(0, 10) ?? "",
    customerResponseStatus: review?.customerResponseStatus ?? "__none",
    reviewerFirstName: review?.reviewerFirstName ?? "",
    reviewerLastName: review?.reviewerLastName ?? "",
    reviewerEmail: review?.reviewerEmail ?? "",
    reason: review?.reason ?? "",
  };
}

function statusBadgeClass(status: QueueItem["reviewStatus"]) {
  if (status === "reviewed") return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
  if (status === "follow_up") return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
  if (status === "no_response") return "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300";
  return "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300";
}

function statusLabel(status: QueueItem["reviewStatus"]) {
  if (status === "reviewed") return "Reviewed";
  if (status === "follow_up") return "Follow Up";
  if (status === "no_response") return "No Response";
  return "Pending";
}

function extractShippingAddress(input: unknown) {
  if (!input || typeof input !== "object") return "";
  const shipping = input as Record<string, unknown>;
  return [
    typeof shipping.address1 === "string" ? shipping.address1 : "",
    typeof shipping.city === "string" ? shipping.city : "",
    typeof shipping.province === "string" ? shipping.province : "",
    typeof shipping.country === "string" ? shipping.country : "",
  ]
    .filter(Boolean)
    .join(", ");
}

export function MerchantReviewPanel({
  initialData,
  canManage,
}: {
  initialData: MerchantReviewPanelInitialData;
  canManage: boolean;
}) {
  const [queueOrders, setQueueOrders] = useState(initialData.orders);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialData.defaultStatusFilter);
  const [merchantFilter, setMerchantFilter] = useState(initialData.defaultMerchantFilter);
  const [dateFrom, setDateFrom] = useState(initialData.defaultDateFrom);
  const [dateTo, setDateTo] = useState(initialData.defaultDateTo);
  const [selectedOrderId, setSelectedOrderId] = useState(initialData.orders[0]?.orderId ?? "");
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copyingContacts, setCopyingContacts] = useState(false);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [form, setForm] = useState<ReviewForm>(buildInitialForm(null));
  const isBusy = saving || copyingContacts;

  const dateScopedOrders = useMemo(
    () => queueOrders.filter((order) => isInDateRange(order.createdAt, dateFrom, dateTo)),
    [queueOrders, dateFrom, dateTo]
  );

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return dateScopedOrders.filter((order) => {
      if (statusFilter === "__open") {
        if (order.reviewStatus !== "pending" && order.reviewStatus !== "follow_up") return false;
      } else if (statusFilter !== "__all" && order.reviewStatus !== statusFilter) {
        return false;
      }
      if (merchantFilter !== "__all" && order.reviewMerchant.id !== merchantFilter) return false;
      if (!query) return true;
      return [
        order.orderLabel,
        order.orderNumber,
        order.customerName,
        order.customerEmail,
        order.customerPhone,
        order.assignedMerchant?.name,
        order.assignedMerchant?.email,
        order.reviewMerchant.name,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query));
    });
  }, [dateScopedOrders, search, statusFilter, merchantFilter]);

  const counts = useMemo(
    () =>
      filteredOrders.reduce(
        (acc, item) => {
          acc.all += 1;
          if (item.reviewStatus === "reviewed") acc.reviewed += 1;
          else if (item.reviewStatus === "follow_up") acc.followUp += 1;
          else if (item.reviewStatus === "no_response") acc.noResponse += 1;
          else acc.pending += 1;
          return acc;
        },
        { all: 0, pending: 0, reviewed: 0, followUp: 0, noResponse: 0 }
      ),
    [filteredOrders]
  );

  useEffect(() => {
    if (!filteredOrders.some((item) => item.orderId === selectedOrderId)) {
      setSelectedOrderId(filteredOrders[0]?.orderId ?? "");
    }
  }, [filteredOrders, selectedOrderId]);

  useEffect(() => {
    if (!selectedOrderId) {
      setDetail(null);
      setForm(buildInitialForm(null));
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    fetch(`/api/admin/merchant-reviews/orders/${selectedOrderId}`)
      .then(async (res) => {
        const data = (await res.json()) as DetailResponse & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Failed to load review sheet");
        if (!cancelled) {
          setDetail(data);
          setForm(buildInitialForm(data.review));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setDetail(null);
          notify.error(error instanceof Error ? error.message : "Failed to load review sheet");
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedOrderId]);

  async function saveReview() {
    if (!detail || !canManage || isBusy) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/merchant-reviews/orders/${detail.order.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewStatus: form.reviewStatus,
          callMade: form.callMade === "yes",
          callbackDate: form.callbackDate || null,
          customerResponseStatus:
            form.customerResponseStatus === "__none" ? null : form.customerResponseStatus,
          reviewerFirstName: form.reviewerFirstName.trim() || null,
          reviewerLastName: form.reviewerLastName.trim() || null,
          reviewerEmail: form.reviewerEmail.trim() || null,
          reason: form.reason.trim() || null,
        }),
      });
      const data = (await res.json()) as { error?: string; review?: DetailResponse["review"] };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to save merchant review");
        return;
      }

      setQueueOrders((current) =>
        current.map((item) =>
          item.orderId === detail.order.id
            ? {
                ...item,
                reviewStatus: data.review?.reviewStatus ?? item.reviewStatus,
                reviewMarkedAt: data.review?.reviewMarkedAt ?? item.reviewMarkedAt,
              }
            : item
        )
      );
      setDetail((current) => (current ? { ...current, review: data.review ?? null } : current));
      if (data.review) {
        setForm((current) => ({ ...current, reviewStatus: data.review!.reviewStatus }));
      }
      notify.success("Merchant review saved");
    } catch {
      notify.error("Failed to save merchant review");
    } finally {
      setSaving(false);
    }
  }

  function applyFollowUpToQueue(updatedOrderIds: string[]) {
    if (updatedOrderIds.length === 0) return;
    const updated = new Set(updatedOrderIds);
    setQueueOrders((current) =>
      current.map((item) =>
        updated.has(item.orderId) ? { ...item, reviewStatus: "follow_up" as const } : item
      )
    );
    if (selectedOrderId && updated.has(selectedOrderId)) {
      setForm((current) =>
        current.reviewStatus === "pending" ? { ...current, reviewStatus: "follow_up" } : current
      );
      setDetail((current) => {
        if (!current) return current;
        return {
          ...current,
          review: current.review
            ? { ...current.review, reviewStatus: "follow_up" }
            : {
                reviewStatus: "follow_up",
                callMade: false,
                callbackDate: null,
                customerResponseStatus: null,
                reviewerFirstName: null,
                reviewerLastName: null,
                reviewerEmail: null,
                reason: null,
                reviewMarkedAt: null,
                updatedAt: new Date().toISOString(),
              },
        };
      });
    }
  }

  async function copyAllContactNumbers() {
    if (!canManage || isBusy) return;

    const batch = buildCopyContactBatch(filteredOrders);
    if (batch.clipboardPhones.length === 0) {
      if (filteredOrders.length === 0) {
        notify.info("No contacts to copy — the assigned review queue is empty.");
      } else {
        notify.info(
          `No usable contact numbers to copy${
            batch.skips.missingPhone > 0 || batch.skips.terminalStatus > 0
              ? ` (${[
                  batch.skips.missingPhone > 0 ? `${batch.skips.missingPhone} missing phone` : null,
                  batch.skips.terminalStatus > 0
                    ? `${batch.skips.terminalStatus} reviewed/no response`
                    : null,
                ]
                  .filter(Boolean)
                  .join(", ")})`
              : ""
          }.`
        );
      }
      return;
    }

    setCopyingContacts(true);
    try {
      try {
        await navigator.clipboard.writeText(batch.clipboardText);
      } catch {
        notify.error("Could not copy numbers to the clipboard. Statuses were not changed.");
        return;
      }

      if (batch.markOrderIds.length === 0) {
        notify.success(
          formatCopyContactToastSummary({
            copied: batch.clipboardPhones.length,
            updated: 0,
            alreadyFollowUp: batch.clipboardOrderIds.length,
            skips: batch.skips,
          })
        );
        return;
      }

      const res = await fetch("/api/admin/merchant-reviews/mark-follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: batch.markOrderIds }),
      });
      const data = (await res.json()) as {
        error?: string;
        updatedOrderIds?: string[];
        counts?: {
          requested: number;
          updated: number;
          alreadyFollowUp: number;
          terminalStatus: number;
          notFound: number;
        };
      };

      if (!res.ok) {
        notify.error(
          `Numbers were copied, but Follow up could not be saved: ${data.error ?? "Request failed"}. Retry or update statuses manually.`
        );
        return;
      }

      const updatedOrderIds = data.updatedOrderIds ?? [];
      applyFollowUpToQueue(updatedOrderIds);

      const counts = data.counts;
      const notFound = counts?.notFound ?? 0;
      const incomplete =
        !!counts &&
        counts.updated + counts.alreadyFollowUp + counts.terminalStatus + counts.notFound <
          counts.requested;
      const summary = formatCopyContactToastSummary({
        copied: batch.clipboardPhones.length,
        updated: counts?.updated ?? updatedOrderIds.length,
        alreadyFollowUp: counts?.alreadyFollowUp,
        skips: {
          missingPhone: batch.skips.missingPhone,
          terminalStatus: batch.skips.terminalStatus + (counts?.terminalStatus ?? 0),
        },
        notFound,
      });

      if (notFound > 0 || incomplete) {
        notify.error(`Numbers were copied, but some statuses may be incomplete. ${summary}`);
      } else {
        notify.success(summary);
      }
    } catch {
      notify.error(
        "Numbers may have been copied, but Follow up updates failed. Retry or update statuses manually."
      );
    } finally {
      setCopyingContacts(false);
    }
  }

  function exportReviews() {
    const exportStatus =
      statusFilter === "__all" || statusFilter === "__open" ? "all" : statusFilter;
    const params = new URLSearchParams({ status: exportStatus });
    if (merchantFilter !== "__all") {
      params.set("merchant", merchantFilter);
    }
    if (dateFrom) {
      params.set("dateFrom", dateFrom);
    }
    if (dateTo) {
      params.set("dateTo", dateTo);
    }
    const query = search.trim();
    if (query) {
      params.set("search", query);
    }
    window.location.href = `/api/admin/merchant-reviews/export?${params.toString()}`;
  }

  const selectedQueueItem = filteredOrders.find((item) => item.orderId === selectedOrderId) ?? null;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle>Merchant Reviews</CardTitle>
              <CardDescription>
                {canManage
                  ? "Review assigned customer orders across merchants, capture call details, and update review status."
                  : "View assigned customer orders, call details, and review status."}
              </CardDescription>
            </div>
            <Button type="button" variant="outline" onClick={exportReviews} disabled={isBusy}>
              <Download className="size-4" />
              Export Reviews
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 pt-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-xl border border-border/70 bg-background/70 p-3"><p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">All Assigned</p><p className="text-2xl font-semibold">{counts.all}</p></div>
            <div className="rounded-xl border border-border/70 bg-background/70 p-3"><p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">Pending</p><p className="text-2xl font-semibold">{counts.pending}</p></div>
            <div className="rounded-xl border border-border/70 bg-background/70 p-3"><p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">Reviewed</p><p className="text-2xl font-semibold">{counts.reviewed}</p></div>
            <div className="rounded-xl border border-border/70 bg-background/70 p-3"><p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">Follow Up</p><p className="text-2xl font-semibold">{counts.followUp}</p></div>
            <div className="rounded-xl border border-border/70 bg-background/70 p-3"><p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">No Response</p><p className="text-2xl font-semibold">{counts.noResponse}</p></div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row xl:flex-col">
                <div className="relative flex-1">
                  <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search order, customer, email, phone..."
                    className="pl-9"
                    disabled={isBusy}
                  />
                </div>
                <Select
                  value={statusFilter}
                  onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}
                  disabled={isBusy}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">All statuses</SelectItem>
                    <SelectItem value="__open">Pending & Follow up</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="follow_up">Follow Up</SelectItem>
                    <SelectItem value="reviewed">Reviewed</SelectItem>
                    <SelectItem value="no_response">No Response</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={merchantFilter} onValueChange={setMerchantFilter} disabled={isBusy}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">All merchants</SelectItem>
                    {initialData.merchantOptions.map((merchant) => (
                      <SelectItem key={merchant.id} value={merchant.id}>{merchant.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <CalendarDays className="size-4 text-primary" />
                      From
                    </label>
                    <Input
                      type="date"
                      value={dateFrom}
                      max={dateTo || undefined}
                      onChange={(event) => setDateFrom(event.target.value)}
                      disabled={isBusy}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <CalendarDays className="size-4 text-primary" />
                      To
                    </label>
                    <Input
                      type="date"
                      value={dateTo}
                      min={dateFrom || undefined}
                      onChange={(event) => setDateTo(event.target.value)}
                      disabled={isBusy}
                    />
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-border/70">
                <div className="flex items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Assigned Review Queue</p>
                    <p className="text-muted-foreground text-sm">{filteredOrders.length} order(s)</p>
                  </div>
                  {canManage ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      disabled={isBusy}
                      onClick={() => void copyAllContactNumbers()}
                    >
                      {copyingContacts ? (
                        <>
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                          Copying...
                        </>
                      ) : (
                        <>
                          <Copy className="size-4" aria-hidden />
                          Copy all contact numbers
                        </>
                      )}
                    </Button>
                  ) : null}
                </div>
                <div className="max-h-[70vh] overflow-y-auto">
                  {filteredOrders.length === 0 ? (
                    <div className="px-4 py-10 text-center">
                      <p className="text-sm font-medium">No assigned review orders found</p>
                      <p className="text-muted-foreground mt-1 text-sm">Try a different search or review status filter.</p>
                    </div>
                  ) : (
                    filteredOrders.map((order) => (
                      <button key={order.orderId} type="button" onClick={() => setSelectedOrderId(order.orderId)} className={`w-full border-b px-4 py-4 text-left transition hover:bg-secondary/10 ${selectedOrderId === order.orderId ? "bg-primary/8" : "bg-transparent"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{order.customerName || order.orderLabel}</p>
                            <p className="text-muted-foreground truncate text-xs">{order.orderNumber ?? order.orderLabel}</p>
                          </div>
                          <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(order.reviewStatus)}`}>{statusLabel(order.reviewStatus)}</span>
                        </div>
                        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                          <p>{order.customerPhone || "No phone"}</p>
                          <p>{order.customerEmail || "No email"}</p>
                          <p>{formatDateTime(order.createdAt)}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {detailLoading ? (
                <Card className="border-border/70"><CardContent className="flex min-h-[500px] items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></CardContent></Card>
              ) : !detail || !selectedQueueItem ? (
                <Card className="border-border/70"><CardContent className="flex min-h-[500px] items-center justify-center"><div className="text-center"><p className="text-sm font-medium">Select an order to review</p><p className="text-muted-foreground mt-1 text-sm">The customer details, ordered items, and review sheet will appear here.</p></div></CardContent></Card>
              ) : (
                <>
                  <Card className="border-border/70">
                    <CardHeader className="border-b border-border/50">
                      <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                        <div>
                          <CardTitle>{detail.order.orderNumber ?? detail.order.name ?? detail.order.shopifyOrderId}</CardTitle>
                          <CardDescription>{detail.order.companyLocation.name} | {formatDateTime(detail.order.createdAt)}</CardDescription>
                        </div>
                        <span className={`inline-flex w-fit rounded px-2 py-1 text-xs font-medium ${statusBadgeClass(selectedQueueItem.reviewStatus)}`}>{statusLabel(selectedQueueItem.reviewStatus)}</span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-5 pt-6">
                      <div className="grid gap-4 lg:grid-cols-4">
                        <div className="rounded-xl border border-border/70 bg-background/70 p-4"><div className="mb-2 flex items-center gap-2 text-sm font-medium"><UserRoundCheck className="size-4 text-primary" />Customer</div><p className="font-medium">{selectedQueueItem.customerName || "Unknown customer"}</p><p className="break-all text-muted-foreground text-sm">{detail.order.customerEmail || "No email"}</p></div>
                        <div className="rounded-xl border border-border/70 bg-background/70 p-4"><div className="mb-2 flex items-center gap-2 text-sm font-medium"><Phone className="size-4 text-primary" />Contact Number</div><p className="font-medium">{detail.order.customerPhone || "No phone"}</p><p className="text-muted-foreground text-sm">{extractShippingAddress(detail.order.shippingAddress) || "No shipping address"}</p></div>
                        <div className="rounded-xl border border-border/70 bg-background/70 p-4"><div className="mb-2 flex items-center gap-2 text-sm font-medium"><ShoppingBag className="size-4 text-primary" />Order Value</div><p className="font-medium">{formatAmount(detail.order.totalPrice, detail.order.currency)}</p><p className="text-muted-foreground text-sm">{detail.order.sourceName}</p></div>
                        <div className="rounded-xl border border-border/70 bg-background/70 p-4"><div className="mb-2 flex items-center gap-2 text-sm font-medium"><Mail className="size-4 text-primary" />Merchant</div><p className="font-medium">{selectedQueueItem.reviewMerchant.name}</p><p className="text-muted-foreground text-sm">{detail.review?.reviewMarkedAt ? `Reviewed on ${formatDateTime(detail.review.reviewMarkedAt)}` : "Not marked reviewed yet"}</p></div>
                      </div>

                      <div className="rounded-xl border border-border/70">
                        <div className="border-b px-4 py-3"><p className="font-medium">Ordered Items</p></div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead><tr className="border-b bg-muted/20"><th className="px-4 py-3 text-left font-medium">Item</th><th className="px-4 py-3 text-left font-medium">Variant</th><th className="px-4 py-3 text-left font-medium">SKU</th><th className="px-4 py-3 text-left font-medium">Qty</th><th className="px-4 py-3 text-left font-medium">Price</th></tr></thead>
                            <tbody>
                              {detail.order.lineItems.map((item) => (
                                <tr key={item.id} className="border-b last:border-0"><td className="px-4 py-3">{item.productTitle}</td><td className="px-4 py-3">{item.variantTitle || "-"}</td><td className="px-4 py-3">{item.sku || "-"}</td><td className="px-4 py-3">{item.quantity}</td><td className="px-4 py-3">{formatAmount(item.price, detail.order.currency)}</td></tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-border/70">
                    <CardHeader className="border-b border-border/50"><CardTitle>Review Capture Form</CardTitle><CardDescription>Fill the call details and save the order review status.</CardDescription></CardHeader>
                    <CardContent className="space-y-5 pt-6">
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2"><label className="text-sm font-medium">Review Status</label><Select value={form.reviewStatus} disabled={!canManage || isBusy} onValueChange={(value) => setForm((current) => ({ ...current, reviewStatus: value as ReviewForm["reviewStatus"] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="reviewed">Reviewed</SelectItem><SelectItem value="follow_up">Follow Up</SelectItem><SelectItem value="no_response">No Response</SelectItem></SelectContent></Select></div>
                        <div className="space-y-2"><label className="text-sm font-medium">Call Made</label><Select value={form.callMade} disabled={!canManage || isBusy} onValueChange={(value) => setForm((current) => ({ ...current, callMade: value as ReviewForm["callMade"] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="no">No</SelectItem><SelectItem value="yes">Yes</SelectItem></SelectContent></Select></div>
                        <div className="space-y-2"><label className="flex items-center gap-2 text-sm font-medium"><CalendarDays className="size-4 text-primary" />Callback Date</label><Input type="date" value={form.callbackDate} disabled={!canManage || isBusy} onChange={(event) => setForm((current) => ({ ...current, callbackDate: event.target.value }))} /></div>
                      </div>
                      <div className="grid gap-5">
                        <div className="grid gap-4 md:grid-cols-3">
                          <div className="space-y-2"><label className="text-sm font-medium">Customer Response Status</label><Select value={form.customerResponseStatus} disabled={!canManage || isBusy} onValueChange={(value) => setForm((current) => ({ ...current, customerResponseStatus: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none">Not selected</SelectItem><SelectItem value="answered">Answered</SelectItem><SelectItem value="no_answer">No Answer</SelectItem><SelectItem value="busy">Busy</SelectItem><SelectItem value="wrong_number">Wrong Number</SelectItem><SelectItem value="callback_requested">Callback Requested</SelectItem><SelectItem value="not_interested">Not Interested</SelectItem></SelectContent></Select></div>
                          <div className="space-y-2"><label className="text-sm font-medium">Customer First Name</label><Input value={form.reviewerFirstName} disabled={!canManage || isBusy} onChange={(event) => setForm((current) => ({ ...current, reviewerFirstName: event.target.value }))} /></div>
                          <div className="space-y-2"><label className="text-sm font-medium">Customer Last Name</label><Input value={form.reviewerLastName} disabled={!canManage || isBusy} onChange={(event) => setForm((current) => ({ ...current, reviewerLastName: event.target.value }))} /></div>
                        </div>
                        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                          <div className="space-y-2"><label className="flex items-center gap-2 text-sm font-medium"><Mail className="size-4 text-primary" />Customer Email</label><Input type="email" value={form.reviewerEmail} disabled={!canManage || isBusy} onChange={(event) => setForm((current) => ({ ...current, reviewerEmail: event.target.value }))} /></div>
                          <div className="space-y-2"><label className="text-sm font-medium">Reason</label><Textarea value={form.reason} disabled={!canManage || isBusy} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Type any reason or notes from the call." className="min-h-24" /></div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-muted-foreground text-sm">{detail.review?.updatedAt ? `Last saved ${formatDateTime(detail.review.updatedAt)}` : "No review saved for this order yet."}</p>
                        <Button onClick={() => void saveReview()} disabled={!canManage || isBusy}>
                          {saving ? (
                            <>
                              <Loader2 className="size-4 animate-spin" aria-hidden />
                              Saving...
                            </>
                          ) : (
                            "Save Review"
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
