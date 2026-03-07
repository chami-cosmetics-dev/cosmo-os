"use client";

import { useState, useEffect } from "react";
import { Loader2, Truck } from "lucide-react";

import { useFulfillmentPermissions } from "@/components/contexts/fulfillment-permissions-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { notify } from "@/lib/notify";
import type { FulfillmentOrder } from "./fulfillment-order-selector";

type OrderPackageStatus = {
  packageReadyAt: string | null;
  packageOnHoldAt: string | null;
  packageHoldReason: { id: string; name: string } | null;
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
  const [dispatchRiderId, setDispatchRiderId] = useState("");
  const [dispatchCourierId, setDispatchCourierId] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const isBusy = busyKey !== null;
  const isOnHold = !!packageStatus?.packageOnHoldAt;
  const isPackageReady = !!packageStatus?.packageReadyAt;

  useEffect(() => {
    fetch("/api/admin/orders/fulfillment-lookups")
      .then((r) => r.json())
      .then((data) => setLookups(data))
      .catch(() => setLookups(null));
  }, []);

  useEffect(() => {
    if (!orderId) {
      setPackageStatus(null);
      return;
    }
    fetch(`/api/admin/orders/${orderId}`)
      .then((r) => r.json())
      .then((data) =>
        setPackageStatus({
          packageReadyAt: data.packageReadyAt ?? null,
          packageOnHoldAt: data.packageOnHoldAt ?? null,
          packageHoldReason: data.packageHoldReason ?? null,
        })
      )
      .catch(() => setPackageStatus(null));
  }, [orderId]); // Only refetch when orderId changes; local updates for hold/ready avoid refreshTrigger

  async function doAction(action: string, body?: Record<string, unknown>) {
    if (!orderId || !lookups) return;
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
      setHoldReasonId("");
      setDispatchRiderId("");
      setDispatchCourierId("");
      if (action === "dispatch") {
        onRefresh(true);
      } else {
        // Optimistic local update — avoid parent re-render and order list refetch
        const now = new Date().toISOString();
        if (action === "put_on_hold" && body?.holdReasonId) {
          const reason = lookups.packageHoldReasons.find((r) => r.id === body.holdReasonId);
          setPackageStatus({
            packageReadyAt: null,
            packageOnHoldAt: now,
            packageHoldReason: reason ? { id: reason.id, name: reason.name } : null,
          });
        } else if (action === "revert_hold") {
          setPackageStatus({
            packageReadyAt: null,
            packageOnHoldAt: null,
            packageHoldReason: null,
          });
        } else if (action === "mark_ready") {
          setPackageStatus({
            packageReadyAt: now,
            packageOnHoldAt: null,
            packageHoldReason: null,
          });
        }
      }
    } catch {
      notify.error("Action failed");
    } finally {
      setBusyKey(null);
    }
  }

  if (!orderId || !order) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="size-5" />
          Ready to Dispatch & Dispatch — Order {order.name ?? order.orderNumber ?? order.id}
        </CardTitle>
        <p className="text-muted-foreground text-sm">
          Put package on hold if needed, or dispatch via rider or courier.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {packageStatus === null && lookups && (
          <p className="text-muted-foreground text-sm">Loading package status…</p>
        )}
        {lookups && packageStatus !== null && (
          <>
            {!isPackageReady && (perms.canPutOnHold || perms.canRevertHold || perms.canMarkReady) && (
              <div className="flex flex-wrap items-center gap-2">
                {isOnHold ? (
                <>
                  <p className="text-muted-foreground text-sm">
                    On hold: {packageStatus.packageHoldReason?.name ?? "—"}
                  </p>
                  {perms.canRevertHold && (
                    <Button
                      variant="outline"
                      onClick={() => doAction("revert_hold", { action: "revert_hold" })}
                      disabled={isBusy}
                    >
                      {busyKey === "revert_hold" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        "Revert Hold"
                      )}
                    </Button>
                  )}
                </>
              ) : (
                <>
                  {perms.canPutOnHold && (
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
                          doAction("put_on_hold", {
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
                  {perms.canMarkReady && (
                    <Button
                      onClick={() => doAction("mark_ready")}
                      disabled={isBusy}
                    >
                      {busyKey === "mark_ready" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        "Package is Ready"
                      )}
                    </Button>
                  )}
                </>
              )}
              </div>
            )}
            <div className={!isPackageReady ? "border-t pt-4" : ""}>
              {isPackageReady && perms.canDispatch ? (
                <div className="flex flex-wrap gap-2">
                  <select
                    value={dispatchRiderId}
                    onChange={(e) => {
                      setDispatchRiderId(e.target.value);
                      setDispatchCourierId("");
                    }}
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
                    onChange={(e) => {
                      setDispatchCourierId(e.target.value);
                      setDispatchRiderId("");
                    }}
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
                      doAction("dispatch", {
                        action: "dispatch",
                        riderId: dispatchRiderId || undefined,
                        courierServiceId: dispatchCourierId || undefined,
                      })
                    }
                    disabled={isBusy || (!dispatchRiderId && !dispatchCourierId)}
                  >
                    {busyKey === "dispatch" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Truck className="size-4" />
                    )}
                    Dispatch
                  </Button>
                </div>
              ) : isPackageReady && !perms.canDispatch ? (
                <p className="text-muted-foreground text-sm">
                  You do not have permission to dispatch orders.
                </p>
              ) : (
                <p className="text-muted-foreground text-sm">
                  To dispatch you need to mark the package readiness.
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
