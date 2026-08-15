"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2, Link2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";

export type ReplaceLinkOrderRef = {
  id: string;
  orderLabel: string;
  name?: string | null;
  orderNumber?: string | null;
  erpnextInvoiceId?: string | null;
  cancelledAt?: string | null;
};

type OrderReplaceLinkPanelProps = {
  orderId: string;
  isCancelled: boolean;
  canEdit: boolean;
  replacedByOrder: ReplaceLinkOrderRef | null | undefined;
  replacedFromOrders: ReplaceLinkOrderRef[] | null | undefined;
  onSaved: () => void;
};

export function OrderReplaceLinkPanel({
  orderId,
  isCancelled,
  canEdit,
  replacedByOrder,
  replacedFromOrders,
  onSaved,
}: OrderReplaceLinkPanelProps) {
  const [value, setValue] = useState(replacedByOrder?.orderLabel ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setValue(replacedByOrder?.orderLabel ?? "");
  }, [replacedByOrder?.id, replacedByOrder?.orderLabel, orderId]);

  const predecessors = replacedFromOrders ?? [];
  const showOutgoing = isCancelled || Boolean(replacedByOrder);
  const showIncoming = predecessors.length > 0;

  if (!showOutgoing && !showIncoming) return null;

  async function save(next: string | null) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/replaced-by`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replacedByOrderNumber: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(typeof data.error === "string" ? data.error : "Failed to update replace link");
        return;
      }
      notify.success(next === null ? "Replacement link cleared." : "Replacement link saved.");
      onSaved();
    } catch {
      notify.error("Failed to update replace link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border p-4 text-sm space-y-3">
      <h4 className="flex items-center gap-2 text-sm font-medium">
        <Link2 className="size-4" />
        Order replace link
      </h4>

      {showOutgoing ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">
            {isCancelled
              ? "Link this cancelled order to the ERP/Cosmo order that replaced it."
              : "Replacement order for this cancelled source."}
          </p>
          {canEdit && isCancelled ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Replacement order number"
                disabled={busy}
                aria-label="Replacement order number"
                className="sm:flex-1"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || !value.trim()}
                  onClick={() => void save(value.trim())}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : "Save"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || !replacedByOrder}
                  onClick={() => void save(null)}
                >
                  Clear
                </Button>
              </div>
            </div>
          ) : replacedByOrder ? (
            <p>
              Replaced by:{" "}
              <Link
                href={`/dashboard/orders?orderId=${replacedByOrder.id}`}
                className="font-medium text-blue-600 underline"
              >
                {replacedByOrder.orderLabel}
              </Link>
            </p>
          ) : isCancelled ? (
            <p className="text-muted-foreground text-xs">No replacement linked.</p>
          ) : null}
          {canEdit && isCancelled && replacedByOrder ? (
            <p className="text-xs text-muted-foreground">
              Current:{" "}
              <Link
                href={`/dashboard/orders?orderId=${replacedByOrder.id}`}
                className="text-blue-600 underline"
              >
                {replacedByOrder.orderLabel}
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      {showIncoming ? (
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">Supersedes cancelled order(s)</p>
          <ul className="space-y-1">
            {predecessors.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/dashboard/orders?orderId=${row.id}`}
                  className="font-medium text-blue-600 underline"
                >
                  {row.orderLabel}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
