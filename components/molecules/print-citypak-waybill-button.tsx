"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { citypakWaybillByIdPath, citypakWaybillDownloadPath } from "@/lib/citypak-api";

export function PrintCitypakWaybillButton({
  orderId,
  waybillId,
  tracking,
  variant = "outline",
  size = "sm",
}: {
  orderId?: string | null;
  waybillId?: string | null;
  tracking?: string | null;
  variant?: "outline" | "default";
  size?: "sm" | "default";
}) {
  const href = waybillId
    ? citypakWaybillByIdPath(waybillId)
    : orderId
      ? citypakWaybillDownloadPath(orderId)
      : "";
  if (!href) return null;
  return (
    <Button asChild variant={variant} size={size} className="gap-2">
      <a href={href} target="_blank" rel="noreferrer">
        <Printer className="size-4" aria-hidden />
        {tracking ? `Print ${tracking}` : "Print waybill"}
      </a>
    </Button>
  );
}

export function PrintCitypakWaybillPackButton({
  orderIds,
  waybillIds,
  label,
}: {
  orderIds: string[];
  waybillIds: string[];
  label?: string;
}) {
  const params = new URLSearchParams();
  if (orderIds.length) params.set("orderIds", orderIds.join(","));
  if (waybillIds.length) params.set("waybillIds", waybillIds.join(","));
  if (!orderIds.length && !waybillIds.length) return null;
  const count = orderIds.length + waybillIds.length;
  return (
    <Button asChild className="gap-2">
      <a
        href={`/api/admin/fulfillment/citypak-waybills/print-pack?${params.toString()}`}
        target="_blank"
        rel="noreferrer"
      >
        <Printer className="size-4" aria-hidden />
        {label ?? `Print all waybills (${count})`}
      </a>
    </Button>
  );
}
