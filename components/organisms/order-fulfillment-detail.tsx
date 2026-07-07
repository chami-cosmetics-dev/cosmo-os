"use client";

import { useState, useEffect } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  Loader2,
  MessageSquare,
  Printer,
  Send,
  Truck,
  XCircle,
} from "lucide-react";

import { OrderShippingLine } from "@/components/molecules/order-shipping-line";
import { OrderLineItemPrice } from "@/components/molecules/order-line-item-price";
import { OrderLineItemsTotals } from "@/components/molecules/order-line-items-totals";
import { Button } from "@/components/ui/button";
import { useFulfillmentPermissions } from "@/components/contexts/fulfillment-permissions-context";
import { FulfillmentOrderReference } from "@/components/molecules/fulfillment-order-reference";
import { ErpPaymentModeSelect, ERP_PAYMENT_MODE_ORDER_DEFAULT, resolveErpPaymentModeForApi } from "@/components/molecules/erp-payment-mode-select";
import {
  getOrderDispatchLabel,
  formatDeliveredTimelineWho,
  formatInvoiceCompleteTimelineWho,
  SHOW_INVOICE_COMPLETED_IN_ORDER_DETAILS,
} from "@/lib/order-dispatch";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notify";
import {
  DISPATCH_CUSTOMER_PICKUP,
  dispatchSelectionToApiBody,
  parseDispatchService,
} from "@/lib/order-dispatch";

const STAGES = [
  "order_received",
  "sample_free_issue",
  "print",
  "returned_to_store",
  "ready_to_dispatch",
  "dispatched",
  "invoice_complete",
  "delivery_complete",
] as const;

const STAGE_LABELS: Record<string, string> = {
  order_received: "Order Received",
  sample_free_issue: "Sample/Free Issue",
  print: "Print",
  returned_to_store: "Returned to Store",
  returned: "Returned",
  ready_to_dispatch: "Ready to Dispatch",
  dispatched: "Dispatched",
  invoice_complete: "Invoice Complete",
  delivery_complete: "Delivery Complete",
};

const EXCHANGE_REASON_LABELS: Record<string, string> = {
  damaged_item: "Damaged Item",
  wrong_item: "Wrong Item",
  other: "Other",
};

type FulfillmentStage = (typeof STAGES)[number];

type OrderDetail = {
  id: string;
  shopifyOrderId: string;
  orderNumber: string | null;
  name: string | null;
  erpnextInvoiceId?: string | null;
  sourceName: string;
  totalPrice: string;
  subtotalPrice: string | null;
  subtotalOriginal?: string | null;
  subtotalSale?: string | null;
  discountTotal?: string | null;
  totalDiscounts: string | null;
  totalTax: string | null;
  totalShipping: string | null;
  shippingRuleLabel?: string | null;
  currency: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  deliveryOutcome?: "pending" | "delivered" | "failed" | null;
  deliveryFailedReason?: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  shippingAddress: unknown;
  billingAddress: unknown;
  discountCodes: unknown;
  merchantCouponCode: string | null;
  discountCouponCode?: string | null;
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
    originalPrice?: string | null;
    originalTotal?: string | null;
    lineDiscount?: string | null;
  }>;
  shopifyAdminOrderUrl: string | null;
  erpAdminInvoiceUrl?: string | null;
  fulfillmentStage?: FulfillmentStage;
  printCount?: number;
  packageReadyAt?: string | null;
  packageOnHoldAt?: string | null;
  packageHoldReason?: { id: string; name: string } | null;
  dispatchedAt?: string | null;
  dispatchedBy?: { id: string; name: string | null; email: string | null } | null;
  dispatchedByRider?: { id: string; name: string | null; mobile: string | null } | null;
  dispatchedByCourierService?: { id: string; name: string } | null;
  dispatchedToCustomer?: boolean | null;
  invoiceCompleteAt?: string | null;
  invoiceCompleteBy?: { id: string; name: string | null; email: string | null } | null;
  deliveryCompleteAt?: string | null;
  deliveryCompleteBy?: { id: string; name: string | null; email: string | null } | null;
  deliveryPaymentApproval?: {
    id: string;
    status: string;
    reviewedBy?: { id: string; name: string | null; email: string | null } | null;
  } | null;
  lastRiderUpdateAt?: string | null;
  riderDeliveryTask?: {
    id: string;
    status: string;
    assignedAt: string;
    acceptedAt?: string | null;
    arrivedAt?: string | null;
    completedAt?: string | null;
    failedAt?: string | null;
    failureReason?: string | null;
    latestSyncAt?: string | null;
  } | null;
  deliveryPayment?: {
    id: string;
    expectedAmount: string;
    collectedAmount: string;
    paymentMethod: string;
    collectionStatus: string;
    referenceNote?: string | null;
    bankReference?: string | null;
    cardReference?: string | null;
    collectedAt?: string | null;
    cashHandover?: {
      id: string;
      handoverDate: string;
      status: string;
      totalHandedOverCash: string;
    } | null;
  } | null;
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
    showOnInvoice?: boolean;
    addedBy?: { id: string; name: string | null; email: string | null } | null;
  }>;
  exchanges?: Array<{
    id: string;
    role: "original" | "replacement";
    reason: string;
    status: "pending" | "solved";
    remark: string | null;
    actionDate: string | null;
    createdAt: string;
    originalReference: string;
    replacementReference: string;
    linkedOrderId: string | null;
    linkedOrderName: string | null;
    replacementErpAdminInvoiceUrl: string | null;
  }>;
  cancelledAt?: string | null;
  cancelledBy?: { id: string; name: string | null; email: string | null } | null;
  cancelReason?: string | null;
  hasPendingCancelApproval?: boolean;
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
  addressesEqual: _addressesEqual,
}: OrderFulfillmentDetailProps) {
  void _addressesEqual;
  const perms = useFulfillmentPermissions();
  const [lookups, setLookups] = useState<FulfillmentLookups | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [selectedSamples, setSelectedSamples] = useState<Array<{ id: string; qty: number }>>([]);
  const [holdReasonId, setHoldReasonId] = useState("");
  const [dispatchService, setDispatchService] = useState("");
  const [remarkContent, setRemarkContent] = useState("");
  const [invoiceCompleteMop, setInvoiceCompleteMop] = useState(ERP_PAYMENT_MODE_ORDER_DEFAULT);
  const [remarkType, setRemarkType] = useState<"internal" | "external">("internal");
  const [remarkStage, setRemarkStage] = useState<FulfillmentStage>("order_received");
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelOrderReason, setCancelOrderReason] = useState("");

  const isBusy = busyKey !== null;
  const stage = (orderDetail?.fulfillmentStage ?? "order_received") as FulfillmentStage;
  const isPos = orderDetail?.sourceName === "pos";
  const isErpOrder = orderDetail?.sourceName === "erpnext" || orderDetail?.sourceName === "erpnext-pos";
  const isComplete = stage === "delivery_complete";
  const selectedDispatchService = parseDispatchService(dispatchService);

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

  async function handleCancelOrder() {
    if (!orderId || cancelOrderReason.trim().length < 5) return;
    setBusyKey("cancel_order");
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/fulfillment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel_order", reason: cancelOrderReason.trim() }),
      });
      const data = (await res.json()) as { success?: boolean; requiresApproval?: boolean; error?: string };
      if (!res.ok) { notify.error(data.error ?? "Failed to cancel order"); return; }
      if (data.requiresApproval) {
        notify.success("Cancel request sent to finance for approval — order is now blocked from dispatch.");
      } else {
        notify.success("Order cancelled.");
      }
      setShowCancelDialog(false);
      setCancelOrderReason("");
      onRefresh();
    } catch {
      notify.error("Failed to cancel order");
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
          <DialogTitle className="flex items-baseline gap-2 flex-wrap">
            <span className="flex items-baseline gap-2 flex-wrap">
              Order{" "}
              <FulfillmentOrderReference
                order={orderDetail ?? undefined}
                variant="inline"
                fallback="Details"
              />
            </span>
            {(() => {
              const coupon = Array.isArray(orderDetail?.discountCodes)
                ? ((orderDetail.discountCodes as Array<{ code?: string }>)
                    .map((d) => d?.code?.trim())
                    .filter((c): c is string => !!c && c.toLowerCase() !== "shopify")
                    .join(", ") || null)
                : null;
              if (!coupon) return null;
              return <span className="text-sm font-normal text-muted-foreground">{coupon}</span>;
            })()}
          </DialogTitle>
          <DialogDescription>
            {orderDetail && formatDate(orderDetail.createdAt)}
            {orderDetail?.discountCouponCode
              ? ` · Coupon: ${orderDetail.discountCouponCode}`
              : orderDetail?.merchantCouponCode
                ? ` · Mer coupon: ${orderDetail.merchantCouponCode}`
                : ""}
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
            {orderDetail.erpAdminInvoiceUrl && (
              <a
                href={orderDetail.erpAdminInvoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <Send className="size-4" />
                Open in ERP
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

            {/* Sample/Free Issue — Shopify direct orders only */}
            {!isPos && !isErpOrder && (stage === "order_received" || stage === "sample_free_issue") && lookups && (
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
            {!isPos && !isErpOrder && (stage === "print" || stage === "sample_free_issue") && (
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

            {orderDetail.packageOnHoldAt && orderDetail.packageHoldReason && (stage === "print" || stage === "ready_to_dispatch") && (
              <div className="rounded-lg border p-4">
                <h4 className="mb-2 text-sm font-medium">On Hold</h4>
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
              </div>
            )}

            {/* Dispatch — marks package ready automatically if needed */}
            {!isPos &&
              (stage === "print" || stage === "ready_to_dispatch") &&
              !orderDetail.packageOnHoldAt &&
              lookups && (
              <div className="rounded-lg border p-4">
                <h4 className="mb-2 text-sm font-medium">Dispatch</h4>
                <p className="text-muted-foreground mb-3 text-sm">
                  Marks package ready and dispatches in one step. Use customer pickup when the buyer collects in store.
                </p>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={dispatchService}
                    onChange={(e) => setDispatchService(e.target.value)}
                    className="h-9 w-[240px] rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Select rider, courier, or pickup</option>
                    <option value={DISPATCH_CUSTOMER_PICKUP}>Customer pickup (in-store)</option>
                    {lookups.riders.length > 0 && (
                      <optgroup label="Riders">
                        {lookups.riders.map((r) => (
                          <option key={r.id} value={`rider:${r.id}`}>
                            {r.name ?? r.mobile ?? r.id}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {lookups.courierServices.length > 0 && (
                      <optgroup label="Courier services">
                        {lookups.courierServices.map((c) => (
                          <option key={c.id} value={`courier:${c.id}`}>
                            {c.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <Button
                    onClick={() =>
                      doFulfillmentAction("dispatch", {
                        action: "dispatch",
                        ...dispatchSelectionToApiBody(selectedDispatchService!),
                      })
                    }
                    disabled={isBusy || !selectedDispatchService}
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
                    {formatDeliveredTimelineWho({
                      deliveryCompleteAt: orderDetail.deliveryCompleteAt,
                      deliveryCompleteBy: orderDetail.deliveryCompleteBy,
                      dispatchLabel: getOrderDispatchLabel(orderDetail),
                    })}{" "}
                    · {formatDate(orderDetail.deliveryCompleteAt)}
                  </p>
                ) : (
                  <Button
                    onClick={() => doFulfillmentAction("mark_delivered")}
                    disabled={isBusy || stage !== "dispatched"}
                  >
                    {busyKey === "mark_delivered" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                    Mark Delivered
                  </Button>
                )}
              </div>
            )}

            {/* Invoice Complete (2nd: after finance confirms COD payment) */}
            {SHOW_INVOICE_COMPLETED_IN_ORDER_DETAILS && !isPos && (stage === "delivery_complete" || stage === "invoice_complete") && (
              <div className="rounded-lg border p-4">
                <h4 className="mb-2 text-sm font-medium">Invoice Complete</h4>
                {orderDetail.invoiceCompleteAt ? (
                  <p className="text-muted-foreground text-sm">
                    {formatInvoiceCompleteTimelineWho({
                      invoiceCompleteBy: orderDetail.invoiceCompleteBy,
                      deliveryPaymentApproval: orderDetail.deliveryPaymentApproval,
                    })}{" "}
                    · {formatDate(orderDetail.invoiceCompleteAt)}
                  </p>
                ) : perms.canMarkInvoiceComplete && stage === "delivery_complete" ? (
                  <div className="space-y-3">
                    <ErpPaymentModeSelect
                      value={invoiceCompleteMop}
                      onChange={setInvoiceCompleteMop}
                      disabled={isBusy}
                      allowOrderDefault
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        const mop = resolveErpPaymentModeForApi(invoiceCompleteMop);
                        doFulfillmentAction("mark_invoice_complete", {
                          action: "mark_invoice_complete",
                          ...(mop ? { modeOfPayment: mop } : {}),
                        });
                      }}
                      disabled={isBusy}
                    >
                      Mark Invoice Complete
                    </Button>
                  </div>
                ) : stage === "delivery_complete" ? (
                  <p className="text-sm text-muted-foreground">
                    Awaiting finance invoice complete.
                  </p>
                ) : null}
              </div>
            )}

            {(orderDetail.riderDeliveryTask || orderDetail.deliveryPayment || orderDetail.deliveryOutcome) && (
              <div className="rounded-lg border p-4">
                <h4 className="mb-2 text-sm font-medium">Rider Update</h4>
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-muted-foreground">Delivery outcome</p>
                    <p>{orderDetail.deliveryOutcome ?? "pending"}</p>
                    {orderDetail.deliveryFailedReason && (
                      <p className="text-muted-foreground mt-1">
                        Reason: {orderDetail.deliveryFailedReason}
                      </p>
                    )}
                  </div>
                  {orderDetail.riderDeliveryTask && (
                    <div>
                      <p className="text-muted-foreground">Task status</p>
                      <p>{orderDetail.riderDeliveryTask.status}</p>
                      {orderDetail.riderDeliveryTask.latestSyncAt && (
                        <p className="text-muted-foreground mt-1">
                          Last sync: {formatDate(orderDetail.riderDeliveryTask.latestSyncAt)}
                        </p>
                      )}
                    </div>
                  )}
                  {orderDetail.deliveryPayment && (
                    <div>
                      <p className="text-muted-foreground">Payment</p>
                      <p>
                        {orderDetail.deliveryPayment.paymentMethod} / {orderDetail.deliveryPayment.collectionStatus}
                      </p>
                      <p>
                        {formatPrice(orderDetail.deliveryPayment.collectedAmount, orderDetail.currency)} collected
                      </p>
                      {orderDetail.deliveryPayment.collectedAt && (
                        <p className="text-muted-foreground mt-1">
                          Collected: {formatDate(orderDetail.deliveryPayment.collectedAt)}
                        </p>
                      )}
                    </div>
                  )}
                  {orderDetail.deliveryPayment?.cashHandover && (
                    <div>
                      <p className="text-muted-foreground">Finance handover</p>
                      <p>{orderDetail.deliveryPayment.cashHandover.status}</p>
                      <p>
                        Date: {formatDate(orderDetail.deliveryPayment.cashHandover.handoverDate)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Exchange */}
            {orderDetail.exchanges && orderDetail.exchanges.length > 0 && (
              <div className="rounded-lg border p-4">
                <h4 className="mb-3 text-sm font-medium flex items-center gap-2">
                  <ArrowLeftRight className="size-4" />
                  Exchange
                </h4>
                <ul className="space-y-3">
                  {orderDetail.exchanges.map((ex) => (
                    <li key={ex.id} className="rounded border border-dashed p-3 text-sm space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ex.role === "original" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>
                          {ex.role === "original" ? "Original Order" : "Replacement Order"}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ex.status === "solved" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                          {ex.status === "solved" ? "Solved" : "Pending"}
                        </span>
                      </div>
                      <p className="text-muted-foreground">
                        Reason: <span className="text-foreground">{EXCHANGE_REASON_LABELS[ex.reason] ?? ex.reason}</span>
                      </p>
                      {ex.role === "original" ? (
                        <p className="text-muted-foreground">
                          Replacement:{" "}
                          <span className="text-foreground font-medium">{ex.linkedOrderName ?? ex.replacementReference}</span>
                          {ex.replacementErpAdminInvoiceUrl && (
                            <a
                              href={ex.replacementErpAdminInvoiceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-2 text-xs text-blue-600 underline"
                            >
                              View SI
                            </a>
                          )}
                        </p>
                      ) : (
                        <p className="text-muted-foreground">
                          Original:{" "}
                          <span className="text-foreground font-medium">{ex.linkedOrderName ?? ex.originalReference}</span>
                        </p>
                      )}
                      {ex.remark && (
                        <p className="text-muted-foreground">
                          Note: <span className="text-foreground">{ex.remark}</span>
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {ex.actionDate
                          ? `Resolved ${formatDate(ex.actionDate)}`
                          : `Created ${formatDate(ex.createdAt)}`}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Cancel Order */}
            {orderDetail.financialStatus?.toLowerCase() === "voided" && orderDetail.cancelledAt ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
                <div className="flex items-center gap-2 font-medium text-destructive">
                  <XCircle className="size-4" />
                  Order Cancelled
                </div>
                {orderDetail.cancelledBy && (
                  <p className="mt-1 text-muted-foreground">By {orderDetail.cancelledBy.name ?? orderDetail.cancelledBy.email}</p>
                )}
                {orderDetail.cancelReason && (
                  <p className="mt-1 text-muted-foreground">Reason: {orderDetail.cancelReason}</p>
                )}
              </div>
            ) : orderDetail.hasPendingCancelApproval ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-700/40 dark:bg-amber-900/20">
                <div className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="size-4" />
                  Cancel Pending Finance Approval
                </div>
                <p className="mt-1 text-amber-700 dark:text-amber-400">
                  A cancel request has been sent to finance. This order cannot be dispatched until finance approves or rejects the cancel.
                </p>
              </div>
            ) : perms.canCancelOrder && ["order_received", "sample_free_issue", "print", "ready_to_dispatch"].includes(stage) ? (
              <div className="rounded-lg border border-dashed p-4">
                <h4 className="mb-1 text-sm font-medium">Cancel Order</h4>
                <p className="mb-3 text-xs text-muted-foreground">
                  Paid orders (KOKO, Bank Transfer, CC Checkout) will require finance approval before cancellation is processed.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => { setCancelOrderReason(""); setShowCancelDialog(true); }}
                  disabled={isBusy}
                >
                  <XCircle className="size-4" />
                  Cancel Order
                </Button>
              </div>
            ) : null}

            {/* Remarks */}
            <div className="rounded-lg border p-4">
              <h4 className="mb-2 text-sm font-medium flex items-center gap-2">
                <MessageSquare className="size-4" />
                Remarks
              </h4>
              {orderDetail.remarks && orderDetail.remarks.length > 0 && (
                <ul className="mb-3 space-y-2 text-sm">
                  {orderDetail.remarks.map((r) => (
                    <li key={r.id} className="rounded border border-dashed p-2">
                      <p className="text-foreground">{r.content}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        <span className="font-medium">
                          [{STAGE_LABELS[r.stage] ?? r.stage}] {r.type}
                        </span>
                        {" • "}
                        Added by {r.addedBy ? (r.addedBy.name ?? r.addedBy.email ?? "—") : "—"} on {formatDate(r.createdAt)}
                        {r.showOnInvoice && (
                          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px]">On invoice</span>
                        )}
                      </p>
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
                    <OrderShippingLine
                      className="mt-1 text-muted-foreground"
                      prefix="Delivery:"
                      shippingRuleLabel={orderDetail.shippingRuleLabel}
                      totalShipping={orderDetail.totalShipping}
                      currency={orderDetail.currency}
                      formatPrice={formatPrice}
                    />
                  </div>
                  {orderDetail.discountCouponCode && (
                    <div>
                      <h4 className="mb-1 text-muted-foreground">Coupon</h4>
                      <p>{orderDetail.discountCouponCode}</p>
                    </div>
                  )}
                  {orderDetail.merchantCouponCode && (
                    <div>
                      <h4 className="mb-1 text-muted-foreground">Mer Coupon</h4>
                      <p>{orderDetail.merchantCouponCode}</p>
                    </div>
                  )}
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
                            <td className="px-3 py-2 text-right">
                              <OrderLineItemPrice
                                salePrice={li.price}
                                originalPrice={li.originalPrice}
                                formatPrice={formatPrice}
                                currency={orderDetail.currency}
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              {li.originalTotal &&
                              parseFloat(li.originalTotal) > parseFloat(li.total) ? (
                                <span>
                                  <span className="block text-muted-foreground line-through">
                                    {formatPrice(li.originalTotal, orderDetail.currency)}
                                  </span>
                                  <span className="block">
                                    {formatPrice(li.total, orderDetail.currency)}
                                  </span>
                                </span>
                              ) : (
                                formatPrice(li.total, orderDetail.currency)
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <OrderLineItemsTotals
                    subtotalOriginal={orderDetail.subtotalOriginal}
                    subtotalSale={orderDetail.subtotalSale ?? orderDetail.subtotalPrice}
                    discountCouponCode={orderDetail.discountCouponCode}
                    discountTotal={orderDetail.discountTotal ?? orderDetail.totalDiscounts}
                    totalShipping={orderDetail.totalShipping}
                    shippingRuleLabel={orderDetail.shippingRuleLabel}
                    totalPrice={orderDetail.totalPrice}
                    currency={orderDetail.currency}
                    formatPrice={formatPrice}
                  />
                  {orderDetail.merchantCouponCode && (
                    <p className="mt-1 text-right text-sm text-muted-foreground">
                      Mer coupon: {orderDetail.merchantCouponCode}
                    </p>
                  )}
                </div>
              </div>
            </details>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>

    <AlertDialog open={showCancelDialog} onOpenChange={(open) => { if (!open) { setShowCancelDialog(false); setCancelOrderReason(""); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel Order {orderDetail ? (orderDetail.name ?? orderDetail.orderNumber ?? orderDetail.shopifyOrderId) : ""}</AlertDialogTitle>
          <AlertDialogDescription>
            {orderDetail?.financialStatus?.toLowerCase() === "paid" ? (
              "This is a paid order — a finance approval request will be created. The order will be blocked from dispatch until finance processes the cancellation."
            ) : (
              "This will immediately cancel the order in Shopify and void the ERP Sales Invoice if one exists."
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-1">
          <label className="mb-1.5 block text-sm font-medium" htmlFor="cancel-order-reason">
            Cancellation reason <span className="text-destructive">*</span>
          </label>
          <Textarea
            id="cancel-order-reason"
            value={cancelOrderReason}
            onChange={(e) => setCancelOrderReason(e.target.value)}
            placeholder="e.g. Customer called to cancel — changed mind"
            className="min-h-20"
            maxLength={500}
            disabled={busyKey === "cancel_order"}
          />
          <p className="mt-1 text-xs text-muted-foreground">{cancelOrderReason.trim().length}/500 — minimum 5 characters</p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busyKey === "cancel_order"}>Back</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={busyKey === "cancel_order" || cancelOrderReason.trim().length < 5}
            onClick={() => void handleCancelOrder()}
          >
            {busyKey === "cancel_order" ? (
              <><Loader2 className="mr-2 size-4 animate-spin" />Processing...</>
            ) : orderDetail?.financialStatus?.toLowerCase() === "paid" ? (
              "Send to Finance"
            ) : (
              "Confirm Cancel"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
