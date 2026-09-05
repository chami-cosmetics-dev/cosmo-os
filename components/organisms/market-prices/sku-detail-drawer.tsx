"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  History,
  Link as LinkIcon,
  Loader2,
  Plus,
  Store,
  Tag,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatAppDateTimeShort, formatAppIsoDate } from "@/lib/format-datetime";
import type { MarketSkuDetailResponse } from "@/lib/market-prices/types";
import { notify } from "@/lib/notify";

type Props = {
  sku: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
  onEditLink: (sku: string) => void;
};

export function SkuDetailDrawer({
  sku,
  open,
  onOpenChange,
  canManage,
  onEditLink,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<MarketSkuDetailResponse | null>(null);

  const loadDetails = useCallback(async (targetSku: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/purchasing/market-prices/links?sku=${encodeURIComponent(targetSku)}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load SKU competitor details");
      }
      const json: MarketSkuDetailResponse = await res.json();
      setData(json);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Error fetching SKU details");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && sku) {
      loadDetails(sku);
    } else {
      setData(null);
    }
  }, [open, sku, loadDetails]);

  const formatPrice = (val: number | null | undefined) => {
    if (val == null || !Number.isFinite(val)) return "—";
    return `Rs. ${val.toLocaleString("en-LK", { maximumFractionDigits: 0 })}`;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto p-0">
        <div className="p-6 space-y-6">
          {/* Header */}
          <SheetHeader className="text-left space-y-2 border-b pb-4">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-primary">
                {sku || "—"}
              </span>
              {data?.priority && (
                <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                  {data.priority}
                </span>
              )}
            </div>
            <SheetTitle className="text-base font-semibold">
              {data?.title || "Product Competitor Breakdown"}
            </SheetTitle>
            <SheetDescription className="text-xs">
              {data?.brand && <span>Brand: {data.brand} </span>}
              {data?.barcode && <span>• Barcode: {data.barcode}</span>}
            </SheetDescription>
          </SheetHeader>

          {loading ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Loading competitor prices...
              </span>
            </div>
          ) : data ? (
            <div className="space-y-6">
              {/* Cosmo Price Layers */}
              <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Cosmo Retail Price Layers
                  </span>
                  {data.prices.hasPromo && (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                      Active Web Promo
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-md border bg-background p-2.5 text-center">
                    <div className="text-[10px] text-muted-foreground">OGF (LWK POS)</div>
                    <div className="text-sm font-bold">{formatPrice(data.prices.ogf)}</div>
                  </div>
                  <div className="rounded-md border bg-background p-2.5 text-center">
                    <div className="text-[10px] text-muted-foreground">MRP (Standard)</div>
                    <div className="text-sm font-bold">{formatPrice(data.prices.mrp)}</div>
                  </div>
                  <div className="rounded-md border bg-background p-2.5 text-center">
                    <div className="text-[10px] text-muted-foreground">Promo (Sale)</div>
                    <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      {formatPrice(data.prices.promo)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Competitor Slots */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Market Competitors (6 Stores)
                  </span>
                  {canManage && sku && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => onEditLink(sku)}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Add / Edit Link
                    </Button>
                  )}
                </div>

                <div className="space-y-2.5">
                  {data.competitors.map((slot) => (
                    <div
                      key={slot.competitorSlug}
                      className={`rounded-lg border p-3.5 transition-colors ${
                        slot.linked
                          ? "bg-card shadow-sm"
                          : "border-dashed bg-muted/10 opacity-75"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-foreground">
                              {slot.competitorName}
                            </span>
                            {slot.linked && slot.inStock != null && (
                              <span
                                className={`rounded px-1.5 py-0.2 text-[10px] font-medium ${
                                  slot.inStock
                                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                    : "bg-rose-500/10 text-rose-700 dark:text-rose-300"
                                }`}
                              >
                                {slot.inStock ? "In Stock" : "Out of Stock"}
                              </span>
                            )}
                            {slot.stale && (
                              <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-0.2 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                                <AlertTriangle className="h-3 w-3" />
                                Stale
                              </span>
                            )}
                          </div>
                          {slot.competitorTitle && (
                            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                              {slot.competitorTitle}
                            </p>
                          )}
                        </div>

                        <div className="text-right shrink-0">
                          {slot.linked ? (
                            <div>
                              <div className="text-sm font-bold tabular-nums text-foreground">
                                {formatPrice(slot.listedPriceLkr)}
                              </div>
                              {slot.checkDate && (
                                <div className="text-[10px] text-muted-foreground">
                                  Checked {slot.checkDate}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs italic text-muted-foreground">
                              Not tracked
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Gaps Breakdown for linked slots */}
                      {slot.linked && (
                        <div className="mt-3 border-t pt-2.5 grid grid-cols-3 gap-2 text-center text-xs">
                          <div className="rounded bg-muted/40 p-1.5">
                            <div className="text-[10px] text-muted-foreground">
                              vs OGF Gap
                            </div>
                            <div
                              className={`font-semibold tabular-nums ${
                                slot.gaps.ogf != null && slot.gaps.ogf > 5
                                  ? "text-rose-600 dark:text-rose-400"
                                  : slot.gaps.ogf != null && slot.gaps.ogf < 0
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-foreground"
                              }`}
                            >
                              {slot.gaps.ogf != null
                                ? `${slot.gaps.ogf > 0 ? "+" : ""}${slot.gaps.ogf}%`
                                : "—"}
                            </div>
                          </div>
                          <div className="rounded bg-muted/40 p-1.5">
                            <div className="text-[10px] text-muted-foreground">
                              vs MRP Gap
                            </div>
                            <div
                              className={`font-semibold tabular-nums ${
                                slot.gaps.mrp != null && slot.gaps.mrp > 5
                                  ? "text-rose-600 dark:text-rose-400"
                                  : slot.gaps.mrp != null && slot.gaps.mrp < 0
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-foreground"
                              }`}
                            >
                              {slot.gaps.mrp != null
                                ? `${slot.gaps.mrp > 0 ? "+" : ""}${slot.gaps.mrp}%`
                                : "—"}
                            </div>
                          </div>
                          <div className="rounded bg-muted/40 p-1.5">
                            <div className="text-[10px] text-muted-foreground">
                              vs Promo Gap
                            </div>
                            <div
                              className={`font-semibold tabular-nums ${
                                slot.gaps.promo != null && slot.gaps.promo > 5
                                  ? "text-rose-600 dark:text-rose-400"
                                  : slot.gaps.promo != null && slot.gaps.promo < 0
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-foreground"
                              }`}
                            >
                              {slot.gaps.promo != null
                                ? `${slot.gaps.promo > 0 ? "+" : ""}${slot.gaps.promo}%`
                                : "—"}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Outbound Link & Notes */}
                      {slot.linked && (
                        <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted-foreground">
                          {slot.notes ? (
                            <span className="italic truncate max-w-[260px]">
                              Note: {slot.notes}
                            </span>
                          ) : (
                            <span />
                          )}
                          {slot.productUrl && (
                            <a
                              href={slot.productUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center text-primary hover:underline"
                            >
                              Open store page <ExternalLink className="ml-1 h-3 w-3" />
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Price Change Audit History */}
              {data.history.length > 0 && (
                <div className="space-y-2 border-t pt-4">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <History className="h-4 w-4" />
                    Price Change History
                  </div>
                  <div className="space-y-1.5 text-xs">
                    {data.history.map((h, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded border bg-muted/20 px-3 py-2 text-[11px]"
                      >
                        <div className="flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>Recorded on {h.checkDate}</span>
                        </div>
                        <div className="tabular-nums font-semibold">
                          {formatPrice(h.listedPriceLkr)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
