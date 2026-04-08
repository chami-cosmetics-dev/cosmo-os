"use client";

import { Printer } from "lucide-react";

import { useFulfillmentPermissions } from "@/components/contexts/fulfillment-permissions-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FulfillmentOrder } from "./fulfillment-order-selector";

interface FulfillmentPrintPanelProps {
  orderId: string | null;
  order: FulfillmentOrder | null;
  onRefresh?: () => void;
}

export function FulfillmentPrintPanel({
  orderId,
  order,
}: FulfillmentPrintPanelProps) {
  const perms = useFulfillmentPermissions();

  function handlePrint() {
    if (!orderId) return;
    window.open(`/api/admin/orders/${orderId}/invoice?print=1`, "_blank", "noopener");
  }

  if (!orderId || !order) return null;

  return (
    <Card className="overflow-hidden border-border/70 shadow-xs">
      <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent),color-mix(in_srgb,var(--primary)_8%,transparent))]">
        <CardTitle className="flex items-center gap-2">
          <Printer className="size-5 text-muted-foreground" />
          Order Print — Order {order.name ?? order.orderNumber ?? order.id}
        </CardTitle>
        <p className="text-muted-foreground text-sm">
          Print the invoice. Mark package ready in Ready to Dispatch when the package is ready.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {perms.canPrint ? (
          <div className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_96%,white),color-mix(in_srgb,var(--primary)_8%,transparent))] p-4 shadow-xs">
            <p className="text-muted-foreground mb-3 text-sm">
              Open the invoice in a new tab and use the browser print flow for the selected order.
            </p>
            <Button onClick={handlePrint} className="gap-2 shadow-[0_10px_24px_-18px_var(--primary)]">
              <Printer className="size-4" />
              Print Invoice
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            You do not have permission to print invoices.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
