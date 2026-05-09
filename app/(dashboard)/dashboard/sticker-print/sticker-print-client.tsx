"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Printer } from "lucide-react";
import Link from "next/link";

import { StickerPreviewCard } from "@/components/organisms/sticker-preview-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { notify } from "@/lib/notify";

type BatchOption = {
  id: string;
  batchName: string;
};

type StickerItem = {
  id: string;
  itemCode: string;
  itemName: string;
  unitPrice: string;
  quantity: number;
  manufactureDate: string;
  expireDate: string;
  locationReference: string | null;
  locationName: string | null;
  locationAddress: string | null;
  locationPhone: string | null;
};

type BatchDetail = {
  id: string;
  batchName: string;
  batchDate: string;
  supplierName: string;
  companyName: string;
  companyAddress: string;
  items: StickerItem[];
};

interface StickerPrintClientProps {
  batches: BatchOption[];
  initialSelectedBatchId?: string;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Colombo",
  }).format(date);
}

export function StickerPrintClient({
  batches,
  initialSelectedBatchId = "",
}: StickerPrintClientProps) {
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const initialBatchAppliedRef = useRef(false);

  async function handleLoadBatch(id: string) {
    setSelectedBatchId(id);
    setDetail(null);
    if (!id) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/sticker-batches/${id}`);
      const data = (await res.json()) as BatchDetail & { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to load sticker preview data");
        return;
      }
      setDetail(data);
    } catch {
      notify.error("Failed to load sticker preview data");
    } finally {
      setLoading(false);
    }
  }

  const stickers = useMemo(() => detail?.items ?? [], [detail]);

  useEffect(() => {
    if (initialBatchAppliedRef.current) return;
    const targetBatchId = initialSelectedBatchId.trim();
    if (!targetBatchId) {
      initialBatchAppliedRef.current = true;
      return;
    }
    const exists = batches.some((batch) => batch.id === targetBatchId);
    if (!exists) return;
    initialBatchAppliedRef.current = true;
    void handleLoadBatch(targetBatchId);
  }, [initialSelectedBatchId, batches]);

  async function waitForStickerAssets() {
    if (typeof document === "undefined") return;

    // Ensure web fonts are ready before opening print dialog.
    if ("fonts" in document) {
      await (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready;
    }

  }

  async function handlePrint() {
    await waitForStickerAssets();
    window.print();
  }

  return (
    <div className="space-y-6" data-print-root="stickers">
      <style jsx global>{`
        @media print {
          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            min-height: 0 !important;
            background: white !important;
          }
          body * {
            visibility: hidden !important;
          }
          [data-print-root="stickers"],
          [data-print-root="stickers"] * {
            visibility: visible !important;
          }
          [data-print-root="stickers"] {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .no-print {
            display: none !important;
          }
          @page {
            margin: 0;
          }
          [data-slot="sidebar"],
          [data-slot="sidebar-gap"],
          [data-slot="sidebar-container"] {
            display: none !important;
          }
          [data-slot="sidebar-wrapper"],
          [data-slot="sidebar-inset"],
          [data-slot="sidebar-inset"] > div {
            display: block !important;
            min-height: auto !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
          }
          [data-slot="sidebar-inset"] > header {
            display: none !important;
          }
          .sticker-sheet {
            display: flex !important;
            flex-wrap: wrap !important;
            align-content: flex-start !important;
            gap: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            break-after: auto !important;
            page-break-after: auto !important;
          }
          .sticker-card {
            display: inline-block !important;
            width: 2in !important;
            height: 1in !important;
            background: #d9f56b !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            break-after: avoid-page !important;
            page-break-after: avoid !important;
            margin: 0 !important;
            padding: 0.08in 0.125in 0.125in !important;
            overflow: hidden !important;
          }
        }
        .sticker-card {
          width: 2in;
          height: 1in;
          overflow: hidden;
        }
      `}</style>

      <section className="no-print relative overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-5 shadow-[0_18px_40px_-28px_var(--primary)] sm:p-6">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.4),transparent_65%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent_65%)]" />
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
          Inventory
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          <Printer className="size-5 text-muted-foreground" />
          Sticker Print
        </h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm sm:text-base">
          Load a saved sticker batch, review the sheet layout, and print labels when everything looks correct.
        </p>
      </section>

      <Card className="no-print overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="space-y-2 border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent),color-mix(in_srgb,var(--primary)_8%,transparent))]">
          <CardTitle className="flex items-center gap-2">
            <Printer className="size-5 text-muted-foreground" />
            Sticker Print Preview
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            Select a saved sticker batch to preview and print labels.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[260px] flex-1 space-y-2">
              <label className="text-sm font-medium">Batch Name</label>
              <Select
                value={selectedBatchId || undefined}
                onValueChange={(value) => void handleLoadBatch(value)}
              >
                <SelectTrigger className="border-border/70 bg-background/90">
                  <SelectValue placeholder="Select sticker batch" />
                </SelectTrigger>
                <SelectContent>
                  {batches.map((batch) => (
                    <SelectItem key={batch.id} value={batch.id}>
                      {batch.batchName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              onClick={() => void handlePrint()}
              disabled={!detail || stickers.length === 0}
              className="shadow-[0_10px_24px_-18px_var(--primary)]"
            >
              Print Stickers
            </Button>
            <Button asChild type="button" variant="outline" className="border-border/70 bg-background/85 hover:bg-secondary/10">
              <Link href="/dashboard/sticker-batch?tab=history">Open Batch History</Link>
            </Button>
          </div>

          {detail && (
            <div className="grid gap-3 rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_96%,white),color-mix(in_srgb,var(--secondary)_8%,transparent))] p-3 shadow-xs md:grid-cols-4">
              <div className="rounded-xl border border-border/70 bg-background/90 p-3 shadow-xs">
                <p className="text-xs text-muted-foreground">Batch</p>
                <p className="text-sm font-medium">{detail.batchName}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/90 p-3 shadow-xs">
                <p className="text-xs text-muted-foreground">Batch Date</p>
                <p className="text-sm font-medium">{formatDate(detail.batchDate)}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/90 p-3 shadow-xs">
                <p className="text-xs text-muted-foreground">Supplier</p>
                <p className="text-sm font-medium">{detail.supplierName || "-"}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/90 p-3 shadow-xs">
                <p className="text-xs text-muted-foreground">Sticker Count</p>
                <p className="text-sm font-medium">{stickers.length}</p>
              </div>
            </div>
          )}

          {batches.length === 0 && (
            <div className="rounded-xl border border-dashed border-border/70 bg-background/85 p-4 text-sm text-muted-foreground">
              No saved sticker batches found. Create a batch first from Sticker Batch.
            </div>
          )}
        </CardContent>
      </Card>

      {!loading && !detail && batches.length > 0 && (
        <Card className="overflow-hidden border-border/70 shadow-xs">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Select a batch to load sticker preview.
          </CardContent>
        </Card>
      )}

      {loading && (
        <Card className="overflow-hidden border-border/70 shadow-xs">
          <CardContent className="py-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading preview...
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && detail && stickers.length === 0 && (
        <Card className="overflow-hidden border-border/70 shadow-xs">
          <CardContent className="py-6 text-sm text-muted-foreground">
            No sticker items found for this batch.
          </CardContent>
        </Card>
      )}

      {!loading && detail && stickers.length > 0 && (
        <div className="sticker-sheet flex flex-wrap gap-2">
          {stickers.map((item) => (
            <StickerPreviewCard
              key={item.id}
              manufactureDate={item.manufactureDate}
              expireDate={item.expireDate}
              itemCode={item.itemCode}
              itemName={item.itemName}
              unitPrice={item.unitPrice}
              locationReference={item.locationReference}
              supplierName={detail.supplierName}
              companyName={detail.companyName}
              locationAddress={item.locationAddress}
              companyAddress={detail.companyAddress}
              locationPhone={item.locationPhone}
            />
          ))}
        </div>
      )}
    </div>
  );
}
