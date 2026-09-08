"use client";

import { useState } from "react";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CITYPAK_DEFAULT_WAYBILL_PRINT_SIZE,
  citypakWaybillByIdPath,
  citypakWaybillDownloadPath,
  type CitypakWaybillPrintSize,
} from "@/lib/citypak-api";
import { cn } from "@/lib/utils";

function PrintSizePicker({
  open,
  onOpenChange,
  onPrint,
  title = "Print Size Options",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPrint: (printSize: CitypakWaybillPrintSize) => void;
  title?: string;
}) {
  const [printSize, setPrintSize] = useState<CitypakWaybillPrintSize>(
    CITYPAK_DEFAULT_WAYBILL_PRINT_SIZE
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <button
            type="button"
            onClick={() => setPrintSize("A4")}
            className={cn(
              "flex flex-col items-center gap-2 rounded-md border-2 px-3 py-5 text-sm font-medium transition-colors",
              printSize === "A4"
                ? "border-primary bg-primary/5 text-primary"
                : "border-border text-muted-foreground hover:border-primary/40"
            )}
          >
            <span
              className="block h-14 w-10 rounded-sm border-2 border-current"
              aria-hidden
            />
            A4
            <span className="text-xs font-normal opacity-80">4 labels / sheet</span>
          </button>
          <button
            type="button"
            onClick={() => setPrintSize("4x6")}
            className={cn(
              "flex flex-col items-center gap-2 rounded-md border-2 px-3 py-5 text-sm font-medium transition-colors",
              printSize === "4x6"
                ? "border-primary bg-primary/5 text-primary"
                : "border-border text-muted-foreground hover:border-primary/40"
            )}
          >
            <span
              className="block h-14 w-9 rounded-sm border-2 border-current"
              aria-hidden
            />
            4 × 6 Labels
            <span className="text-xs font-normal opacity-80">thermal size</span>
          </button>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              onPrint(printSize);
              onOpenChange(false);
            }}
          >
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function openPdf(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

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
  const [open, setOpen] = useState(false);
  const baseHref = waybillId
    ? citypakWaybillByIdPath(waybillId)
    : orderId
      ? citypakWaybillDownloadPath(orderId)
      : "";
  if (!baseHref) return null;

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className="gap-2"
        onClick={() => setOpen(true)}
      >
        <Printer className="size-4" aria-hidden />
        {tracking ? `Print ${tracking}` : "Print waybill"}
      </Button>
      <PrintSizePicker
        open={open}
        onOpenChange={setOpen}
        onPrint={(printSize) => {
          const params = new URLSearchParams({ printSize });
          openPdf(`${baseHref}?${params.toString()}`);
        }}
      />
    </>
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
  const [open, setOpen] = useState(false);
  if (!orderIds.length && !waybillIds.length) return null;
  const count = orderIds.length + waybillIds.length;

  return (
    <>
      <Button type="button" className="gap-2" onClick={() => setOpen(true)}>
        <Printer className="size-4" aria-hidden />
        {label ?? `Print all waybills (${count})`}
      </Button>
      <PrintSizePicker
        open={open}
        onOpenChange={setOpen}
        onPrint={(printSize) => {
          const params = new URLSearchParams({ printSize });
          if (orderIds.length) params.set("orderIds", orderIds.join(","));
          if (waybillIds.length) params.set("waybillIds", waybillIds.join(","));
          openPdf(`/api/admin/fulfillment/citypak-waybills/print-pack?${params.toString()}`);
        }}
      />
    </>
  );
}
