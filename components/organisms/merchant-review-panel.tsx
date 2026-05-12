"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Mail, MessageSquare, Phone, Search, ShoppingBag, Star, UserRoundCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notify";

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
  reviewStatus: "pending" | "reviewed" | "follow_up" | "no_response";
  customerRating: number | null;
  reviewMarkedAt: string | null;
};

type MerchantReviewPanelInitialData = {
  orders: QueueItem[];
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
    customerRating: number | null;
    customerFeedback: string | null;
    itemFeedback: string | null;
    merchantNotes: string | null;
    followUpNeeded: boolean;
    reviewMarkedAt: string | null;
    updatedAt: string;
  } | null;
};

type ReviewForm = {
  reviewStatus: "pending" | "reviewed" | "follow_up" | "no_response";
  customerRating: string;
  customerFeedback: string;
  itemFeedback: string;
  merchantNotes: string;
  followUpNeeded: "yes" | "no";
};

function formatDateTime(value?: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString("en-LK");
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
    customerRating: review?.customerRating != null ? String(review.customerRating) : "__none",
    customerFeedback: review?.customerFeedback ?? "",
    itemFeedback: review?.itemFeedback ?? "",
    merchantNotes: review?.merchantNotes ?? "",
    followUpNeeded: review?.followUpNeeded ? "yes" : "no",
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
  const [statusFilter, setStatusFilter] = useState<"__all" | QueueItem["reviewStatus"]>("__all");
  const [selectedOrderId, setSelectedOrderId] = useState(initialData.orders[0]?.orderId ?? "");
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [form, setForm] = useState<ReviewForm>(buildInitialForm(null));

  const counts = useMemo(
    () =>
      queueOrders.reduce(
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
    [queueOrders]
  );

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return queueOrders.filter((order) => {
      if (statusFilter !== "__all" && order.reviewStatus !== statusFilter) return false;
      if (!query) return true;
      return [
        order.orderLabel,
        order.orderNumber,
        order.customerName,
        order.customerEmail,
        order.customerPhone,
        order.assignedMerchant?.name,
        order.assignedMerchant?.email,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query));
    });
  }, [queueOrders, search, statusFilter]);

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
    if (!detail) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/merchant-reviews/orders/${detail.order.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewStatus: form.reviewStatus,
          customerRating: form.customerRating === "__none" ? null : Number(form.customerRating),
          customerFeedback: form.customerFeedback.trim() || null,
          itemFeedback: form.itemFeedback.trim() || null,
          merchantNotes: form.merchantNotes.trim() || null,
          followUpNeeded: form.followUpNeeded === "yes",
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
                customerRating: data.review?.customerRating ?? item.customerRating,
                reviewMarkedAt: data.review?.reviewMarkedAt ?? item.reviewMarkedAt,
              }
            : item
        )
      );
      setDetail((current) => (current ? { ...current, review: data.review ?? null } : current));
      notify.success("Merchant review saved");
    } catch {
      notify.error("Failed to save merchant review");
    } finally {
      setSaving(false);
    }
  }

  function exportReviews() {
    const exportStatus = statusFilter === "__all" ? "reviewed" : statusFilter;
    const params = new URLSearchParams({ status: exportStatus });
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
                  ? "Review assigned customer orders across merchants, capture customer feedback, and update review status."
                  : "Review your assigned customer orders, capture customer feedback, and mark the order review status."}
              </CardDescription>
            </div>
            <Button type="button" variant="outline" onClick={exportReviews}>
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
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order, customer, email, phone..." className="pl-9" />
                </div>
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">All statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="reviewed">Reviewed</SelectItem>
                    <SelectItem value="follow_up">Follow Up</SelectItem>
                    <SelectItem value="no_response">No Response</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="overflow-hidden rounded-xl border border-border/70">
                <div className="border-b bg-muted/20 px-4 py-3">
                  <p className="text-sm font-medium">Assigned Review Queue</p>
                  <p className="text-muted-foreground text-sm">{filteredOrders.length} order(s)</p>
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
                        <div className="rounded-xl border border-border/70 bg-background/70 p-4"><div className="mb-2 flex items-center gap-2 text-sm font-medium"><UserRoundCheck className="size-4 text-primary" />Customer</div><p className="font-medium">{selectedQueueItem.customerName || "Unknown customer"}</p><p className="text-muted-foreground text-sm">{detail.order.customerEmail || "No email"}</p></div>
                        <div className="rounded-xl border border-border/70 bg-background/70 p-4"><div className="mb-2 flex items-center gap-2 text-sm font-medium"><Phone className="size-4 text-primary" />Contact Number</div><p className="font-medium">{detail.order.customerPhone || "No phone"}</p><p className="text-muted-foreground text-sm">{extractShippingAddress(detail.order.shippingAddress) || "No shipping address"}</p></div>
                        <div className="rounded-xl border border-border/70 bg-background/70 p-4"><div className="mb-2 flex items-center gap-2 text-sm font-medium"><ShoppingBag className="size-4 text-primary" />Order Value</div><p className="font-medium">{formatAmount(detail.order.totalPrice, detail.order.currency)}</p><p className="text-muted-foreground text-sm">{detail.order.sourceName}</p></div>
                        <div className="rounded-xl border border-border/70 bg-background/70 p-4"><div className="mb-2 flex items-center gap-2 text-sm font-medium"><Mail className="size-4 text-primary" />Merchant</div><p className="font-medium">{detail.order.assignedMerchant?.name ?? detail.order.assignedMerchant?.email ?? "Unassigned"}</p><p className="text-muted-foreground text-sm">{detail.review?.reviewMarkedAt ? `Reviewed on ${formatDateTime(detail.review.reviewMarkedAt)}` : "Not marked reviewed yet"}</p></div>
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
                    <CardHeader className="border-b border-border/50"><CardTitle>Review Capture Form</CardTitle><CardDescription>Fill the customer review details after the merchant call and save the order review status.</CardDescription></CardHeader>
                    <CardContent className="space-y-5 pt-6">
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2"><label className="text-sm font-medium">Review Status</label><Select value={form.reviewStatus} onValueChange={(value) => setForm((current) => ({ ...current, reviewStatus: value as ReviewForm["reviewStatus"] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="reviewed">Reviewed</SelectItem><SelectItem value="follow_up">Follow Up</SelectItem><SelectItem value="no_response">No Response</SelectItem></SelectContent></Select></div>
                        <div className="space-y-2"><label className="text-sm font-medium">Customer Rating</label><Select value={form.customerRating} onValueChange={(value) => setForm((current) => ({ ...current, customerRating: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none">Not given</SelectItem><SelectItem value="1">1 Star</SelectItem><SelectItem value="2">2 Stars</SelectItem><SelectItem value="3">3 Stars</SelectItem><SelectItem value="4">4 Stars</SelectItem><SelectItem value="5">5 Stars</SelectItem></SelectContent></Select></div>
                        <div className="space-y-2"><label className="text-sm font-medium">Follow Up Needed</label><Select value={form.followUpNeeded} onValueChange={(value) => setForm((current) => ({ ...current, followUpNeeded: value as ReviewForm["followUpNeeded"] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="no">No</SelectItem><SelectItem value="yes">Yes</SelectItem></SelectContent></Select></div>
                      </div>
                      <div className="grid gap-5">
                        <div className="space-y-2"><label className="flex items-center gap-2 text-sm font-medium"><MessageSquare className="size-4 text-primary" />Customer Feedback</label><Textarea value={form.customerFeedback} onChange={(event) => setForm((current) => ({ ...current, customerFeedback: event.target.value }))} placeholder="What did the customer say about the order, service, or overall experience?" className="min-h-28" /></div>
                        <div className="space-y-2"><label className="flex items-center gap-2 text-sm font-medium"><ShoppingBag className="size-4 text-primary" />Item Feedback</label><Textarea value={form.itemFeedback} onChange={(event) => setForm((current) => ({ ...current, itemFeedback: event.target.value }))} placeholder="Mention which items the customer liked, disliked, or asked about." className="min-h-24" /></div>
                        <div className="space-y-2"><label className="flex items-center gap-2 text-sm font-medium"><Star className="size-4 text-primary" />Merchant Notes</label><Textarea value={form.merchantNotes} onChange={(event) => setForm((current) => ({ ...current, merchantNotes: event.target.value }))} placeholder="Internal notes for the team, next steps, promises made, or callback reminders." className="min-h-24" /></div>
                      </div>
                      <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-muted-foreground text-sm">{detail.review?.updatedAt ? `Last saved ${formatDateTime(detail.review.updatedAt)}` : "No review saved for this order yet."}</p>
                        <Button onClick={() => void saveReview()} disabled={saving}>{saving ? "Saving..." : "Save Review"}</Button>
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
