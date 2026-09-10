"use client";

import { useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, ExternalLink, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { FIXED_COMPETITORS } from "@/lib/market-prices/competitors";
import { notify } from "@/lib/notify";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sku?: string;
  onSuccess?: () => void;
};

export function LinkCompetitorDialog({
  open,
  onOpenChange,
  sku: initialSku,
  onSuccess,
}: Props) {
  const [sku, setSku] = useState(initialSku ?? "");
  const [competitorSlug, setCompetitorSlug] = useState<string>(
    FIXED_COMPETITORS[0].slug,
  );
  const [productUrl, setProductUrl] = useState("");
  const [competitorTitle, setCompetitorTitle] = useState("");
  const [listedPriceLkr, setListedPriceLkr] = useState("");
  const [inStock, setInStock] = useState(true);
  const [checkDate, setCheckDate] = useState(() => formatAppIsoDate(new Date()));
  const [notes, setNotes] = useState("");

  const [sizeMismatchWarning, setSizeMismatchWarning] = useState<string | null>(null);
  const [sizeMismatchConfirmed, setSizeMismatchConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setSku(initialSku ?? "");
      setSizeMismatchWarning(null);
      setSizeMismatchConfirmed(false);
    }
  }, [open, initialSku]);

  const handleSubmit = async (overrideConfirm = false) => {
    if (!sku.trim()) {
      notify.error("Please enter a SKU");
      return;
    }
    if (!productUrl.trim()) {
      notify.error("Please enter the competitor product URL");
      return;
    }
    if (!competitorTitle.trim()) {
      notify.error("Please enter the competitor product title");
      return;
    }
    const priceNum = parseFloat(listedPriceLkr);
    if (isNaN(priceNum) || priceNum <= 0) {
      notify.error("Please enter a valid price in LKR");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/purchasing/market-prices/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: sku.trim(),
          competitorSlug,
          productUrl: productUrl.trim(),
          competitorTitle: competitorTitle.trim(),
          listedPriceLkr: priceNum,
          inStock,
          checkDate,
          notes: notes.trim() || null,
          sizeMismatchConfirmed: overrideConfirm || sizeMismatchConfirmed,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 409 && data.code === "PACK_SIZE_MISMATCH") {
        setSizeMismatchWarning(data.error || "Detected pack size mismatch between Cosmo SKU and competitor title.");
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to save competitor link");
      }

      notify.success("Competitor link saved successfully");
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Error saving link");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Link Competitor Product</DialogTitle>
          <DialogDescription>
            Connect a Cosmo product SKU to a competitor product listing for automated price
            tracking and gap analysis.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* SKU */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold">Cosmo SKU</label>
            <Input
              placeholder="e.g. CERAVE-236"
              value={sku}
              onChange={(e) => {
                setSku(e.target.value);
                setSizeMismatchWarning(null);
              }}
              disabled={Boolean(initialSku) || submitting}
              className="font-mono text-xs uppercase"
            />
          </div>

          {/* Competitor Select */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold">Competitor</label>
            <select
              value={competitorSlug}
              onChange={(e) => setCompetitorSlug(e.target.value)}
              disabled={submitting}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {FIXED_COMPETITORS.filter((c) => c.active).map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name} ({c.websiteDomain})
                </option>
              ))}
            </select>
          </div>

          {/* Product URL */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold">Competitor Product URL</label>
            <Input
              placeholder="https://..."
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
              disabled={submitting}
              className="text-xs"
            />
          </div>

          {/* Competitor Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold">Competitor Product Title</label>
            <Input
              placeholder="Title as listed on competitor store (including size/volume)"
              value={competitorTitle}
              onChange={(e) => {
                setCompetitorTitle(e.target.value);
                setSizeMismatchWarning(null);
              }}
              disabled={submitting}
              className="text-xs"
            />
          </div>

          {/* Price & Stock & Date */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Price (LKR)</label>
              <Input
                type="number"
                placeholder="e.g. 8200"
                value={listedPriceLkr}
                onChange={(e) => setListedPriceLkr(e.target.value)}
                disabled={submitting}
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Verification Date</label>
              <Input
                type="date"
                value={checkDate}
                onChange={(e) => setCheckDate(e.target.value)}
                disabled={submitting}
                className="text-xs"
              />
            </div>

            <div className="flex flex-col justify-end space-y-1.5 pb-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium">
                <input
                  type="checkbox"
                  checked={inStock}
                  onChange={(e) => setInStock(e.target.checked)}
                  disabled={submitting}
                  className="rounded border-input text-primary focus:ring-ring"
                />
                In Stock on Store
              </label>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold">Notes (Optional)</label>
            <Input
              placeholder="Promotional notes, bundle details, or variant specifics"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={submitting}
              className="text-xs"
            />
          </div>

          {/* Size Mismatch Alert Banner */}
          {sizeMismatchWarning && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-2">
              <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{sizeMismatchWarning}</span>
              </div>
              <p className="text-[11px] text-muted-foreground pl-6">
                If this competitor SKU is indeed equivalent despite title differences, you can
                confirm and proceed.
              </p>
              <div className="pl-6 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSizeMismatchConfirmed(true);
                    handleSubmit(true);
                  }}
                  disabled={submitting}
                  className="h-7 text-xs border-amber-500/50 bg-background hover:bg-amber-500/10"
                >
                  Confirm & Link Anyway
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="text-xs"
          >
            Cancel
          </Button>
          <Button
            onClick={() => handleSubmit(false)}
            disabled={submitting}
            className="text-xs"
          >
            {submitting && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Save Link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
