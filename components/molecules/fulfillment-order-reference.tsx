"use client";

import { cn } from "@/lib/utils";
import {
  resolveSourcePrimaryOrderRef,
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

  const primary = resolveSourcePrimaryOrderRef(order) || fallback;

  if (variant === "labeled") {
    return (
      <p className={cn(className)}>
        <span className="font-medium">Order:</span> {primary}
      </p>
    );
  }

  if (variant === "inline") {
    return <span className={className}>{primary}</span>;
  }

  return (
    <span className={className}>
      <span className="block font-medium">{primary}</span>
    </span>
  );
}
