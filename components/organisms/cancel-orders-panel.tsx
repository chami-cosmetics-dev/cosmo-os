"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, Search, XCircle } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notify";
import { getPaymentMethodInfo } from "@/lib/payment-method-label";

type CancelOrder = {
  id: string;
  name: string | null;
  orderNumber: string | null;
  shopifyOrderId: string;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  fulfillmentStage: string;
  financialStatus: string | null;
  paymentGatewayPrimary: string | null;
  paymentGatewayNames: string[];
  totalPrice: string;
  createdAt: string;
  locationName: string | null;
};

const CANCELABLE_STAGES: Record<string, string> = {
  order_received: "Order Received",
  sample_free_issue: "Sample/Free Issue",
  print: "Print",
  ready_to_dispatch: "Ready to Dispatch",
};

const STAGE_BADGE: Record<string, string> = {
  order_received: "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300",
  sample_free_issue: "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300",
  print: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300",
  ready_to_dispatch: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300",
};

function isPaidCancelGateway(gateway: string | null): boolean {
  if (!gateway) return false;
  const g = gateway.toLowerCase().trim();
  return g.includes("koko") || g.includes("bank") || g === "cc" || g === "cc checkout" || g.includes("webxpay");
}

function requiresFinanceApproval(order: Pick<CancelOrder, "financialStatus" | "paymentGatewayPrimary">): boolean {
  return (
    order.financialStatus?.toLowerCase() === "paid" &&
    isPaidCancelGateway(order.paymentGatewayPrimary)
  );
}

function orderLabel(order: Pick<CancelOrder, "name" | "orderNumber" | "shopifyOrderId">): string {
  return order.name ?? order.orderNumber ?? order.shopifyOrderId;
}

export function CancelOrdersPanel() {
  const [orders, setOrders] = useState<CancelOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<CancelOrder | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        fulfillmentStages: "order_received,sample_free_issue,print,ready_to_dispatch",
        pageSize: "100",
      });
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      const res = await fetch(`/api/admin/orders?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        notify.error("Failed to load orders");
        return;
      }
      const data = (await res.json()) as { orders?: CancelOrder[] };
      setOrders(
        (data.orders ?? []).filter((o) => o.financialStatus?.toLowerCase() !== "voided")
      );
    } catch {
      notify.error("Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  const grouped = useMemo(() => {
    const map: Record<string, CancelOrder[]> = {};
    for (const o of orders) {
      if (!map[o.fulfillmentStage]) map[o.fulfillmentStage] = [];
      map[o.fulfillmentStage].push(o);
    }
    return map;
  }, [orders]);

  async function handleCancel() {
    if (!selectedOrder || cancelReason.trim().length < 5) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/admin/orders/${selectedOrder.id}/fulfillment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel_order", reason: cancelReason.trim() }),
      });
      const data = (await res.json()) as { success?: boolean; requiresApproval?: boolean; approvalId?: string; error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to cancel order");
        return;
      }
      if (data.requiresApproval) {
        notify.success(`Cancel request sent to finance for approval — ${orderLabel(selectedOrder)}`);
      } else {
        notify.success(`Order ${orderLabel(selectedOrder)} cancelled`);
      }
      setSelectedOrder(null);
      setCancelReason("");
      await fetchOrders();
    } catch {
      notify.error("Failed to cancel order");
    } finally {
      setCancelling(false);
    }
  }

  const needsApproval = selectedOrder ? requiresFinanceApproval(selectedOrder) : false;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Cancel Orders</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Cancel orders before dispatch. Paid orders (KOKO, Bank Transfer, CC Checkout) require finance approval.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void fetchOrders()} disabled={loading}>
          <RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search orders..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 size-5 animate-spin" />
          Loading orders...
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <XCircle className="size-8 opacity-40" />
          <p className="text-sm">No active orders to cancel</p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {Object.entries(CANCELABLE_STAGES).map(([stage, stageLabel]) => {
            const stageOrders = grouped[stage];
            if (!stageOrders?.length) return null;
            return (
              <div key={stage}>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  <span className={`inline-flex rounded border px-1.5 py-0.5 text-[11px] font-semibold ${STAGE_BADGE[stage] ?? ""}`}>
                    {stageLabel}
                  </span>
                  <span>{stageOrders.length} order{stageOrders.length !== 1 ? "s" : ""}</span>
                </h2>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                        <th className="px-4 py-2.5 text-left font-medium">Order</th>
                        <th className="px-4 py-2.5 text-left font-medium">Customer</th>
                        <th className="px-4 py-2.5 text-left font-medium">Payment</th>
                        <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                        <th className="px-4 py-2.5 text-right font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {stageOrders.map((order) => {
                        const pm = getPaymentMethodInfo({
                          paymentGatewayPrimary: order.paymentGatewayPrimary,
                          paymentGatewayNames: order.paymentGatewayNames,
                          financialStatus: order.financialStatus,
                        });
                        const paidApproval = requiresFinanceApproval(order);
                        return (
                          <tr key={order.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-medium">{orderLabel(order)}</div>
                              {order.locationName && (
                                <div className="text-xs text-muted-foreground">{order.locationName}</div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div>{order.customerName ?? order.customerEmail ?? "—"}</div>
                              {order.customerPhone && (
                                <div className="text-xs text-muted-foreground">{order.customerPhone}</div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <span>{pm.label}</span>
                                {paidApproval && (
                                  <span className="inline-flex items-center gap-0.5 rounded border border-amber-200 bg-amber-50 px-1 py-0.5 text-[10px] font-medium text-amber-700 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-300">
                                    <AlertTriangle className="size-2.5" />
                                    Finance req.
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-medium tabular-nums">
                              LKR {Number(order.totalPrice).toLocaleString("en-LK", { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1.5 border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => { setCancelReason(""); setSelectedOrder(order); }}
                              >
                                <XCircle className="size-3.5" />
                                Cancel
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog
        open={!!selectedOrder}
        onOpenChange={(open) => { if (!open) { setSelectedOrder(null); setCancelReason(""); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Order {selectedOrder ? orderLabel(selectedOrder) : ""}</AlertDialogTitle>
            <AlertDialogDescription>
              {needsApproval ? (
                <>
                  This is a <strong>paid order</strong> ({getPaymentMethodInfo({ paymentGatewayPrimary: selectedOrder?.paymentGatewayPrimary }).label}).
                  A finance approval request will be sent — finance must cancel in Shopify, create a credit note in ERPNext, and then approve in Cosmo OS.
                </>
              ) : (
                "This will immediately cancel the order in Shopify and void the ERP Sales Invoice if one exists. This action cannot be undone."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {needsApproval && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>Finance approval required — the order will remain active until finance confirms cancellation.</span>
            </div>
          )}
          <div className="py-1">
            <label className="mb-1.5 block text-sm font-medium" htmlFor="cancel-reason">
              Cancellation reason <span className="text-destructive">*</span>
            </label>
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Customer called to cancel — changed mind"
              className="min-h-20"
              maxLength={500}
              disabled={cancelling}
            />
            <p className="mt-1 text-xs text-muted-foreground">{cancelReason.trim().length}/500 — minimum 5 characters</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Back</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={cancelling || cancelReason.trim().length < 5}
              onClick={() => void handleCancel()}
            >
              {cancelling ? (
                <><Loader2 className="mr-2 size-4 animate-spin" />Processing...</>
              ) : needsApproval ? (
                "Send to Finance"
              ) : (
                "Confirm Cancel"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
