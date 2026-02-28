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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Printer className="size-5" />
          Order Print — Order {order.name ?? order.orderNumber ?? order.id}
        </CardTitle>
        <p className="text-muted-foreground text-sm">
          Print the invoice. Mark package ready in Ready to Dispatch when the package is ready.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {perms.canPrint ? (
          <Button onClick={handlePrint} className="gap-2">
            <Printer className="size-4" />
            Print Invoice
          </Button>
        ) : (
          <p className="text-muted-foreground text-sm">
            You do not have permission to print invoices.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
