"use client";

import { useEffect, useState } from "react";
import { Loader2, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
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
  }, [orderId]);

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
        // Optimistic local update to keep this panel responsive.
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
    <Card className="border-border/70 bg-card/95 shadow-sm">
      <CardHeader className="space-y-3">
        <CardTitle className="flex items-center gap-2">
          <Truck className="size-5" />
          Ready to Dispatch & Dispatch - Order {order.name ?? order.orderNumber ?? order.id}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Put packages on hold when needed, mark readiness, and dispatch via rider or courier.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-background/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Hold Status
            </p>
            <p className="mt-2 text-sm font-semibold">
              {isOnHold ? `On hold: ${packageStatus?.packageHoldReason?.name ?? "-"}` : "Not on hold"}
            </p>
          </div>
          <div className="rounded-xl border bg-background/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Package Readiness
            </p>
            <p className="mt-2 text-sm font-semibold">{isPackageReady ? "Ready to dispatch" : "Not ready"}</p>
          </div>
          <div className="rounded-xl border bg-background/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Dispatch Method
            </p>
            <p className="mt-2 text-sm font-semibold">
              {dispatchRiderId ? "Rider selected" : dispatchCourierId ? "Courier selected" : "Not selected"}
            </p>
          </div>
        </div>

        {packageStatus === null && lookups ? (
          <div className="rounded-xl border border-dashed px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Loading package status...
            </p>
          </div>
        ) : null}

        {lookups && packageStatus !== null ? (
          <>
            {!isPackageReady ? (
              <div className="rounded-xl border bg-background/80 p-4 sm:p-5">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Package Readiness
                </h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  Put this order on hold with a reason, or mark it ready to allow dispatch.
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  {isOnHold ? (
                    <>
                      <p className="text-sm text-muted-foreground">
                        On hold: {packageStatus.packageHoldReason?.name ?? "-"}
                      </p>
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
                    </>
                  ) : (
                    <>
                      <NativeSelect
                        value={holdReasonId}
                        onChange={(e) => setHoldReasonId(e.target.value)}
                        className="w-[220px] px-3"
                      >
                        <option value="">Put on hold...</option>
                        {lookups.packageHoldReasons.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </NativeSelect>
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
                      <Button onClick={() => doAction("mark_ready")} disabled={isBusy}>
                        {busyKey === "mark_ready" ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          "Package is Ready"
                        )}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border bg-background/80 p-4 sm:p-5">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Dispatch Assignment
                </h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  Select either a rider or courier service to complete dispatch.
                </p>

                <div className="flex flex-wrap gap-2">
                  <NativeSelect
                    value={dispatchRiderId}
                    onChange={(e) => {
                      setDispatchRiderId(e.target.value);
                      setDispatchCourierId("");
                    }}
                    className="w-[200px] px-3"
                  >
                    <option value="">Select rider</option>
                    {lookups.riders.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name ?? r.mobile ?? r.id}
                      </option>
                    ))}
                  </NativeSelect>
                  <NativeSelect
                    value={dispatchCourierId}
                    onChange={(e) => {
                      setDispatchCourierId(e.target.value);
                      setDispatchRiderId("");
                    }}
                    className="w-[200px] px-3"
                  >
                    <option value="">Or courier</option>
                    {lookups.courierServices.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </NativeSelect>
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
              </div>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
