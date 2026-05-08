"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare, Pencil, Trash2 } from "lucide-react";

import { useFulfillmentPermissions } from "@/components/contexts/fulfillment-permissions-context";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LIMITS } from "@/lib/validation";
import { notify } from "@/lib/notify";

type OrderDetail = {
  id: string;
  orderNumber: string | null;
  name: string | null;
  totalPrice: string;
  subtotalPrice: string | null;
  totalDiscounts: string | null;
  totalTax: string | null;
  totalShipping: string | null;
  currency: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  shippingAddress: unknown;
  lineItems: Array<{
    id: string;
    productTitle: string;
    variantTitle: string | null;
    sku: string | null;
    quantity: number;
    price: string;
    total: string;
  }>;
  sampleFreeIssues?: Array<{
    id: string;
    sampleFreeIssueItem: { id: string; name: string; type: string };
    quantity: number;
  }>;
  remarks?: Array<{
    id: string;
    content: string;
    createdAt: string;
    stage: string;
    type: string;
    showOnInvoice?: boolean;
    addedBy: { id: string; name: string | null; email: string | null } | null;
  }>;
};

interface FulfillmentOrderInvoiceDetailsProps {
  orderId: string | null;
  refreshTrigger?: number;
  currentStage?: string;
}

function formatPrice(val: string, currency?: string | null): string {
  const n = parseFloat(val);
  if (Number.isNaN(n)) return val;
  return n.toLocaleString("en-LK", { minimumFractionDigits: 2 }) + (currency ? ` ${currency}` : "");
}

function formatAddress(addr: unknown): string {
  if (!addr || typeof addr !== "object") return "—";
  const a = addr as Record<string, unknown>;
  const parts = [
    a.address1,
    a.address2,
    [a.city, a.province_code].filter(Boolean).join(", "),
    a.country,
    a.zip,
  ].filter(Boolean) as string[];
  return parts.join(", ") || "—";
}

function formatRemarkDate(val: string): string {
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-LK");
}

function remarkAddedBy(addedBy: { name: string | null; email: string | null } | null): string {
  if (!addedBy) return "—";
  return addedBy.name ?? addedBy.email ?? "—";
}

export function FulfillmentOrderInvoiceDetails({
  orderId,
  refreshTrigger = 0,
  currentStage,
}: FulfillmentOrderInvoiceDetailsProps) {
  const perms = useFulfillmentPermissions();
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [remarkRefresh, setRemarkRefresh] = useState(0);
  const [addRemarkOpen, setAddRemarkOpen] = useState(false);
  const [remarkContent, setRemarkContent] = useState("");
  const [remarkShowOnInvoice, setRemarkShowOnInvoice] = useState(false);
  const [addRemarkBusy, setAddRemarkBusy] = useState(false);
  const [editingRemarkId, setEditingRemarkId] = useState<string | null>(null);
  const [deleteRemarkId, setDeleteRemarkId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const prevOrderIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setDetail(null);
      setLoading(false);
      prevOrderIdRef.current = null;
      return;
    }
    const isSameOrder = prevOrderIdRef.current === orderId;
    prevOrderIdRef.current = orderId;
    if (!isSameOrder) {
      setDetail(null);
      setLoading(true);
    }
    fetch(`/api/admin/orders/${orderId}`)
      .then((r) => r.json())
      .then((data) => setDetail(data))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [orderId, refreshTrigger, remarkRefresh]);

  if (!orderId) return null;

  if (loading && !detail) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!detail) return null;

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Invoice Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h4 className="mb-1 font-medium text-muted-foreground">Customer</h4>
            <p>{detail.customerEmail ?? detail.customerPhone ?? "—"}</p>
            {detail.customerPhone && detail.customerEmail && (
              <p className="text-muted-foreground">{detail.customerPhone}</p>
            )}
          </div>
          <div>
            <h4 className="mb-1 font-medium text-muted-foreground">Shipping</h4>
            <p className="line-clamp-2">{formatAddress(detail.shippingAddress)}</p>
          </div>
        </div>
        {detail.sampleFreeIssues && detail.sampleFreeIssues.length > 0 && (
          <div>
            <h4 className="mb-2 font-medium text-muted-foreground">Samples / Free Issues</h4>
            <ul className="rounded border p-3">
              {detail.sampleFreeIssues.map((s) => (
                <li key={s.id} className="flex justify-between py-1">
                  <span>
                    {s.sampleFreeIssueItem.name}
                    <span className="text-muted-foreground"> ({s.sampleFreeIssueItem.type})</span>
                  </span>
                  <span>× {s.quantity}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <h4 className="mb-2 font-medium text-muted-foreground">Line Items</h4>
          <div className="rounded border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium">Product</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                  <th className="px-3 py-2 text-right font-medium">Price</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {detail.lineItems.map((li) => (
                  <tr key={li.id} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      {li.productTitle}
                      {li.variantTitle && (
                        <span className="text-muted-foreground"> / {li.variantTitle}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">{li.quantity}</td>
                    <td className="px-3 py-2 text-right">
                      {formatPrice(li.price, detail.currency)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatPrice(li.total, detail.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 space-y-1 text-right">
            {detail.subtotalPrice != null && (
              <p>
                Subtotal: {formatPrice(detail.subtotalPrice, detail.currency)}
              </p>
            )}
            {detail.totalDiscounts != null && parseFloat(detail.totalDiscounts) > 0 && (
              <p>Discounts: -{formatPrice(detail.totalDiscounts, detail.currency)}</p>
            )}
            {detail.totalShipping != null && parseFloat(detail.totalShipping) > 0 && (
              <p>Shipping: {formatPrice(detail.totalShipping, detail.currency)}</p>
            )}
            {detail.totalTax != null && parseFloat(detail.totalTax) > 0 && (
              <p>Tax: {formatPrice(detail.totalTax, detail.currency)}</p>
            )}
            <p className="font-medium">
              Total: {formatPrice(detail.totalPrice, detail.currency)}
            </p>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="font-medium text-muted-foreground">Remarks</h4>
            {currentStage && perms.canManageRemarks && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  setEditingRemarkId(null);
                  setRemarkContent("");
                  setRemarkShowOnInvoice(false);
                  setAddRemarkOpen(true);
                }}
              >
                <MessageSquare className="size-4" aria-hidden />
                Add remark
              </Button>
            )}
          </div>
          {detail.remarks && detail.remarks.length > 0 ? (
            <ul className="space-y-2 rounded border p-3">
              {detail.remarks.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-2 border-b border-dashed pb-2 last:border-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground">{r.content}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Added by {remarkAddedBy(r.addedBy ?? null)} on {formatRemarkDate(r.createdAt ?? "")}
                      {r.showOnInvoice && (
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px]">On invoice</span>
                      )}
                    </p>
                  </div>
                  {perms.canManageRemarks && (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => {
                          setEditingRemarkId(r.id);
                          setRemarkContent(r.content);
                          setRemarkShowOnInvoice(r.showOnInvoice ?? false);
                          setAddRemarkOpen(true);
                        }}
                        aria-label="Edit remark"
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteRemarkId(r.id)}
                        aria-label="Delete remark"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded border border-dashed p-3 text-muted-foreground text-sm">
              No remarks yet. {currentStage ? "Click Add remark to add one." : ""}
            </p>
          )}
        </div>
      </CardContent>
    </Card>

    <Dialog
      open={addRemarkOpen}
      onOpenChange={(open) => {
        setAddRemarkOpen(open);
        if (!open) setEditingRemarkId(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingRemarkId ? "Edit remark" : "Add remark"}</DialogTitle>
          <DialogDescription>
            {editingRemarkId
              ? "Update the remark. Changes will be visible across all fulfillment stages."
              : "Add a comment or note for this order. It will be visible across all fulfillment stages."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="remark-content">
            Remark
          </label>
          <textarea
            id="remark-content"
            value={remarkContent}
            onChange={(e) => setRemarkContent(e.target.value)}
            maxLength={LIMITS.orderRemarkContent.max}
            rows={4}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Enter your remark or comment..."
            disabled={addRemarkBusy}
          />
          <p className="text-muted-foreground text-xs">
            {remarkContent.length} / {LIMITS.orderRemarkContent.max} characters
          </p>
          <div className="flex items-center gap-2 pt-2">
            <input
              id="remark-show-on-invoice"
              type="checkbox"
              checked={remarkShowOnInvoice}
              onChange={(e) => setRemarkShowOnInvoice(e.target.checked)}
              disabled={addRemarkBusy}
              className="size-4 rounded border-input"
            />
            <label htmlFor="remark-show-on-invoice" className="text-sm cursor-pointer">
              Show on invoice print
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setAddRemarkOpen(false)}
            disabled={addRemarkBusy}
          >
            Cancel
          </Button>
          <Button
            onClick={async () => {
              const content = remarkContent.trim();
              if (!content) return;
              if (editingRemarkId) {
                if (!orderId) return;
                setAddRemarkBusy(true);
                try {
                  const res = await fetch(
                    `/api/admin/orders/${orderId}/remarks/${editingRemarkId}`,
                    {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        content,
                        showOnInvoice: remarkShowOnInvoice,
                      }),
                    }
                  );
                  const data = (await res.json()) as { error?: string };
                  if (!res.ok) {
                    notify.error(data.error ?? "Failed to update remark");
                    return;
                  }
                  notify.success("Remark updated.");
                  setAddRemarkOpen(false);
                  setEditingRemarkId(null);
                  setRemarkRefresh((k) => k + 1);
                } catch {
                  notify.error("Failed to update remark");
                } finally {
                  setAddRemarkBusy(false);
                }
              } else {
                if (!orderId || !currentStage) return;
                setAddRemarkBusy(true);
                try {
                  const res = await fetch(`/api/admin/orders/${orderId}/remarks`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      stage: currentStage,
                      type: "internal",
                      content,
                      showOnInvoice: remarkShowOnInvoice,
                    }),
                  });
                  const data = (await res.json()) as { error?: string };
                  if (!res.ok) {
                    notify.error(data.error ?? "Failed to add remark");
                    return;
                  }
                  notify.success("Remark added.");
                  setAddRemarkOpen(false);
                  setRemarkRefresh((k) => k + 1);
                } catch {
                  notify.error("Failed to add remark");
                } finally {
                  setAddRemarkBusy(false);
                }
              }
            }}
            disabled={addRemarkBusy || !remarkContent.trim()}
          >
            {addRemarkBusy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Saving...
              </>
            ) : (
              editingRemarkId ? "Update" : "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={!!deleteRemarkId} onOpenChange={(open) => !open && setDeleteRemarkId(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete remark</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this remark? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={deleteBusy}
            onClick={async () => {
              if (!orderId || !deleteRemarkId) return;
              setDeleteBusy(true);
              try {
                const res = await fetch(
                  `/api/admin/orders/${orderId}/remarks/${deleteRemarkId}`,
                  { method: "DELETE" }
                );
                const data = (await res.json()) as { error?: string };
                if (!res.ok) {
                  notify.error(data.error ?? "Failed to delete remark");
                  return;
                }
                notify.success("Remark deleted.");
                setDeleteRemarkId(null);
                setRemarkRefresh((k) => k + 1);
              } catch {
                notify.error("Failed to delete remark");
              } finally {
                setDeleteBusy(false);
              }
            }}
          >
            {deleteBusy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Deleting...
              </>
            ) : (
              "Delete"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
