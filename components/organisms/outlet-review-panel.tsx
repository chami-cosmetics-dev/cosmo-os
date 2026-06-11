"use client";

import { useState, useMemo } from "react";
import { CalendarIcon, Download, Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { notify } from "@/lib/notify";

type OutletOption = { id: string; name: string };

type ReviewItem = {
  reviewId: string | null;
  orderId: string;
  outletId: string;
  outletName: string;
  merchantName: string | null;
  customerName: string | null;
  customerPhone: string | null;
  erpnextInvoiceId: string | null;
  orderLabel: string;
  orderCreatedAt: string;
  productNames: string[];
  couponCode: string | null;
  reviewRequested: string;
  reviewCollected: string;
};

type InitialData = {
  outlets: OutletOption[];
  reviews: ReviewItem[];
  userOutletIds: string[];
};

type EditState = { reviewRequested: string; reviewCollected: string };

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-LK", { year: "numeric", month: "short", day: "2-digit" });
}

export function OutletReviewPanel({
  initialData,
  canReadAll,
}: {
  initialData: InitialData;
  canReadAll: boolean;
}) {
  const [reviews, setReviews] = useState<ReviewItem[]>(initialData.reviews);
  const [outlets] = useState<OutletOption[]>(initialData.outlets);
  const [selectedOutlet, setSelectedOutlet] = useState<string>("__all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editMap, setEditMap] = useState<Map<string, EditState>>(new Map());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  const filteredReviews = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reviews.filter((r) => {
      if (!q) return true;
      return [
        r.outletName,
        r.merchantName,
        r.customerName,
        r.customerPhone,
        r.erpnextInvoiceId,
        r.orderLabel,
        r.productNames.join(" "),
        r.couponCode,
      ]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q));
    });
  }, [reviews, search]);

  async function applyFilters() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedOutlet !== "__all") params.set("outletId", selectedOutlet);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const res = await fetch(`/api/admin/outlet-reviews/data?${params.toString()}`);
      const data = (await res.json()) as { reviews?: ReviewItem[]; error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to load data");
        return;
      }
      setReviews(data.reviews ?? []);
      setEditMap(new Map());
    } catch {
      notify.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  function startEdit(orderId: string, current: ReviewItem) {
    setEditMap((prev) => {
      const next = new Map(prev);
      next.set(orderId, { reviewRequested: current.reviewRequested, reviewCollected: current.reviewCollected });
      return next;
    });
  }

  function cancelEdit(orderId: string) {
    setEditMap((prev) => {
      const next = new Map(prev);
      next.delete(orderId);
      return next;
    });
  }

  function updateEditField(orderId: string, field: keyof EditState, value: string) {
    setEditMap((prev) => {
      const next = new Map(prev);
      const existing = next.get(orderId);
      if (existing) next.set(orderId, { ...existing, [field]: value });
      return next;
    });
  }

  async function saveReview(review: ReviewItem) {
    const edit = editMap.get(review.orderId);
    if (!edit) return;
    setSavingIds((prev) => new Set(prev).add(review.orderId));
    try {
      const res = await fetch("/api/admin/outlet-reviews/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: review.orderId,
          outletId: review.outletId,
          reviewRequested: edit.reviewRequested,
          reviewCollected: edit.reviewCollected,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to save");
        return;
      }
      setReviews((prev) =>
        prev.map((r) =>
          r.orderId === review.orderId
            ? { ...r, reviewRequested: edit.reviewRequested, reviewCollected: edit.reviewCollected }
            : r
        )
      );
      cancelEdit(review.orderId);
      notify.success("Saved");
    } catch {
      notify.error("Failed to save");
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(review.orderId);
        return next;
      });
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (selectedOutlet !== "__all") params.set("outletId", selectedOutlet);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const res = await fetch(`/api/admin/outlet-reviews/export?${params.toString()}`);
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        notify.error(data.error ?? "Export failed");
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") ?? "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] ?? "outlet-reviews.csv";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      notify.error("Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-5 shadow-[0_18px_40px_-28px_var(--primary)] sm:p-6">
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
          Contacts
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Outlet Reviews</h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
          Track customer review requests and collections per outlet.
        </p>
      </section>

      {/* Filters */}
      <Card className="border-border/70 shadow-xs">
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-3">
            {canReadAll && (
              <div className="min-w-[180px]">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Outlet</label>
                <Select value={selectedOutlet} onValueChange={setSelectedOutlet}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">All Outlets</SelectItem>
                    {outlets.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {!canReadAll && outlets.length > 1 && (
              <div className="min-w-[180px]">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Outlet</label>
                <Select value={selectedOutlet} onValueChange={setSelectedOutlet}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">All My Outlets</SelectItem>
                    {outlets.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">From Date</label>
              <div className="relative">
                <CalendarIcon className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">To Date</label>
              <div className="relative">
                <CalendarIcon className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <Button onClick={applyFilters} disabled={loading}>
              {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
              Apply
            </Button>
            <div className="ml-auto flex items-end gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 w-52"
                />
              </div>
              <Button variant="outline" onClick={handleExport} disabled={exporting}>
                {exporting ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Download className="mr-2 size-4" />
                )}
                Export
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50 pb-3">
          <CardTitle className="text-sm font-medium">
            {filteredReviews.length} order{filteredReviews.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Outlet</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Order No</TableHead>
                  <TableHead className="w-[240px] max-w-[240px]">Products</TableHead>
                  <TableHead>Mobile</TableHead>
                  <TableHead className="min-w-[160px]">Review Requested</TableHead>
                  <TableHead className="min-w-[160px]">Review Collected</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReviews.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="py-8 text-center text-muted-foreground text-sm">
                      No orders found.
                    </TableCell>
                  </TableRow>
                )}
                {filteredReviews.map((review) => {
                  const editing = editMap.get(review.orderId);
                  const saving = savingIds.has(review.orderId);
                  return (
                    <TableRow key={review.orderId}>
                      <TableCell className="font-medium">{review.outletName}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{formatDate(review.orderCreatedAt)}</TableCell>
                      <TableCell>{review.merchantName ?? "—"}</TableCell>
                      <TableCell>{review.customerName ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {review.erpnextInvoiceId ?? review.orderLabel}
                      </TableCell>
                      <TableCell className="w-[240px] max-w-[240px] text-xs">
                        <div className="max-w-[240px] truncate" title={review.productNames.join(", ")}>
                          {review.productNames.length > 0
                            ? review.productNames.slice(0, 2).join(", ") +
                              (review.productNames.length > 2 ? ` +${review.productNames.length - 2}` : "")
                            : "—"}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{review.customerPhone ?? "—"}</TableCell>
                      <TableCell>
                        {editing ? (
                          <Input
                            value={editing.reviewRequested}
                            onChange={(e) => updateEditField(review.orderId, "reviewRequested", e.target.value)}
                            className="h-8 text-xs"
                            placeholder="Review requested..."
                          />
                        ) : (
                          <span className="text-sm">{review.reviewRequested || "—"}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editing ? (
                          <Input
                            value={editing.reviewCollected}
                            onChange={(e) => updateEditField(review.orderId, "reviewCollected", e.target.value)}
                            className="h-8 text-xs"
                            placeholder="Review collected..."
                          />
                        ) : (
                          <span className="text-sm">{review.reviewCollected || "—"}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editing ? (
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => saveReview(review)}
                              disabled={saving}
                            >
                              {saving && <Loader2 className="mr-1 size-3 animate-spin" />}
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => cancelEdit(review.orderId)}
                              disabled={saving}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => startEdit(review.orderId, review)}
                          >
                            Edit
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
