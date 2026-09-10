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
  CITYPAK_DEFAULT_PRINT_LAYOUT,
  citypakWaybillByIdPath,
  citypakWaybillDownloadPath,
  type CitypakPrintLayout,
} from "@/lib/citypak-api";
import { cn } from "@/lib/utils";

export function PrintLayoutDialog({
  open,
  onOpenChange,
  onPrint,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPrint: (layout: CitypakPrintLayout) => void;
}) {
  const [layout, setLayout] = useState<CitypakPrintLayout>(CITYPAK_DEFAULT_PRINT_LAYOUT);

  const options: Array<{ value: CitypakPrintLayout; title: string; hint: string }> = [
    { value: "A4", title: "A4", hint: "4 waybills per sheet" },
    { value: "A5", title: "A5", hint: "1 waybill per sheet" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Print Size Options</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          {options.map((option) => {
            const selected = layout === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setLayout(option.value)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-md border-2 px-3 py-4 text-sm font-medium transition-colors",
                  selected
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40"
                )}
              >
                <span
                  className={cn(
                    "relative block rounded-sm border-2 border-current",
                    option.value === "A4" ? "h-16 w-12" : "h-12 w-9"
                  )}
                  aria-hidden
                >
                  {option.value === "A4" && (
                    <>
                      <span className="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-current" />
                      <span className="absolute inset-y-0 left-1/2 border-l-2 border-dashed border-current" />
                    </>
                  )}
                </span>
                {option.title}
                <span className="text-xs font-normal opacity-80">{option.hint}</span>
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              onPrint(layout);
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
  const basePath = waybillId
    ? citypakWaybillByIdPath(waybillId)
    : orderId
      ? citypakWaybillDownloadPath(orderId)
      : "";
  if (!basePath) return null;

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
      <PrintLayoutDialog
        open={open}
        onOpenChange={setOpen}
        onPrint={(layout) => openPdf(`${basePath}?layout=${layout}&t=${Date.now()}`)}
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
      <PrintLayoutDialog
        open={open}
        onOpenChange={setOpen}
        onPrint={(layout) => {
          const params = new URLSearchParams({ layout });
          if (orderIds.length) params.set("orderIds", orderIds.join(","));
          if (waybillIds.length) params.set("waybillIds", waybillIds.join(","));
          openPdf(`/api/admin/fulfillment/citypak-waybills/print-pack?${params.toString()}&t=${Date.now()}`);
        }}
      />
    </>
  );
}
