"use client";

import { useState, useEffect } from "react";
import {
  Check,
  Loader2,
  MessageSquare,
  Package,
  Printer,
  Send,
  Truck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";

const STAGES = [
  "order_received",
  "sample_free_issue",
  "print",
  "ready_to_dispatch",
  "dispatched",
  "invoice_complete",
  "delivery_complete",
] as const;

const STAGE_LABELS: Record<string, string> = {
  order_received: "Order Received",
  sample_free_issue: "Sample/Free Issue",
  print: "Print",
  ready_to_dispatch: "Ready to Dispatch",
  dispatched: "Dispatched",
  invoice_complete: "Invoice Complete",
  delivery_complete: "Delivery Complete",
};

type FulfillmentStage = (typeof STAGES)[number];

type OrderDetail = {
  id: string;
  shopifyOrderId: string;
  orderNumber: string | null;
  name: string | null;
  sourceName: string;
  totalPrice: string;
  subtotalPrice: string | null;
  totalDiscounts: string | null;
  totalTax: string | null;
  totalShipping: string | null;
  currency: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  shippingAddress: unknown;
  billingAddress: unknown;
  discountCodes: unknown;
  createdAt: string;
  companyLocation: { id: string; name: string } | null;
  assignedMerchant: { id: string; name: string | null; email: string | null } | null;
  lineItems: Array<{
    id: string;
    productTitle: string;
    variantTitle: string | null;
    sku: string | null;
    quantity: number;
    price: string;
    total: string;
  }>;
  shopifyAdminOrderUrl: string | null;
  fulfillmentStage?: FulfillmentStage;
  printCount?: number;
  packageReadyAt?: string | null;
  packageOnHoldAt?: string | null;
  packageHoldReason?: { id: string; name: string } | null;
  dispatchedAt?: string | null;
  dispatchedByRider?: { id: string; name: string | null; mobile: string | null } | null;
  dispatchedByCourierService?: { id: string; name: string } | null;
  invoiceCompleteAt?: string | null;
  deliveryCompleteAt?: string | null;
  sampleFreeIssues?: Array<{
    id: string;
    sampleFreeIssueItem: { id: string; name: string; type: string };
    quantity: number;
  }>;
  remarks?: Array<{
    id: string;
    stage: string;
    type: string;
    content: string;
    createdAt: string;
  }>;
};

type FulfillmentLookups = {
  samplesFreeIssues: Array<{ id: string; name: string; type: string }>;
  packageHoldReasons: Array<{ id: string; name: string }>;
  courierServices: Array<{ id: string; name: string }>;
  riders: Array<{ id: string; name: string | null; mobile: string | null }>;
};

interface OrderFulfillmentDetailProps {
  orderId: string | null;
  orderDetail: OrderDetail | null;
  loading: boolean;
  onClose: () => void;
  onRefresh: () => void;
  formatPrice: (val: string, currency?: string | null) => string;
  formatDate: (val: string) => string;
  formatAddress: (addr: unknown) => string;
  getCustomerName: (addr: unknown) => string | null;
  getAddressPhone: (addr: unknown) => string | null;
  addressesEqual: (ship: unknown, bill: unknown) => boolean;
}

export function OrderFulfillmentDetail({
  orderId,
  orderDetail,
  loading,
  onClose,
  onRefresh,
  formatPrice,
  formatDate,
  formatAddress,
  getCustomerName,
  getAddressPhone,
  addressesEqual,
}: OrderFulfillmentDetailProps) {
  const [lookups, setLookups] = useState<FulfillmentLookups | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [selectedSamples, setSelectedSamples] = useState<Array<{ id: string; qty: number }>>([]);
  const [holdReasonId, setHoldReasonId] = useState("");
  const [dispatchRiderId, setDispatchRiderId] = useState("");
  const [dispatchCourierId, setDispatchCourierId] = useState("");
  const [remarkContent, setRemarkContent] = useState("");
  const [remarkType, setRemarkType] = useState<"internal" | "external">("internal");
  const [remarkStage, setRemarkStage] = useState<FulfillmentStage>("order_received");

  const isBusy = busyKey !== null;
  const stage = (orderDetail?.fulfillmentStage ?? "order_received") as FulfillmentStage;
  const isPos = orderDetail?.sourceName === "pos";
  const isComplete = stage === "delivery_complete";

  useEffect(() => {
    if (!orderId) return;
    fetch("/api/admin/orders/fulfillment-lookups")
      .then((r) => r.json())
      .then((data) => setLookups(data))
      .catch(() => setLookups(null));
  }, [orderId]);

  async function doFulfillmentAction(
    action: string,
    body?: Record<string, unknown>
  ) {
    if (!orderId) return;
    setBusyKey(action);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/fulfillment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? { action }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Action failed");
        return;
      }
      notify.success("Updated.");
      onRefresh();
    } catch {
      notify.error("Action failed");
    } finally {
      setBusyKey(null);
    }
  }

  async function addRemark() {
    if (!orderId || !remarkContent.trim()) return;
    setBusyKey("remark");
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/remarks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: remarkStage,
          type: remarkType,
          content: remarkContent.trim(),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to add remark");
        return;
      }
      notify.success("Remark added.");
      setRemarkContent("");
      onRefresh();
    } catch {
      notify.error("Failed to add remark");
    } finally {
      setBusyKey(null);
    }
  }

  function handlePrint() {
    if (!orderId) return;
    window.open(`/api/admin/orders/${orderId}/invoice?print=1`, "_blank", "noopener");
  }

  if (!orderDetail && !loading) return null;

  return (
    <Dialog open={!!orderId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Order {orderDetail?.name ?? orderDetail?.orderNumber ?? orderDetail?.shopifyOrderId ?? "Details"}
          </DialogTitle>
          <DialogDescription>
            {orderDetail && formatDate(orderDetail.createdAt)}
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : orderDetail ? (
          <div className="space-y-6">
            {orderDetail.shopifyAdminOrderUrl && (
              <a
                href={orderDetail.shopifyAdminOrderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <Send className="size-4" />
                Open in Shopify Admin
              </a>
            )}

            {/* Stage stepper */}
            <div className="flex flex-wrap gap-1">
              {STAGES.map((s, i) => {
                const idx = STAGES.indexOf(stage);
                const done = i <= idx;
                return (
                  <span
                    key={s}
                    className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs ${
                      done ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {done && <Check className="size-3" />}
                    {STAGE_LABELS[s]}
                  </span>
                );
              })}
            </div>

            {/* POS Complete */}
            {isPos && !isComplete && (
              <div className="rounded-lg border border-dashed p-4">
                <p className="mb-2 text-sm font-medium">POS Order</p>
                <p className="text-muted-foreground mb-3 text-xs">
                  Complete all fulfillment stages at once for in-store orders.
                </p>
                <Button
                  onClick={() => doFulfillmentAction("complete_pos")}
                  disabled={isBusy}
                >
                  {busyKey === "complete_pos" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  Complete POS Order
                </Button>
              </div>
            )}

            {/* Sample/Free Issue */}
            {!isPos && (stage === "order_received" || stage === "sample_free_issue") && lookups && (
              <div className="rounded-lg border p-4">
                <h4 className="mb-2 text-sm font-medium">Sample / Free Issue</h4>
                {orderDetail.sampleFreeIssues && orderDetail.sampleFreeIssues.length > 0 && (
                  <ul className="mb-3 text-sm">
                    {orderDetail.sampleFreeIssues.map((s) => (
                      <li key={s.id}>
                        {s.sampleFreeIssueItem.name} × {s.quantity}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap gap-2">
                  <select
                    className="h-9 w-[200px] rounded-md border border-input bg-background px-3 text-sm"
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v && !selectedSamples.some((x) => x.id === v)) {
                        setSelectedSamples((prev) => [...prev, { id: v, qty: 1 }]);
                      }
                      e.target.value = "";
                    }}
                  >
                    <option value="">Add item</option>
                    {lookups.samplesFreeIssues.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.type})
                      </option>
                    ))}
                  </select>
                  {selectedSamples.map((s) => (
                    <div key={s.id} className="flex items-center gap-1">
                      <span className="text-sm">
                        {lookups.samplesFreeIssues.find((x) => x.id === s.id)?.name} ×
                      </span>
                      <Input
                        type="number"
                        min={1}
                        max={99}
                        value={s.qty}
                        onChange={(e) =>
                          setSelectedSamples((prev) =>
                            prev.map((x) =>
                              x.id === s.id ? { ...x, qty: parseInt(e.target.value, 10) || 1 } : x
                            )
                          )
                        }
                        className="w-14"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setSelectedSamples((prev) => prev.filter((x) => x.id !== s.id))
                        }
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                  {selectedSamples.length > 0 && (
                    <Button
                      onClick={() =>
                        doFulfillmentAction("add_samples", {
                          action: "add_samples",
                          samples: selectedSamples.map((s) => ({
                            sampleFreeIssueItemId: s.id,
                            quantity: s.qty,
                          })),
                        })
                      }
                      disabled={isBusy}
                    >
                      {busyKey === "add_samples" ? <Loader2 className="size-4 animate-spin" /> : "Add"}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => doFulfillmentAction("advance_to_print")}
                    disabled={isBusy}
                  >
                    {busyKey === "advance_to_print" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      "Skip to Print"
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Print */}
            {!isPos && (stage === "print" || stage === "sample_free_issue") && (
              <div className="rounded-lg border p-4">
                <h4 className="mb-2 text-sm font-medium">Print Invoice</h4>
                <Button onClick={handlePrint} variant="outline">
                  <Printer className="size-4" />
                  Print Invoice
                </Button>
                {stage === "sample_free_issue" && (
                  <Button
                    className="ml-2"
                    onClick={() => doFulfillmentAction("advance_to_print")}
                    disabled={isBusy}
                  >
                    Advance to Print
                  </Button>
                )}
              </div>
            )}

            {/* Ready to Dispatch - hide when package already marked ready */}
            {!isPos && (stage === "print" || stage === "ready_to_dispatch") && !orderDetail.packageReadyAt && (
              <div className="rounded-lg border p-4">
                <h4 className="mb-2 text-sm font-medium">Ready to Dispatch</h4>
                {orderDetail.packageOnHoldAt && orderDetail.packageHoldReason ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-muted-foreground text-sm">
                      On hold: {orderDetail.packageHoldReason.name}
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => doFulfillmentAction("revert_hold", { action: "revert_hold" })}
                      disabled={isBusy}
                    >
                      {busyKey === "revert_hold" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        "Revert Hold"
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    {lookups && (
                      <>
                        <select
                          value={holdReasonId}
                          onChange={(e) => setHoldReasonId(e.target.value)}
                          className="h-9 w-[200px] rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="">Put on hold...</option>
                          {lookups.packageHoldReasons.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                        <Button
                          variant="outline"
                          onClick={() =>
                            doFulfillmentAction("put_on_hold", {
                              action: "put_on_hold",
                              holdReasonId,
                            })
                          }
                          disabled={isBusy || !holdReasonId}
                        >
                          Put on Hold
                        </Button>
                      </>
                    )}
                    <Button
                      onClick={() => doFulfillmentAction("mark_ready")}
                      disabled={isBusy}
                    >
                      {busyKey === "mark_ready" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        "Package is Ready"
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Dispatch */}
            {!isPos && stage === "ready_to_dispatch" && !orderDetail.packageReadyAt && (
              <div className="rounded-lg border p-4">
                <h4 className="mb-2 text-sm font-medium">Dispatch</h4>
                <p className="text-muted-foreground text-sm">
                  To dispatch you need to mark the package readiness.
                </p>
              </div>
            )}
            {!isPos && stage === "ready_to_dispatch" && orderDetail.packageReadyAt && lookups && (
              <div className="rounded-lg border p-4">
                <h4 className="mb-2 text-sm font-medium">Dispatch</h4>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={dispatchRiderId}
                    onChange={(e) => { setDispatchRiderId(e.target.value); setDispatchCourierId(""); }}
                    className="h-9 w-[180px] rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Select rider</option>
                    {lookups.riders.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name ?? r.mobile ?? r.id}
                      </option>
                    ))}
                  </select>
                  <select
                    value={dispatchCourierId}
                    onChange={(e) => { setDispatchCourierId(e.target.value); setDispatchRiderId(""); }}
                    className="h-9 w-[180px] rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Or courier</option>
                    {lookups.courierServices.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    onClick={() =>
                      doFulfillmentAction("dispatch", {
                        action: "dispatch",
                        riderId: dispatchRiderId || undefined,
                        courierServiceId: dispatchCourierId || undefined,
                      })
                    }
                    disabled={isBusy || (!dispatchRiderId && !dispatchCourierId)}
                  >
                    {busyKey === "dispatch" ? <Loader2 className="size-4 animate-spin" /> : <Truck className="size-4" />}
                    Dispatch
                  </Button>
                </div>
              </div>
            )}

            {/* Delivery Complete (1st: after dispatched) */}
            {!isPos && (stage === "dispatched" || stage === "delivery_complete") && (
              <div className="rounded-lg border p-4">
                <h4 className="mb-2 text-sm font-medium">Delivery Complete</h4>
                {orderDetail.deliveryCompleteAt ? (
                  <p className="text-muted-foreground text-sm">
                    Delivered {formatDate(orderDetail.deliveryCompleteAt)}
                  </p>
                ) : (
                  <Button
                    onClick={() => doFulfillmentAction("mark_delivered")}
                    disabled={isBusy}
                  >
                    {busyKey === "mark_delivered" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                    Mark Delivered
                  </Button>
                )}
              </div>
            )}

            {/* Invoice Complete (2nd: after delivery) */}
            {!isPos && (stage === "delivery_complete" || stage === "invoice_complete") && (
              <div className="rounded-lg border p-4">
                <h4 className="mb-2 text-sm font-medium">Invoice Complete</h4>
                {orderDetail.invoiceCompleteAt ? (
                  <p className="text-muted-foreground text-sm">
                    Completed {formatDate(orderDetail.invoiceCompleteAt)}
                  </p>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => doFulfillmentAction("mark_invoice_complete")}
                    disabled={isBusy}
                  >
                    Mark Invoice Complete
                  </Button>
                )}
              </div>
            )}

            {/* Remarks */}
            <div className="rounded-lg border p-4">
              <h4 className="mb-2 text-sm font-medium flex items-center gap-2">
                <MessageSquare className="size-4" />
                Remarks
              </h4>
              {orderDetail.remarks && orderDetail.remarks.length > 0 && (
                <ul className="mb-3 space-y-1 text-sm">
                  {orderDetail.remarks.map((r) => (
                    <li key={r.id} className="flex gap-2">
                      <span className="text-muted-foreground text-xs">
                        [{STAGE_LABELS[r.stage] ?? r.stage}] {r.type}:
                      </span>
                      {r.content}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                <select
                  value={remarkStage}
                  onChange={(e) => setRemarkStage(e.target.value as FulfillmentStage)}
                  className="h-9 w-[160px] rounded-md border border-input bg-background px-3 text-sm"
                >
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {STAGE_LABELS[s]}
                    </option>
                  ))}
                </select>
                <select
                  value={remarkType}
                  onChange={(e) => setRemarkType(e.target.value as "internal" | "external")}
                  className="h-9 w-[120px] rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="internal">Internal</option>
                  <option value="external">External</option>
                </select>
                <Input
                  placeholder="Remark..."
                  value={remarkContent}
                  onChange={(e) => setRemarkContent(e.target.value)}
                  className="flex-1 min-w-[120px]"
                  maxLength={2000}
                />
                <Button
                  size="sm"
                  onClick={addRemark}
                  disabled={isBusy || !remarkContent.trim()}
                >
                  {busyKey === "remark" ? <Loader2 className="size-4 animate-spin" /> : "Add"}
                </Button>
              </div>
            </div>

            {/* Order details (collapsed view) */}
            <details className="rounded-lg border">
              <summary className="cursor-pointer p-4 font-medium">Order Details</summary>
              <div className="space-y-4 border-t p-4">
                <div className="grid gap-4 sm:grid-cols-2 text-sm">
                  <div>
                    <h4 className="mb-1 text-muted-foreground">Source</h4>
                    <span className={isPos ? "text-blue-600" : "text-green-600"}>{orderDetail.sourceName}</span>
                  </div>
                  <div>
                    <h4 className="mb-1 text-muted-foreground">Location</h4>
                    <p>{orderDetail.companyLocation?.name ?? "—"}</p>
                  </div>
                  <div>
                    <h4 className="mb-1 text-muted-foreground">Customer</h4>
                    <p>
                      {getCustomerName(orderDetail.shippingAddress) ?? getCustomerName(orderDetail.billingAddress) ?? "—"}
                    </p>
                    {orderDetail.customerEmail && <p>{orderDetail.customerEmail}</p>}
                    {(orderDetail.customerPhone ?? getAddressPhone(orderDetail.shippingAddress)) && (
                      <p>{orderDetail.customerPhone ?? getAddressPhone(orderDetail.shippingAddress)}</p>
                    )}
                  </div>
                  <div>
                    <h4 className="mb-1 text-muted-foreground">Shipping</h4>
                    <p>{formatAddress(orderDetail.shippingAddress)}</p>
                  </div>
                </div>
                <div>
                  <h4 className="mb-2 text-sm font-medium">Line Items</h4>
                  <div className="rounded border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="px-3 py-2 text-left">Product</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-right">Price</th>
                          <th className="px-3 py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderDetail.lineItems.map((li) => (
                          <tr key={li.id} className="border-b last:border-0">
                            <td className="px-3 py-2">{li.productTitle}</td>
                            <td className="px-3 py-2 text-right">{li.quantity}</td>
                            <td className="px-3 py-2 text-right">{formatPrice(li.price, orderDetail.currency)}</td>
                            <td className="px-3 py-2 text-right">{formatPrice(li.total, orderDetail.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-right font-medium">
                    Total: {formatPrice(orderDetail.totalPrice, orderDetail.currency)}
                  </p>
                </div>
              </div>
            </details>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
