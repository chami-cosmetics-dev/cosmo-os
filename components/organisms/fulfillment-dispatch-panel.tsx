"use client";

import { useEffect, useState } from "react";
import { Loader2, Truck } from "lucide-react";

import { useFulfillmentPermissions } from "@/components/contexts/fulfillment-permissions-context";
import { FulfillmentOrderReference } from "@/components/molecules/fulfillment-order-reference";
import { OrderShippingLine } from "@/components/molecules/order-shipping-line";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import {
  DISPATCH_CUSTOMER_PICKUP,
  dispatchSelectionToApiBody,
  parseDispatchService,
} from "@/lib/order-dispatch";
import { isExplicitlyPackageReady } from "@/lib/fulfillment-stage-display";
import type { FulfillmentOrder } from "./fulfillment-order-selector";

type OrderPackageStatus = {
  packageReadyAt: string | null;
  lastPrintedAt: string | null;
  packageOnHoldAt: string | null;
  packageHoldReason: { id: string; name: string } | null;
};

type DispatchOrderDetail = {
  id: string;
  name: string | null;
  orderNumber: string | null;
  totalPrice: string;
  currency: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  shippingAddress: unknown;
  totalShipping?: string | null;
  shippingRuleLabel?: string | null;
  lineItems: Array<{
    id: string;
    productTitle: string;
    variantTitle: string | null;
    sku: string | null;
    quantity: number;
    price: string;
    total: string;
  }>;
};

interface FulfillmentDispatchPanelProps {
  orderId: string | null;
  order: FulfillmentOrder | null;
  onRefresh: (clearSelection?: boolean) => void;
}

export function FulfillmentDispatchPanel({
  orderId,
  order,
  onRefresh,
}: FulfillmentDispatchPanelProps) {
  const perms = useFulfillmentPermissions();
  const [lookups, setLookups] = useState<{
    packageHoldReasons: Array<{ id: string; name: string }>;
    courierServices: Array<{ id: string; name: string }>;
    riders: Array<{ id: string; name: string | null; mobile: string | null }>;
  } | null>(null);
  const [packageStatus, setPackageStatus] = useState<OrderPackageStatus | null>(null);
  const [holdReasonId, setHoldReasonId] = useState("");
  const [dispatchService, setDispatchService] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<DispatchOrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const isBusy = busyKey !== null;
  const isOnHold = !!packageStatus?.packageOnHoldAt;
  const isPackageReady = packageStatus
    ? isExplicitlyPackageReady({
        packageReadyAt: packageStatus.packageReadyAt,
        lastPrintedAt: packageStatus.lastPrintedAt,
      })
    : false;

  useEffect(() => {
    fetch("/api/admin/orders/fulfillment-lookups")
      .then((r) => r.json())
      .then((data) => setLookups(data))
      .catch(() => setLookups(null));
  }, []);

  useEffect(() => {
    if (!orderId) {
      setPackageStatus(null);
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    fetch(`/api/admin/orders/${orderId}`)
      .then((r) => r.json())
      .then((data) => {
        setDetail(data);
        setPackageStatus({
          packageReadyAt: data.packageReadyAt ?? null,
          lastPrintedAt: data.lastPrintedAt ?? null,
          packageOnHoldAt: data.packageOnHoldAt ?? null,
          packageHoldReason: data.packageHoldReason ?? null,
        });
      })
      .catch(() => {
        setDetail(null);
        setPackageStatus(null);
      })
      .finally(() => setDetailLoading(false));
  }, [orderId]);

  async function doAction(action: string, body?: Record<string, unknown>, opts?: { silent?: boolean }): Promise<boolean> {
    if (!orderId || !lookups) return false;
    setBusyKey(action);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/fulfillment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? { action }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Action failed");
        return false;
      }
      if (!opts?.silent) notify.success("Updated.");
      setHoldReasonId("");
      setDispatchService("");
      if (action === "dispatch") {
        onRefresh(true);
        return true;
      }
      if (action === "mark_ready") {
        onRefresh(false);
      }

      const now = new Date().toISOString();
      if (action === "put_on_hold" && body?.holdReasonId) {
        const reason = lookups.packageHoldReasons.find((r) => r.id === body.holdReasonId);
        setPackageStatus({
          packageReadyAt: null,
          packageOnHoldAt: now,
          packageHoldReason: reason ? { id: reason.id, name: reason.name } : null,
        });
      } else if (action === "revert_hold") {
        setPackageStatus({ packageReadyAt: null, packageOnHoldAt: null, packageHoldReason: null });
      } else if (action === "mark_ready") {
        setPackageStatus({ packageReadyAt: now, packageOnHoldAt: null, packageHoldReason: null });
      }
      return true;
    } catch {
      notify.error("Action failed");
      return false;
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDispatch() {
    if (!orderId || !lookups || !selectedDispatchService) return;
    await doAction("dispatch", {
      action: "dispatch",
      ...dispatchSelectionToApiBody(selectedDispatchService),
    });
  }

  function formatPrice(value?: string | null, currency?: string | null) {
    if (value == null) return "-";
    const amount = Number.parseFloat(value);
    if (Number.isNaN(amount)) return value;
    return amount.toLocaleString("en-LK", { minimumFractionDigits: 2 }) + (currency ? ` ${currency}` : "");
  }

  function formatAddress(addr: unknown) {
    if (!addr || typeof addr !== "object") return "-";
    const a = addr as Record<string, unknown>;
    const parts = [
      a.address1,
      a.address2,
      [a.city, a.province_code].filter(Boolean).join(", "),
      a.country,
      a.zip,
    ].filter(Boolean) as string[];
    return parts.join(", ") || "-";
  }

  const currency = detail?.currency ?? order?.currency;
  const selectedDispatchService = parseDispatchService(dispatchService);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Truck className="size-5 text-muted-foreground" aria-hidden />
          Dispatch
        </h2>
        <p className="text-muted-foreground text-sm">
          {order ? (
            <>
              Order <FulfillmentOrderReference order={order} variant="inline" />
            </>
          ) : (
            "Select an order to fill details"
          )}
        </p>
      </div>

      <div className="relative grid gap-3 rounded-md border border-border/70 p-3 text-sm lg:grid-cols-2">
        {detailLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <div className="flex items-center gap-2 rounded-md border border-border/70 bg-background px-3 py-2 text-xs text-muted-foreground shadow-sm">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Loading order details...
            </div>
          </div>
        )}
        <div className="space-y-1">
          <FulfillmentOrderReference order={order} variant="labeled" />
          <p><span className="font-medium">Email:</span> {detail?.customerEmail ?? order?.customerEmail ?? "-"}</p>
          <p><span className="font-medium">Phone:</span> {detail?.customerPhone ?? order?.customerPhone ?? (detail?.shippingAddress as Record<string, string> | null)?.phone ?? "-"}</p>
          <p><span className="font-medium">Address:</span> {formatAddress(detail?.shippingAddress)}</p>
          <OrderShippingLine
            prefix="Delivery:"
            shippingRuleLabel={detail?.shippingRuleLabel}
            totalShipping={detail?.totalShipping}
            currency={currency}
            formatPrice={formatPrice}
          />
        </div>
        <div className="space-y-1">
          <p><span className="font-medium">Order date:</span> {order ? new Date(order.createdAt).toLocaleString("en-LK") : "-"}</p>
          <p><span className="font-medium">Total:</span> {formatPrice(detail?.totalPrice ?? order?.totalPrice, currency)}</p>
          <p><span className="font-medium">Status:</span> {isOnHold ? `On hold: ${packageStatus?.packageHoldReason?.name ?? "-"}` : isPackageReady ? "Ready" : "-"}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-border/70">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b border-border/70">
              <th className="px-3 py-2 text-left font-medium">Item</th>
              <th className="px-3 py-2 text-left font-medium">SKU</th>
              <th className="px-3 py-2 text-right font-medium">Qty</th>
              <th className="px-3 py-2 text-right font-medium">Price</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {(detail?.lineItems ?? []).map((item) => (
              <tr key={item.id} className="border-b border-border/50 last:border-0">
                <td className="px-3 py-2 font-medium">
                  {item.productTitle}
                  {item.variantTitle && <span className="text-muted-foreground"> / {item.variantTitle}</span>}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{item.sku ?? "-"}</td>
                <td className="px-3 py-2 text-right">{item.quantity}</td>
                <td className="px-3 py-2 text-right">{formatPrice(item.price, currency)}</td>
                <td className="px-3 py-2 text-right">{formatPrice(item.total, currency)}</td>
              </tr>
            ))}
            {(!detail || detail.lineItems.length === 0) && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  {order ? "No invoice items loaded." : "Select an order to view items."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {lookups && (!orderId || packageStatus !== null) && (
        <div className="flex flex-wrap items-end gap-3 rounded-md border border-border/70 p-3">
          {isOnHold ? (
            <>
              <p className="flex-1 text-sm text-muted-foreground">
                On hold: {packageStatus.packageHoldReason?.name ?? "-"}
              </p>
              {perms.canRevertHold && (
                <Button
                  variant="outline"
                  onClick={() => void doAction("revert_hold", { action: "revert_hold" })}
                  disabled={isBusy}
                >
                  {busyKey === "revert_hold" ? <Loader2 className="size-4 animate-spin" /> : "Revert Hold"}
                </Button>
              )}
            </>
          ) : (
            <>
              {perms.canPutOnHold && lookups.packageHoldReasons.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Put on hold (optional)</p>
                  <select
                    value={holdReasonId}
                    onChange={(e) => setHoldReasonId(e.target.value)}
                    disabled={!orderId || isBusy}
                    className="h-9 w-50 rounded-md border border-border/70 bg-background/90 px-3 text-sm"
                  >
                    <option value="">No hold</option>
                    {lookups.packageHoldReasons.map((reason) => (
                      <option key={reason.id} value={reason.id}>{reason.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {!holdReasonId && perms.canDispatch && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Dispatch via</p>
                  <select
                    value={dispatchService}
                    onChange={(e) => setDispatchService(e.target.value)}
                    disabled={!orderId || isBusy}
                    className="h-9 w-60 rounded-md border border-border/70 bg-background/90 px-3 text-sm"
                  >
                    <option value="">Select rider, courier, or pickup</option>
                    <option value={DISPATCH_CUSTOMER_PICKUP}>Customer pickup (in-store)</option>
                    {lookups.riders.length > 0 && (
                      <optgroup label="Riders">
                        {lookups.riders.map((rider) => (
                          <option key={rider.id} value={`rider:${rider.id}`}>
                            {rider.name ?? rider.mobile ?? rider.id}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {lookups.courierServices.length > 0 && (
                      <optgroup label="Courier services">
                        {lookups.courierServices.map((courier) => (
                          <option key={courier.id} value={`courier:${courier.id}`}>
                            {courier.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              )}

              {holdReasonId && perms.canPutOnHold ? (
                <Button
                  variant="outline"
                  onClick={() => void doAction("put_on_hold", { action: "put_on_hold", holdReasonId })}
                  disabled={!orderId || isBusy}
                >
                  {busyKey === "put_on_hold" ? <Loader2 className="size-4 animate-spin" /> : "Put on Hold"}
                </Button>
              ) : (
                <>
                  {!isPackageReady && perms.canMarkReady && (
                    <Button
                      variant="outline"
                      onClick={() => void doAction("mark_ready", { action: "mark_ready" })}
                      disabled={!orderId || isBusy}
                    >
                      {busyKey === "mark_ready" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        "Package Ready"
                      )}
                    </Button>
                  )}
                  {perms.canDispatch && (
                    <Button
                      onClick={() => void handleDispatch()}
                      disabled={!orderId || isBusy || !selectedDispatchService}
                      className="gap-2"
                    >
                      {busyKey === "dispatch"
                        ? <Loader2 className="size-4 animate-spin" />
                        : <Truck className="size-4" />}
                      Dispatch
                    </Button>
                  )}
                  {!perms.canDispatch && (
                    <p className="text-sm text-muted-foreground">You do not have permission to dispatch orders.</p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
