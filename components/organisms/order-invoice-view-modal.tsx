"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Braces,
  Check,
  Loader2,
  MessageSquare,
  Package,
  PackageCheck,
  Printer,
  RotateCcw,
  Send,
  ShoppingCart,
  Truck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import { notify } from "@/lib/notify";
import { getPaymentMethodInfo } from "@/lib/payment-method-label";

const STAGE_LABELS: Record<string, string> = {
  order_received: "Order Received",
  sample_free_issue: "Sample/Free Issue",
  print: "Print",
  returned_to_store: "Returned to Store",
  ready_to_dispatch: "Ready to Dispatch",
  dispatched: "Dispatched",
  invoice_complete: "Invoice Complete",
  delivery_complete: "Delivery Complete",
};

type UserRef = { id: string; name: string | null; email: string | null } | null;

type OrderDetail = {
  id: string;
  shopifyOrderId: string;
  orderNumber: string | null;
  name: string | null;
  erpnextInvoiceId?: string | null;
  sourceName: string;
  totalPrice: string;
  subtotalPrice: string | null;
  totalDiscounts: string | null;
  totalTax: string | null;
  totalShipping: string | null;
  currency: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  paymentGatewayNames?: string[];
  paymentGatewayPrimary?: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  shippingAddress: unknown;
  billingAddress: unknown;
  discountCodes: unknown;
  merchantCouponCode: string | null;
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
  erpAdminInvoiceUrl?: string | null;
  fulfillmentStage?: string;
  printCount?: number;
  packageReadyAt?: string | null;
  packageReadyBy?: UserRef;
  packageOnHoldAt?: string | null;
  packageHoldReason?: { id: string; name: string } | null;
  dispatchedAt?: string | null;
  dispatchedBy?: UserRef;
  dispatchedByRider?: { id: string; name: string | null; mobile: string | null } | null;
  dispatchedByCourierService?: { id: string; name: string } | null;
  invoiceCompleteAt?: string | null;
  invoiceCompleteBy?: UserRef;
  deliveryCompleteAt?: string | null;
  deliveryCompleteBy?: UserRef;
  lastPrintedAt?: string | null;
  lastPrintedBy?: UserRef;
  sampleFreeIssueCompleteAt?: string | null;
  sampleFreeIssueCompleteBy?: UserRef;
  sampleFreeIssues?: Array<{
    id: string;
    sampleFreeIssueItem: { id: string; name: string; type: string };
    quantity: number;
    createdAt?: string;
    addedBy?: UserRef;
  }>;
  returns?: Array<{
    id: string;
    reason: string;
    returnDate: string;
    dispatchedAt: string;
    shippingServiceType: string;
    shippingServiceName: string;
    actionStatus: "pending" | "solved";
    actionRemark: string | null;
    actionDate: string | null;
    createdAt: string;
    returnedBy: UserRef;
    actionBy: UserRef;
  }>;
  remarks?: Array<{
    id: string;
    stage: string;
    type: string;
    content: string;
    createdAt: string;
    showOnInvoice?: boolean;
    addedBy?: UserRef;
  }>;
  paymentApproval?: {
    id: string;
    status: string;
    requestNote: string | null;
    createdAt: string;
    reviewedAt: string | null;
    reviewNote: string | null;
    reviewedBy: UserRef | null;
  } | null;
};

interface OrderInvoiceViewModalProps {
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
  canPrint?: boolean;
  canResendRiderSms?: boolean;
  canRevertToStage?: (targetStage: string, currentStage: string) => boolean;
}

const TIMELINE_ID_TO_DB_STAGE: Record<string, string> = {
  order_received: "order_received",
  sample_free_issue: "sample_free_issue",
  print: "print",
  package_ready: "ready_to_dispatch",
  dispatched: "dispatched",
  invoice_delivered: "delivery_complete",
};

const FULFILLMENT_STAGE_ORDER = [
  "order_received",
  "sample_free_issue",
  "print",
  "returned_to_store",
  "ready_to_dispatch",
  "dispatched",
  "delivery_complete",
  "invoice_complete",
];

function userName(u: UserRef): string {
  return u ? (u.name ?? u.email ?? "-") : "-";
}

function getMerchantCouponCode(discountCodes: unknown): string | null {
  if (!Array.isArray(discountCodes) || discountCodes.length === 0) return null;
  const first = discountCodes[0] as Record<string, unknown> | null;
  if (!first || typeof first !== "object") return null;
  const code = first.code;
  if (typeof code !== "string" || !code.trim()) return null;
  const trimmed = code.trim();
  return trimmed.toLowerCase() === "shopify" ? null : trimmed;
}

function formatDateOnly(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-LK", {
    timeZone: "UTC",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

type TimelineItem = {
  id: string;
  label: string;
  date: string | null;
  who: string;
  done: boolean;
  icon: React.ReactNode;
  detail?: string;
  onHold?: boolean;
};

function buildTimeline(orderDetail: OrderDetail, formatDate: (v: string) => string): TimelineItem[] {
  const items: TimelineItem[] = [];

  // 1. Order received (always)
  items.push({
    id: "order_received",
    label: "Order Received",
    date: orderDetail.createdAt,
    who: "-",
    done: true,
    icon: <ShoppingCart className="size-4" />,
  });

  // 2. Sample / Free Issue
  const samples = orderDetail.sampleFreeIssues ?? [];
  if (samples.length > 0) {
    const earliest = samples.reduce<string | null>(
      (min, s) => {
        if (!s.createdAt) return min;
        if (!min) return s.createdAt;
        return s.createdAt < min ? s.createdAt : min;
      },
      null
    );
    const whoStr = samples
      .map((s) => (s.addedBy ? userName(s.addedBy) : null))
      .filter(Boolean)
      .join(", ");
    const addedByLine =
      whoStr && earliest
        ? `Added by ${whoStr} on ${formatDate(earliest)}`
        : whoStr
          ? `Added by ${whoStr}`
          : earliest
            ? `Added on ${formatDate(earliest)}`
            : "";
    const itemsList = samples.map((s) => `${s.sampleFreeIssueItem.name} x ${s.quantity}`).join("; ");
    items.push({
      id: "sample_free_issue",
      label: "Sample / Free Issue",
      date: earliest ?? null,
      who: whoStr || "-",
      done: true,
      icon: <Package className="size-4" />,
      detail: [itemsList, addedByLine].filter(Boolean).join(" | "),
    });
  } else if (orderDetail.sampleFreeIssueCompleteAt || orderDetail.sampleFreeIssueCompleteBy) {
    // Stage completed without adding samples (Finish Samples & Extras clicked)
    items.push({
      id: "sample_free_issue",
      label: "Sample / Free Issue",
      date: orderDetail.sampleFreeIssueCompleteAt ?? null,
      who: orderDetail.sampleFreeIssueCompleteBy ? userName(orderDetail.sampleFreeIssueCompleteBy) : "-",
      done: true,
      icon: <Package className="size-4" />,
    });
  } else {
    items.push({
      id: "sample_free_issue",
      label: "Sample / Free Issue",
      date: null,
      who: "-",
      done: false,
      icon: <Package className="size-4" />,
    });
  }

  // 3. Print
  const printed = (orderDetail.printCount ?? 0) > 0;
  items.push({
    id: "print",
    label: "Print",
    date: orderDetail.lastPrintedAt ?? null,
    who: orderDetail.lastPrintedBy ? userName(orderDetail.lastPrintedBy) : "-",
    done: printed,
    icon: <Printer className="size-4" />,
    detail: printed ? `Printed ${orderDetail.printCount} time(s)` : undefined,
  });

  // 4. Package Ready
  const onHold = !!orderDetail.packageOnHoldAt;
  const packageReady = !!orderDetail.packageReadyAt;
  items.push({
    id: "package_ready",
    label: "Package Ready",
    date: orderDetail.packageReadyAt ?? orderDetail.packageOnHoldAt ?? null,
    who: orderDetail.packageReadyBy ? userName(orderDetail.packageReadyBy) : "-",
    done: packageReady || onHold,
    icon: onHold ? <AlertTriangle className="size-4" /> : <Package className="size-4" />,
    detail: onHold ? `On hold: ${orderDetail.packageHoldReason?.name ?? "-"}` : undefined,
    onHold,
  });

  // 5. Dispatched
  const dispatched = !!orderDetail.dispatchedAt;
  const riderOrCourier = orderDetail.dispatchedByRider
    ? orderDetail.dispatchedByRider.name ?? orderDetail.dispatchedByRider.mobile ?? "Rider"
    : orderDetail.dispatchedByCourierService?.name ?? "-";
  items.push({
    id: "dispatched",
    label: "Dispatched",
    date: orderDetail.dispatchedAt ?? null,
    who: dispatched
      ? `${userName(orderDetail.dispatchedBy ?? null)} -> ${riderOrCourier}`
      : "-",
    done: dispatched,
    icon: <Truck className="size-4" />,
  });

  // 6. Delivered
  const courierOrRider =
    orderDetail.dispatchedByCourierService?.name ??
    orderDetail.dispatchedByRider?.name ??
    null;
  const deliveredByUser = orderDetail.deliveryCompleteBy
    ? userName(orderDetail.deliveryCompleteBy)
    : null;
  const deliveredWho = courierOrRider && deliveredByUser
    ? `${courierOrRider} · marked by ${deliveredByUser}`
    : deliveredByUser ?? courierOrRider ?? "-";
  items.push({
    id: "invoice_delivered",
    label: "Delivered",
    date: orderDetail.deliveryCompleteAt ?? null,
    who: deliveredWho,
    done: !!orderDetail.deliveryCompleteAt,
    icon: <PackageCheck className="size-4" />,
  });

  // 7. Invoice Completed
  items.push({
    id: "invoice_complete",
    label: "Invoice Completed",
    date: orderDetail.invoiceCompleteAt ?? null,
    who: orderDetail.invoiceCompleteBy ? userName(orderDetail.invoiceCompleteBy) : "-",
    done: !!orderDetail.invoiceCompleteAt,
    icon: <Check className="size-4" />,
  });

  return items;
}

export function OrderInvoiceViewModal({
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
  canPrint = false,
  canResendRiderSms = false,
  canRevertToStage,
}: OrderInvoiceViewModalProps) {
  const [resendSmsBusy, setResendSmsBusy] = useState(false);
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [revertingToStage, setRevertingToStage] = useState<string | null>(null);
  const [confirmRevertStage, setConfirmRevertStage] = useState<{ targetStage: string; label: string } | null>(null);
  const [revertReason, setRevertReason] = useState("");
  const [visibleRevertReasonId, setVisibleRevertReasonId] = useState<string | null>(null);

  const stage = orderDetail?.fulfillmentStage ?? "order_received";
  const isDispatchedWithRider =
    stage === "dispatched" && orderDetail?.dispatchedByRider != null;

  const timelineItems = orderDetail ? buildTimeline(orderDetail, formatDate) : [];

  async function handleResendRiderSms() {
    if (!orderId) return;
    setResendSmsBusy(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/resend-rider-sms`, {
        method: "POST",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to resend rider SMS");
        return;
      }
      notify.success("Rider SMS sent.");
    } catch {
      notify.error("Failed to resend rider SMS");
    } finally {
      setResendSmsBusy(false);
    }
  }

  function handlePrint() {
    if (!orderId) return;
    window.open(`/api/admin/orders/${orderId}/invoice?print=1`, "_blank", "noopener");
  }

  function handleRevertClick(targetStage: string, label: string) {
    setRevertReason("");
    setConfirmRevertStage({ targetStage, label });
  }

  async function handleConfirmRevert() {
    if (!orderId || !confirmRevertStage) return;
    if (!revertReason.trim()) {
      notify.error("Please provide a reason for reverting.");
      return;
    }
    setRevertingToStage(confirmRevertStage.targetStage);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/fulfillment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revert_to_stage", targetStage: confirmRevertStage.targetStage, revertReason: revertReason.trim() }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to revert stage");
        return;
      }
      notify.success("Order reverted.");
      setConfirmRevertStage(null);
      setRevertReason("");
      onRefresh?.();
    } catch {
      notify.error("Failed to revert stage");
    } finally {
      setRevertingToStage(null);
    }
  }

  if (!orderDetail && !loading) return null;

  return (
    <>
    <Dialog open={!!orderId} onOpenChange={(open) => { if (!open) { setShowJsonModal(false); onClose(); } }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-baseline gap-2 flex-wrap">
            <span>Order {orderDetail?.name ?? orderDetail?.orderNumber ?? orderDetail?.shopifyOrderId ?? "Details"}</span>
            {(() => {
              const coupon = getMerchantCouponCode(orderDetail?.discountCodes);
              if (!coupon) return null;
              return <span className="text-sm font-normal text-muted-foreground">{coupon}</span>;
            })()}
          </DialogTitle>
          <DialogDescription>
            Invoice timeline - view only{orderDetail?.erpnextInvoiceId ? ` · ERP: ${orderDetail.erpnextInvoiceId}` : ""}
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : orderDetail ? (
          <div className="space-y-6">
            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setShowJsonModal(true)}>
                <Braces className="size-4" />
                View JSON
              </Button>
              {canPrint && (orderDetail.printCount ?? 0) > 0 && (
                <Button variant="outline" onClick={handlePrint}>
                  <Printer className="size-4" />
                  Print Invoice
                </Button>
              )}
              {canResendRiderSms && isDispatchedWithRider && (
                <Button
                  variant="outline"
                  onClick={handleResendRiderSms}
                  disabled={resendSmsBusy}
                >
                  {resendSmsBusy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  Re-send Rider SMS
                </Button>
              )}
            </div>

            {/* Timeline */}
            <div className="relative">
              <div className="space-y-0">
                {timelineItems.map((item, i) => {
                  const targetDbStage = TIMELINE_ID_TO_DB_STAGE[item.id];
                  const canRevert =
                    targetDbStage &&
                    item.done &&
                    canRevertToStage?.(targetDbStage, stage) &&
                    stage !== targetDbStage &&
                    FULFILLMENT_STAGE_ORDER.indexOf(stage) > FULFILLMENT_STAGE_ORDER.indexOf(targetDbStage);
                  const isReverting = revertingToStage === targetDbStage;
                  const stageRevertRemarks = (orderDetail?.remarks ?? []).filter(
                    (r) => r.stage === targetDbStage && r.content.startsWith("[REVERT] ")
                  );
                  return (
                    <div key={item.id} className="relative flex gap-4">
                      {/* Vertical line */}
                      {i < timelineItems.length - 1 && (
                        <div
                          className="absolute left-[11px] top-8 bottom-0 w-px -translate-x-1/2 bg-border"
                          aria-hidden
                        />
                      )}
                      {/* Icon */}
                      <div
                        className={`relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full ${
                          item.onHold
                            ? "bg-destructive text-white"
                            : item.done
                              ? "bg-primary text-primary-foreground"
                              : "border-2 border-dashed border-muted-foreground/40 bg-muted/50 text-muted-foreground"
                        }`}
                      >
                        {item.icon}
                      </div>
                      {/* Content */}
                      <div className="flex-1 pb-6">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-medium">{item.label}</span>
                          <div className="flex items-center gap-2">
                            {item.date && (
                              <span className="text-muted-foreground text-xs">
                                {formatDate(item.date)}
                              </span>
                            )}
                            {canRevert && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => handleRevertClick(targetDbStage, item.label)}
                                disabled={revertingToStage !== null}
                              >
                                {isReverting ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <RotateCcw className="size-3" />
                                )}
                                Revert here
                              </Button>
                            )}
                          </div>
                        </div>
                        <p className="text-muted-foreground mt-0.5 text-sm">
                          {item.who !== "-" ? `by ${item.who}` : "-"}
                        </p>
                        {item.detail && (
                          <p className="text-muted-foreground mt-1 text-xs">{item.detail}</p>
                        )}
                        {stageRevertRemarks.map((r) => (
                          <div key={r.id} className="mt-1.5">
                            <div className="flex items-center gap-1.5 text-xs text-destructive/80">
                              <RotateCcw className="size-3 shrink-0" />
                              <span>
                                Reverted by {r.addedBy ? (r.addedBy.name ?? r.addedBy.email ?? "unknown") : "unknown"}
                                {r.createdAt ? ` on ${formatDate(r.createdAt)}` : ""}
                              </span>
                              <button
                                type="button"
                                className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                                onClick={() =>
                                  setVisibleRevertReasonId((prev) => (prev === r.id ? null : r.id))
                                }
                              >
                                {visibleRevertReasonId === r.id ? "Hide reason" : "View reason"}
                              </button>
                            </div>
                            {visibleRevertReasonId === r.id && (
                              <p className="mt-1 rounded border border-destructive/20 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive/90">
                                {r.content.replace(/^\[REVERT\] /, "")}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Order details */}
            <details className="rounded-lg border">
              <summary className="cursor-pointer p-4 font-medium">Order Details</summary>
              <div className="space-y-4 border-t p-4">
                <div className="grid gap-6 sm:grid-cols-2 text-sm">
                  {/* Left column: Source, Payment Approval, Customer, Shipping address */}
                  <div className="space-y-4">
                    <div>
                      <span className="text-muted-foreground text-xs">Source</span>
                      <p>{orderDetail.sourceName}</p>
                    </div>
                    {orderDetail.paymentApproval && (
                      <div>
                        <span className="text-muted-foreground text-xs">Payment Approval</span>
                        {orderDetail.paymentApproval.status === "pending" ? (
                          <p className="flex items-center gap-1.5">
                            <span className="inline-flex rounded px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                              Pending
                            </span>
                            <span className="text-xs text-muted-foreground">Awaiting finance approval</span>
                          </p>
                        ) : orderDetail.paymentApproval.status === "approved" ? (
                          <p className="flex items-center gap-1.5">
                            <span className="inline-flex rounded px-1.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                              Approved
                            </span>
                            {orderDetail.paymentApproval.reviewedBy && (
                              <span className="text-xs text-muted-foreground">
                                by {orderDetail.paymentApproval.reviewedBy.name ?? orderDetail.paymentApproval.reviewedBy.email}
                              </span>
                            )}
                          </p>
                        ) : (
                          <p>
                            <span className="inline-flex rounded px-1.5 py-0.5 text-xs font-medium bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
                              Rejected
                            </span>
                          </p>
                        )}
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground text-xs">Customer</span>
                      <p>
                        {getCustomerName(orderDetail.shippingAddress) ??
                          getCustomerName(orderDetail.billingAddress) ??
                          "-"}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Shipping address</span>
                      <p>{formatAddress(orderDetail.shippingAddress)}</p>
                    </div>
                  </div>

                  {/* Right column: Payment Type, Location, Email / Phone, Mer Coupon */}
                  <div className="space-y-4">
                    <div>
                      <span className="text-muted-foreground text-xs">Payment Type</span>
                      <p>
                        {getPaymentMethodInfo({
                          paymentGatewayPrimary: orderDetail.paymentGatewayPrimary,
                          paymentGatewayNames: orderDetail.paymentGatewayNames,
                          financialStatus: orderDetail.financialStatus,
                        }).label}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Location</span>
                      <p>{orderDetail.companyLocation?.name ?? "-"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Email / Phone</span>
                      <p>{orderDetail.customerEmail ?? "-"}</p>
                      {(orderDetail.customerPhone ?? getAddressPhone(orderDetail.shippingAddress)) && (
                        <p className="text-muted-foreground">
                          {orderDetail.customerPhone ?? getAddressPhone(orderDetail.shippingAddress)}
                        </p>
                      )}
                    </div>
                    {(() => {
                      const coupon = getMerchantCouponCode(orderDetail.discountCodes);
                      if (coupon) return (
                        <div>
                          <span className="text-muted-foreground text-xs">Mer Coupon</span>
                          <p>{coupon}</p>
                        </div>
                      );
                      if (orderDetail.assignedMerchant) return (
                        <div>
                          <span className="text-muted-foreground text-xs">Merchant</span>
                          <p>{orderDetail.assignedMerchant.name ?? orderDetail.assignedMerchant.email ?? "-"}</p>
                        </div>
                      );
                      return null;
                    })()}
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
                            <td className="px-3 py-2 text-right">
                              {formatPrice(li.price, orderDetail.currency)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {formatPrice(li.total, orderDetail.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {orderDetail.merchantCouponCode && (
                    <p className="mt-1 text-right text-sm text-muted-foreground">
                      Coupon: {orderDetail.merchantCouponCode}{orderDetail.totalDiscounts && parseFloat(orderDetail.totalDiscounts) > 0 ? ` (−${formatPrice(orderDetail.totalDiscounts, orderDetail.currency)})` : ""}
                    </p>
                  )}
                  {orderDetail.totalShipping != null && parseFloat(orderDetail.totalShipping) > 0 && (
                    <p className="mt-1 text-right text-sm text-muted-foreground">
                      Shipping: {formatPrice(orderDetail.totalShipping, orderDetail.currency)}
                    </p>
                  )}
                  <p className="mt-2 text-right font-medium">
                    Total: {formatPrice(orderDetail.totalPrice, orderDetail.currency)}
                  </p>
                </div>
              </div>
            </details>

            {orderDetail.returns && orderDetail.returns.length > 0 && (
              <div className="rounded-lg border p-4">
                <h4 className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <RotateCcw className="size-4" />
                  Returned Orders
                </h4>
                <div className="space-y-3 text-sm">
                  {orderDetail.returns.map((item) => (
                    <div key={item.id} className="rounded-md border border-dashed p-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <span className="text-muted-foreground text-xs">Reason</span>
                          <p className="font-medium">{item.reason}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Marked returned by</span>
                          <p>{userName(item.returnedBy)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Return date</span>
                          <p>{formatDateOnly(item.returnDate)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">System recorded date/time</span>
                          <p>{formatDate(item.createdAt)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Original dispatch date/time</span>
                          <p>{formatDate(item.dispatchedAt)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Shipping service</span>
                          <p>{item.shippingServiceName || item.shippingServiceType}</p>
                        </div>
                      </div>
                      <div className="mt-3 border-t pt-3">
                        <span className="text-muted-foreground text-xs">Sales action</span>
                        <p className="mt-0.5">
                          {item.actionStatus === "solved" ? "Solved" : "Pending"}
                          {item.actionBy ? ` by ${userName(item.actionBy)}` : ""}
                          {item.actionDate ? ` on ${formatDate(item.actionDate)}` : ""}
                        </p>
                        {item.actionRemark && (
                          <p className="mt-1 text-muted-foreground">{item.actionRemark}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Remarks */}
            {orderDetail.remarks && orderDetail.remarks.length > 0 && (
              <div className="rounded-lg border p-4">
                <h4 className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <MessageSquare className="size-4" />
                  Remarks
                </h4>
                <ul className="space-y-2 text-sm">
                  {orderDetail.remarks.map((r) => (
                    <li key={r.id} className="rounded border border-dashed p-3">
                      <p className="text-foreground">{r.content}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        <span className="font-medium">
                          [{STAGE_LABELS[r.stage] ?? r.stage}] {r.type}
                        </span>
                        <span className="mx-2">|</span>
                        <span>
                          Added by {r.addedBy ? (r.addedBy.name ?? r.addedBy.email ?? "-") : "-"}
                          {r.createdAt ? ` on ${formatDate(r.createdAt)}` : ""}
                        </span>
                        {r.showOnInvoice && (
                          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px]">On invoice</span>
                        )}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

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
          </div>
        ) : null}
      </DialogContent>
    </Dialog>

    <Dialog open={showJsonModal} onOpenChange={setShowJsonModal}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Order JSON</DialogTitle>
          <DialogDescription>
            Raw order data for {orderDetail?.name ?? orderDetail?.orderNumber ?? orderDetail?.shopifyOrderId ?? "order"}
          </DialogDescription>
        </DialogHeader>
        {orderDetail && (
          <pre className="flex-1 overflow-auto rounded-lg border bg-muted/30 p-4 text-xs">
            <code>{JSON.stringify(orderDetail, null, 2)}</code>
          </pre>
        )}
      </DialogContent>
    </Dialog>

    <AlertDialog open={!!confirmRevertStage} onOpenChange={(open) => { if (!open) { setConfirmRevertStage(null); setRevertReason(""); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revert to {confirmRevertStage?.label}</AlertDialogTitle>
          <AlertDialogDescription>
            This will undo all progress after that stage. The order will return to{" "}
            {confirmRevertStage?.label}. Rider delivery link will be invalidated if the order was dispatched. This
            action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-1">
          <label className="mb-1.5 block text-sm font-medium" htmlFor="revert-reason">
            Reason for reverting <span className="text-destructive">*</span>
          </label>
          <Textarea
            id="revert-reason"
            placeholder="Describe why this order is being reverted…"
            value={revertReason}
            onChange={(e) => setRevertReason(e.target.value)}
            maxLength={500}
            rows={3}
            disabled={!!revertingToStage}
          />
          <p className="mt-1 text-right text-xs text-muted-foreground">{revertReason.length}/500</p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={!!revertingToStage}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={!!revertingToStage || !revertReason.trim()}
            onClick={handleConfirmRevert}
            className="gap-2"
          >
            {revertingToStage ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Reverting...
              </>
            ) : (
              "Revert"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    </>
  );
}
