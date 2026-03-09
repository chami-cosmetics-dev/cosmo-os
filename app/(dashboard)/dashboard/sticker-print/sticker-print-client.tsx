"use client";

import { useMemo, useState } from "react";

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
}

function formatDate(dateLike: string) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return dateLike;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function formatPrice(price: string) {
  const n = Number(price);
  if (!Number.isFinite(n)) return price;
  return n.toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getLocationRefNumber(locationReference: string | null) {
  if (!locationReference) return "-";
  const digits = locationReference.replace(/\D/g, "");
  return digits || "-";
}

export function StickerPrintClient({ batches }: StickerPrintClientProps) {
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<BatchDetail | null>(null);

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

      <Card className="no-print">
        <CardHeader>
          <CardTitle>Sticker Print Preview</CardTitle>
          <p className="text-muted-foreground text-sm">
            Select a saved sticker batch to preview and print labels.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="min-w-[260px] flex-1 space-y-2">
            <label className="text-sm font-medium">Batch Name</label>
            <Select
              value={selectedBatchId || undefined}
              onValueChange={(value) => void handleLoadBatch(value)}
            >
              <SelectTrigger>
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
            variant="outline"
            onClick={() => window.print()}
            disabled={!detail || stickers.length === 0}
          >
            Print
          </Button>
        </CardContent>
      </Card>

      {loading && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Loading preview...
          </CardContent>
        </Card>
      )}

      {!loading && detail && stickers.length === 0 && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No sticker items found for this batch.
          </CardContent>
        </Card>
      )}

      {!loading && detail && stickers.length > 0 && (
        <div className="sticker-sheet flex flex-wrap gap-2 top-">
          {stickers.map((item) => (
            <div
              key={item.id}
              className="sticker-card rounded-md border border-black/30 bg-lime-300 p-3 text-black shadow-sm"
            >
              <div className="flex items-start justify-between text-[8px] leading-tight">
                <div className="font-bold">
                  <div>
                    <span>MFD:</span> {formatDate(item.manufactureDate)}
                  </div>
                  <div>
                    <span>EXP:</span> {formatDate(item.expireDate)}
                  </div>
                  <div>
                    <span>Code:</span> {item.itemCode}
                  </div>
                  <div>
                    <span>Ref:</span>{" "}
                    {getLocationRefNumber(item.locationReference)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-extrabold">{detail.supplierName}</div>
                  <div className="mt-0.5 text-[14px] font-extrabold leading-none">
                    MRP
                  </div>
                  <div className="text-[18px] font-extrabold leading-none">
                    {formatPrice(item.unitPrice)}
                  </div>
                </div>
              </div>

              <div className="mt-0 text-center text-[10px] font-extrabold uppercase leading-none">
                {detail.companyName || "COMPANY"}
              </div>

              <div className="mt-0 text-center text-[8px] font-bold leading-tight uppercase">
                {item.locationAddress || detail.companyAddress || "-"}
              </div>
              <div className="text-center text-[9px] font-bold leading-tight">
                {item.locationPhone || "-"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
