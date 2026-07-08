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

import { OrderShippingLine } from "@/components/molecules/order-shipping-line";
import { OrderLineItemPrice } from "@/components/molecules/order-line-item-price";
import { OrderLineItemsTotals } from "@/components/molecules/order-line-items-totals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { getOrderDispatchLabel, formatDeliveredTimelineWho, formatInvoiceCompleteTimelineWho, SHOW_INVOICE_COMPLETED_IN_ORDER_DETAILS } from "@/lib/order-dispatch";
import { getPaymentMethodInfo } from "@/lib/payment-method-label";
import { notify } from "@/lib/notify";
import {
  RETURN_REMARK_TEMPLATES,
  type ReturnRemarkTemplateCode,
} from "@/lib/return-remark-templates";
import {
  isPackageReadyMilestoneComplete,
  resolvePackageReadyMilestoneDate,
} from "@/lib/fulfillment-stage-display";

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
  paymentGatewayNames?: string[];
  paymentGatewayPrimary?: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerName?: string | null;
  /** `customer_name` as received on the ERP Sales Invoice webhook (stored in rawPayload). */
  erpWebhookCustomerName?: string | null;
  /** How customerName was resolved for ERP orders (shown in Order JSON for debugging). */
  customerNameSource?: "stored" | "erp_customer_api" | null;
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
  fulfillmentStage?: string;
  fulfillmentStageEnteredAt?: string | null;
  printCount?: number;
  packageReadyAt?: string | null;
  packageReadyBy?: UserRef;
  packageOnHoldAt?: string | null;
  packageHoldReason?: { id: string; name: string } | null;
  dispatchedAt?: string | null;
  dispatchedBy?: UserRef;
  dispatchedByRider?: { id: string; name: string | null; mobile: string | null } | null;
  dispatchedByCourierService?: { id: string; name: string } | null;
  dispatchedToCustomer?: boolean | null;
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
  deliveryPaymentApproval?: {
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
  canManageFinanceApprovals?: boolean;
  canRevertPaid?: boolean;
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

const DISPATCHED_OR_LATER = new Set([
  "dispatched",
  "delivery_complete",
  "invoice_complete",
]);

function userName(u: UserRef): string {
  return u ? (u.name ?? u.email ?? "-") : "-";
}

function isFulfillmentAtOrPastPrint(fulfillmentStage?: string): boolean {
  if (!fulfillmentStage) return false;
  const printIdx = FULFILLMENT_STAGE_ORDER.indexOf("print");
  const stageIdx = FULFILLMENT_STAGE_ORDER.indexOf(
    fulfillmentStage as (typeof FULFILLMENT_STAGE_ORDER)[number],
  );
  if (stageIdx >= 0) return stageIdx >= printIdx;
  return fulfillmentStage === "returned";
}

function approvedPaymentApproval(orderDetail: OrderDetail) {
  return orderDetail.paymentApproval?.status === "approved" ? orderDetail.paymentApproval : null;
}

/** Sample step done: items added, explicitly completed, or order advanced to print (ERP / finance-approved). */
function isSampleStageComplete(orderDetail: OrderDetail): boolean {
  if ((orderDetail.sampleFreeIssues ?? []).length > 0) return true;
  if (orderDetail.sampleFreeIssueCompleteAt || orderDetail.sampleFreeIssueCompleteBy) return true;
  return isFulfillmentAtOrPastPrint(orderDetail.fulfillmentStage);
}

function sampleStageCompletionMeta(orderDetail: OrderDetail) {
  const approval = approvedPaymentApproval(orderDetail);
  const autoCompleted =
    isSampleStageComplete(orderDetail) &&
    (orderDetail.sampleFreeIssues ?? []).length === 0 &&
    !orderDetail.sampleFreeIssueCompleteAt;

  return {
    date:
      orderDetail.sampleFreeIssueCompleteAt ??
      approval?.reviewedAt ??
      (isFulfillmentAtOrPastPrint(orderDetail.fulfillmentStage)
        ? orderDetail.fulfillmentStageEnteredAt ?? null
        : null),
    who: orderDetail.sampleFreeIssueCompleteBy
      ? userName(orderDetail.sampleFreeIssueCompleteBy)
      : approval?.reviewedBy
        ? userName(approval.reviewedBy)
        : "-",
    detail: autoCompleted && approval ? "Completed on finance approval" : undefined,
  };
}

function formatAllDiscountCodeLabels(discountCodes: unknown): string | null {
  if (!Array.isArray(discountCodes) || discountCodes.length === 0) return null;
  const codes = discountCodes
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const code = (entry as Record<string, unknown>).code;
      if (typeof code !== "string" || !code.trim()) return null;
      const trimmed = code.trim();
      return trimmed.toLowerCase() === "shopify" ? null : trimmed;
    })
    .filter(Boolean) as string[];
  return codes.length > 0 ? codes.join(", ") : null;
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

function isPosOrder(sourceName: string) {
  return sourceName === "pos" || sourceName === "erpnext-pos";
}

function buildTimeline(orderDetail: OrderDetail, formatDate: (v: string) => string): TimelineItem[] {
  const isPos = isPosOrder(orderDetail.sourceName);
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
  } else if (isSampleStageComplete(orderDetail)) {
    const completion = sampleStageCompletionMeta(orderDetail);
    items.push({
      id: "sample_free_issue",
      label: "Sample / Free Issue",
      date: completion.date,
      who: completion.who,
      done: true,
      icon: <Package className="size-4" />,
      detail: completion.detail,
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
  const reachedPrintQueue = isFulfillmentAtOrPastPrint(orderDetail.fulfillmentStage);
  items.push({
    id: "print",
    label: printed ? "Printed" : "Print",
    date:
      orderDetail.lastPrintedAt ??
      (reachedPrintQueue && !printed ? orderDetail.fulfillmentStageEnteredAt ?? null : null),
    who: orderDetail.lastPrintedBy ? userName(orderDetail.lastPrintedBy) : "-",
    done: printed || reachedPrintQueue,
    icon: <Printer className="size-4" />,
    detail: printed
      ? orderDetail.printCount === 1
        ? undefined
        : `Printed ${orderDetail.printCount} times`
      : reachedPrintQueue && !printed
        ? "In print queue"
        : undefined,
  });

  if (isPos) {
    // POS orders are completed in-store — no dispatch/delivery/invoice steps apply.
    items.push({
      id: "completed_at_pos",
      label: "Completed at Store",
      date: orderDetail.fulfillmentStageEnteredAt ?? null,
      who: "-",
      done: true,
      icon: <Check className="size-4" />,
    });
    return items;
  }

  // 4. Package Ready — only after manual mark or dispatch (not auto on print)
  const onHold = !!orderDetail.packageOnHoldAt;
  const packageReady = isPackageReadyMilestoneComplete({
    packageReadyAt: orderDetail.packageReadyAt,
    lastPrintedAt: orderDetail.lastPrintedAt,
    dispatchedAt: orderDetail.dispatchedAt,
    packageOnHoldAt: orderDetail.packageOnHoldAt,
  });
  items.push({
    id: "package_ready",
    label: "Package Ready",
    date: packageReady
      ? resolvePackageReadyMilestoneDate({
          packageReadyAt: orderDetail.packageReadyAt,
          lastPrintedAt: orderDetail.lastPrintedAt,
          dispatchedAt: orderDetail.dispatchedAt,
          packageOnHoldAt: orderDetail.packageOnHoldAt,
        })
      : orderDetail.packageOnHoldAt ?? null,
    who: packageReady && orderDetail.packageReadyBy
      ? userName(orderDetail.packageReadyBy)
      : packageReady && orderDetail.dispatchedAt
        ? userName(orderDetail.dispatchedBy ?? null)
        : "-",
    done: packageReady || onHold,
    icon: onHold ? <AlertTriangle className="size-4" /> : <Package className="size-4" />,
    detail: onHold ? `On hold: ${orderDetail.packageHoldReason?.name ?? "-"}` : undefined,
    onHold,
  });

  // 5. Dispatched
  const dispatched = !!orderDetail.dispatchedAt;
  const dispatchTarget = getOrderDispatchLabel(orderDetail);
  items.push({
    id: "dispatched",
    label: "Dispatched",
    date: orderDetail.dispatchedAt ?? null,
    who: dispatched
      ? `${userName(orderDetail.dispatchedBy ?? null)} -> ${dispatchTarget}`
      : "-",
    done: dispatched,
    icon: <Truck className="size-4" />,
  });

  // 6. Delivered — store marks after dispatch; courier name only once delivered
  items.push({
    id: "invoice_delivered",
    label: "Delivered",
    date: orderDetail.deliveryCompleteAt ?? null,
    who: formatDeliveredTimelineWho({
      deliveryCompleteAt: orderDetail.deliveryCompleteAt,
      deliveryCompleteBy: orderDetail.deliveryCompleteBy,
      dispatchLabel: getOrderDispatchLabel(orderDetail),
    }),
    done: !!orderDetail.deliveryCompleteAt,
    icon: <PackageCheck className="size-4" />,
  });

  // 7. Invoice Completed — finance approver after delivery payment confirmation (COD)
  if (SHOW_INVOICE_COMPLETED_IN_ORDER_DETAILS) {
    items.push({
      id: "invoice_complete",
      label: "Invoice Completed",
      date: orderDetail.invoiceCompleteAt ?? null,
      who: formatInvoiceCompleteTimelineWho({
        invoiceCompleteBy: orderDetail.invoiceCompleteBy,
        deliveryPaymentApproval: orderDetail.deliveryPaymentApproval,
      }),
      done: !!orderDetail.invoiceCompleteAt,
      icon: <Check className="size-4" />,
    });
  }

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
  canManageFinanceApprovals = false,
  canRevertPaid = false,
}: OrderInvoiceViewModalProps) {
  const [resendSmsBusy, setResendSmsBusy] = useState(false);
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [revertingToStage, setRevertingToStage] = useState<string | null>(null);
  const [confirmRevertStage, setConfirmRevertStage] = useState<{ targetStage: string; label: string } | null>(null);
  const [revertReason, setRevertReason] = useState("");
  const [revertRemarkTemplate, setRevertRemarkTemplate] = useState<ReturnRemarkTemplateCode>("UTC");
  const [visibleRevertReasonId, setVisibleRevertReasonId] = useState<string | null>(null);
  const [financeReviewNote, setFinanceReviewNote] = useState("");
  const [financeBusy, setFinanceBusy] = useState<"approve" | "reject" | null>(null);
  const [hodPassword, setHodPassword] = useState("");
  const [hodRevertReason, setHodRevertReason] = useState("");
  const [hodRevertBusy, setHodRevertBusy] = useState(false);

  const stage = orderDetail?.fulfillmentStage ?? "order_received";
  const isDispatchedWithRider =
    stage === "dispatched" && orderDetail?.dispatchedByRider != null;

  const timelineItems = orderDetail ? buildTimeline(orderDetail, formatDate) : [];
  const pendingDeliveryApproval =
    orderDetail?.deliveryPaymentApproval?.status === "pending" ? orderDetail.deliveryPaymentApproval : null;
  const pendingOrderPaymentApproval =
    orderDetail?.paymentApproval?.status === "pending" ? orderDetail.paymentApproval : null;
  const canMarkDeliveryPaid =
    canManageFinanceApprovals && pendingDeliveryApproval != null;
  const canMarkOrderPaid =
    canManageFinanceApprovals && pendingOrderPaymentApproval != null;
  const canHodRevertPaid =
    canRevertPaid &&
    orderDetail?.financialStatus?.toLowerCase() === "paid";

  async function reviewFinanceApproval(action: "approve" | "reject", approvalId: string) {
    setFinanceBusy(action);
    try {
      const res = await fetch(`/api/admin/approvals/${approvalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reviewNote: financeReviewNote.trim() || null }),
      });
      const data = (await res.json()) as { error?: string; erpSyncFailed?: boolean; erpSyncError?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to review approval");
        return;
      }
      if (action === "approve" && data.erpSyncFailed) {
        notify.error(data.erpSyncError ?? "Approved, but ERP payment entry failed.");
      } else {
        notify.success(action === "approve" ? "Payment confirmed — order marked paid." : "Approval rejected.");
      }
      setFinanceReviewNote("");
      onRefresh?.();
    } catch {
      notify.error("Failed to review approval");
    } finally {
      setFinanceBusy(null);
    }
  }

  async function handleHodRevertPaid() {
    if (!orderId) return;
    if (!hodPassword.trim()) {
      notify.error("Enter the HOD password.");
      return;
    }
    setHodRevertBusy(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/revert-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: hodPassword,
          reason: hodRevertReason.trim() || null,
        }),
      });
      const data = (await res.json()) as { error?: string; approvalRequeued?: boolean };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to revert payment status");
        return;
      }
      notify.success(
        data.approvalRequeued
          ? "Order reverted to unpaid. Finance can confirm payment again from this order or Finance Approvals."
          : "Order reverted to unpaid.",
      );
      setHodPassword("");
      setHodRevertReason("");
      onRefresh?.();
    } catch {
      notify.error("Failed to revert payment status");
    } finally {
      setHodRevertBusy(false);
    }
  }

  async function handleResendSms(trigger: "package_ready" | "dispatched" | "rider_dispatched") {
    if (!orderId) return;
    setResendSmsBusy(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/resend-sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to resend SMS");
        return;
      }
      const labels: Record<string, string> = {
        package_ready: "Package ready SMS sent.",
        dispatched: "Dispatched SMS sent to customer.",
        rider_dispatched: "Rider SMS sent.",
      };
      notify.success(labels[trigger] ?? "SMS sent.");
    } catch {
      notify.error("Failed to resend SMS");
    } finally {
      setResendSmsBusy(false);
    }
  }

  function handlePrint() {
    if (!orderId) return;
    window.open(`/api/admin/orders/${orderId}/invoice?print=1`, "_blank", "noopener");
    window.setTimeout(() => onRefresh?.(), 2000);
  }

  function handleRevertClick(targetStage: string, label: string) {
    setRevertReason("");
    setRevertRemarkTemplate("UTC");
    setConfirmRevertStage({ targetStage, label });
  }

  async function handleConfirmRevert() {
    if (!orderId || !confirmRevertStage) return;
    if (!revertReason.trim() && revertRemarkTemplate === "CUSTOM") {
      notify.error("Please provide a custom remark for reverting.");
      return;
    }
    setRevertingToStage(confirmRevertStage.targetStage);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/fulfillment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "revert_to_stage",
          targetStage: confirmRevertStage.targetStage,
          revertReason: revertReason.trim() || RETURN_REMARK_TEMPLATES.find((item) => item.code === revertRemarkTemplate)?.label || "Reverted",
          remarkTemplate: revertRemarkTemplate,
        }),
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
              const coupon =
                orderDetail?.merchantCouponCode ??
                orderDetail?.discountCouponCode ??
                formatAllDiscountCodeLabels(orderDetail?.discountCodes);
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
            {pendingOrderPaymentApproval && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
                <p className="font-medium">Order payment awaiting finance confirmation</p>
                <p className="mt-1 text-amber-800/90 dark:text-amber-300/90">
                  KOKO or bank transfer payment must be approved before this order can proceed.
                </p>
                {canMarkOrderPaid && (
                  <div className="mt-3 space-y-2">
                    <Textarea
                      value={financeReviewNote}
                      onChange={(event) => setFinanceReviewNote(event.target.value)}
                      placeholder="Finance note (optional)"
                      className="min-h-16 bg-background/80"
                      disabled={financeBusy !== null}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => void reviewFinanceApproval("approve", pendingOrderPaymentApproval.id)}
                        disabled={financeBusy !== null}
                        className="gap-2"
                      >
                        {financeBusy === "approve" ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          <Check className="size-4" aria-hidden />
                        )}
                        Approve payment
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void reviewFinanceApproval("reject", pendingOrderPaymentApproval.id)}
                        disabled={financeBusy !== null}
                        className="gap-2"
                      >
                        {financeBusy === "reject" ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          <AlertTriangle className="size-4" aria-hidden />
                        )}
                        Reject
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {pendingDeliveryApproval && (
              <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-900 dark:text-orange-200">
                <p className="font-medium">Delivery payment awaiting finance confirmation</p>
                <p className="mt-1 text-orange-800/90 dark:text-orange-300/90">
                  Cash or card was collected on delivery. Finance must confirm payment received before this order is marked paid.
                </p>
                {pendingDeliveryApproval.requestNote && (
                  <p className="mt-2 whitespace-pre-wrap text-xs text-orange-800/80 dark:text-orange-300/80">
                    {pendingDeliveryApproval.requestNote}
                  </p>
                )}
                {canMarkDeliveryPaid && (
                  <div className="mt-3 space-y-2">
                    <Textarea
                      value={financeReviewNote}
                      onChange={(event) => setFinanceReviewNote(event.target.value)}
                      placeholder="Finance note (optional)"
                      className="min-h-16 bg-background/80"
                      disabled={financeBusy !== null}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => void reviewFinanceApproval("approve", pendingDeliveryApproval.id)}
                        disabled={financeBusy !== null}
                        className="gap-2"
                      >
                        {financeBusy === "approve" ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          <Check className="size-4" aria-hidden />
                        )}
                        Confirm payment received
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void reviewFinanceApproval("reject", pendingDeliveryApproval.id)}
                        disabled={financeBusy !== null}
                        className="gap-2"
                      >
                        {financeBusy === "reject" ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          <AlertTriangle className="size-4" aria-hidden />
                        )}
                        Reject
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {canHodRevertPaid && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-2">
                <p className="text-sm font-medium">Revert paid → unpaid (HOD only)</p>
                <Input
                  type="password"
                  value={hodPassword}
                  onChange={(event) => setHodPassword(event.target.value)}
                  placeholder="HOD password"
                  disabled={hodRevertBusy}
                  autoComplete="off"
                />
                <Textarea
                  value={hodRevertReason}
                  onChange={(event) => setHodRevertReason(event.target.value)}
                  placeholder="Reason (optional)"
                  className="min-h-16"
                  disabled={hodRevertBusy}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleHodRevertPaid()}
                  disabled={hodRevertBusy}
                  className="gap-2"
                >
                  {hodRevertBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RotateCcw className="size-4" aria-hidden />}
                  Revert to unpaid
                </Button>
              </div>
            )}

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
              {canResendRiderSms && orderDetail?.packageReadyAt && (
                <Button
                  variant="outline"
                  onClick={() => void handleResendSms("package_ready")}
                  disabled={resendSmsBusy}
                >
                  {resendSmsBusy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  Re-send Package Ready SMS
                </Button>
              )}
              {canResendRiderSms && DISPATCHED_OR_LATER.has(stage) && (
                <Button
                  variant="outline"
                  onClick={() => void handleResendSms("dispatched")}
                  disabled={resendSmsBusy}
                >
                  {resendSmsBusy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  Re-send Dispatched SMS
                </Button>
              )}
              {canResendRiderSms && isDispatchedWithRider && (
                <Button
                  variant="outline"
                  onClick={() => void handleResendSms("rider_dispatched")}
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
                                onClick={() =>
                                  handleRevertClick(
                                    targetDbStage,
                                    item.id === "print" ? "Print" : item.label,
                                  )
                                }
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
                        <span className="text-muted-foreground text-xs">Order Payment Approval</span>
                        {orderDetail.paymentApproval.status === "pending" ? (
                          <p className="flex items-center gap-1.5">
                            <span className="inline-flex rounded px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                              Pending
                            </span>
                            <span className="text-xs text-muted-foreground">Awaiting finance (KOKO / bank)</span>
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
                    {orderDetail.deliveryPaymentApproval && (
                      <div>
                        <span className="text-muted-foreground text-xs">Delivery Payment Approval</span>
                        {orderDetail.deliveryPaymentApproval.status === "pending" ? (
                          <p className="flex items-center gap-1.5">
                            <span className="inline-flex rounded px-1.5 py-0.5 text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
                              Pending
                            </span>
                            <span className="text-xs text-muted-foreground">Awaiting finance (COD / card on delivery)</span>
                          </p>
                        ) : orderDetail.deliveryPaymentApproval.status === "approved" ? (
                          <p className="flex items-center gap-1.5">
                            <span className="inline-flex rounded px-1.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                              Approved
                            </span>
                            {orderDetail.deliveryPaymentApproval.reviewedBy && (
                              <span className="text-xs text-muted-foreground">
                                by {orderDetail.deliveryPaymentApproval.reviewedBy.name ?? orderDetail.deliveryPaymentApproval.reviewedBy.email}
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
                        {orderDetail.deliveryPaymentApproval.requestNote && (
                          <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                            {orderDetail.deliveryPaymentApproval.requestNote}
                          </p>
                        )}
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground text-xs">Customer</span>
                      <p>{orderDetail.customerName ?? "-"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Shipping address</span>
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
                    {orderDetail.discountCouponCode && (
                      <div>
                        <span className="text-muted-foreground text-xs">Coupon</span>
                        <p>{orderDetail.discountCouponCode}</p>
                      </div>
                    )}
                    {(() => {
                      const coupon = orderDetail.merchantCouponCode;
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

    <AlertDialog open={!!confirmRevertStage} onOpenChange={(open) => { if (!open) { setConfirmRevertStage(null); setRevertReason(""); setRevertRemarkTemplate("UTC"); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revert to {confirmRevertStage?.label}</AlertDialogTitle>
          <AlertDialogDescription>
            This will undo all progress after that stage. The order will return to{" "}
            {confirmRevertStage?.label}. Rider delivery link will be invalidated if the order was dispatched. This
            action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-2">
            <label className="text-sm font-medium">Return remark template</label>
            <Select
              value={revertRemarkTemplate}
              onValueChange={(value) => setRevertRemarkTemplate(value as ReturnRemarkTemplateCode)}
              disabled={!!revertingToStage}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RETURN_REMARK_TEMPLATES.map((template) => (
                  <SelectItem key={template.code} value={template.code}>{template.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="revert-reason">
              {revertRemarkTemplate === "CUSTOM" ? (
                <>Custom remark <span className="text-destructive">*</span></>
              ) : (
                <>Additional note (optional)</>
              )}
            </label>
            <Textarea
              id="revert-reason"
              placeholder={revertRemarkTemplate === "CUSTOM" ? "Enter custom return remark…" : "Optional extra detail…"}
              value={revertReason}
              onChange={(e) => setRevertReason(e.target.value)}
              maxLength={500}
              rows={3}
              disabled={!!revertingToStage}
            />
            <p className="mt-1 text-right text-xs text-muted-foreground">{revertReason.length}/500</p>
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={!!revertingToStage}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={!!revertingToStage || (revertRemarkTemplate === "CUSTOM" && !revertReason.trim())}
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
