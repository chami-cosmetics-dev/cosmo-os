"use client";

import { cn } from "@/lib/utils";
import {
  formatFulfillmentOrderReferenceText,
  resolveErpOrderRef,
  resolveShopifyOrderRef,
  type FulfillmentOrderRefInput,
} from "@/lib/fulfillment-order-reference";

type Variant = "stack" | "labeled" | "inline";

type FulfillmentOrderReferenceProps = {
  order: FulfillmentOrderRefInput | null | undefined;
  variant?: Variant;
  className?: string;
  fallback?: string;
};

export function FulfillmentOrderReference({
  order,
  variant = "stack",
  className,
  fallback = "—",
}: FulfillmentOrderReferenceProps) {
  if (!order) {
    return <span className={className}>{fallback}</span>;
  }

  const shopify = resolveShopifyOrderRef(order);
  const erp = resolveErpOrderRef(order);

  if (variant === "inline") {
    return (
      <span className={className}>{formatFulfillmentOrderReferenceText(order)}</span>
    );
  }

  if (variant === "labeled") {
    if (!shopify && !erp) {
      return <p className={className}>{fallback}</p>;
    }

    return (
      <div className={cn("space-y-1", className)}>
        {shopify && (
          <p>
            <span className="font-medium">Shopify:</span> {shopify}
          </p>
        )}
        {erp && (
          <p>
            <span className="font-medium">ERP:</span>{" "}
            <span className="font-mono">{erp}</span>
          </p>
        )}
      </div>
    );
  }

  const primary = shopify ?? erp ?? order.id ?? fallback;
  const showErpSecondary = Boolean(erp && erp !== primary);

  return (
    <span className={className}>
      <span className="block font-medium">{primary}</span>
      {showErpSecondary && (
        <span className="mt-0.5 block font-mono text-xs text-muted-foreground">{erp}</span>
      )}
    </span>
  );
}
