"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { useDashboardOverview } from "@/components/organisms/dashboard-overview-context";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type {
  CosmeticsLkDrilldown,
  CosmeticsLkDrilldownBucket,
  CosmeticsLkDrilldownMerchant,
} from "@/lib/page-data/dashboard-cosmetics-lk-drilldown";

const numberFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function formatAmount(value: number) {
  return numberFormatter.format(value);
}

export function DashboardCosmeticsLkDrilldownSheet({
  open,
  onOpenChange,
  locationName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationName: string;
}) {
  const { fromDate, toDate, dateType, filterInfo } = useDashboardOverview();
  const [data, setData] = useState<CosmeticsLkDrilldown | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  const load = useCallback(async () => {
    const id = ++fetchIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        from: fromDate,
        to: toDate,
        date_type: dateType,
      });
      const res = await fetch(
        `/api/admin/dashboard/cosmetics-lk-drilldown?${params.toString()}`,
      );
      const body = (await res.json()) as CosmeticsLkDrilldown & { error?: string };
      if (id !== fetchIdRef.current) return;
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to load Cosmetics.lk breakdown");
      }
      setData(body);
    } catch (e) {
      if (id !== fetchIdRef.current) return;
      setData(null);
      setError(
        e instanceof Error ? e.message : "Failed to load Cosmetics.lk breakdown",
      );
    } finally {
      if (id === fetchIdRef.current) setLoading(false);
    }
  }, [dateType, fromDate, toDate]);

  // Load on open and whenever the dashboard filters move while open, so the
  // panel never shows figures from a different range than the card behind it.
  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto sm:max-w-3xl"
      >
        <SheetHeader className="px-0">
          <SheetTitle>{locationName} — merchant breakdown</SheetTitle>
          <SheetDescription>
            {filterInfo}. Every merchant with orders at this shop for the
            dashboard&apos;s current filter.
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="text-muted-foreground flex items-center justify-center gap-2 py-16 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading Cosmetics.lk breakdown...
          </div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-red-600">{error}</div>
        ) : !data ? null : (
          <div className="space-y-6 pb-8">
            <LocationSummary data={data} />
            <MerchantList merchants={data.merchants} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function LocationSummary({ data }: { data: CosmeticsLkDrilldown }) {
  return (
    <div className="space-y-4">
      <div className="border-border/70 grid grid-cols-3 gap-3 rounded-lg border p-3">
        <Metric label="Shop total" value={formatAmount(data.total)} />
        <Metric label="Orders" value={String(data.orderCount)} />
        <Metric label="Discounts" value={formatAmount(data.discountTotal)} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <BucketCard
          title="Shop total — how placed"
          hint="Website = cosmetics.lk site; ERP1 = Cosmetics.lk ERP (counter and ERP invoices)."
          rows={data.byChannel}
        />
        <BucketCard title="Shop total — payment type" rows={data.byPaymentType} />
        <BucketCard
          title="Shop total — VAT items"
          hint="Line-item spend, so it need not match the shop total."
          rows={data.byVatItem}
        />
        <BucketCard
          title="Shop total — discount codes"
          hint="Promotional codes only. Amount column is the shop discount total above."
          rows={data.byDiscountCode}
          hideAmount
        />
      </div>
    </div>
  );
}

function MerchantList({
  merchants,
}: {
  merchants: CosmeticsLkDrilldownMerchant[];
}) {
  if (merchants.length === 0) {
    return (
      <div className="text-muted-foreground border-border/70 rounded-lg border py-10 text-center text-sm">
        No merchants placed orders at this shop for the selected filter.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">
        Merchants ({merchants.length}) — this merchant&apos;s own figures
      </p>
      {merchants.map((merchant) => (
        <div
          key={merchant.merchantId ?? merchant.merchantName}
          className="border-border/70 space-y-3 rounded-lg border p-3"
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate font-medium">{merchant.merchantName}</span>
            <span className="shrink-0 text-sm tabular-nums">
              {formatAmount(merchant.total)}
              <span className="text-muted-foreground ml-2 text-xs">
                {merchant.orderCount} order{merchant.orderCount === 1 ? "" : "s"}
              </span>
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <BucketList title="How placed" rows={merchant.byChannel} />
            <BucketList title="Payment type" rows={merchant.byPaymentType} />
            <BucketList title="VAT items" rows={merchant.byVatItem} />
          </div>

          <div className="text-muted-foreground text-xs">
            Discounts {formatAmount(merchant.discountTotal)}
            {merchant.discountCodes.length > 0
              ? ` · ${merchant.discountCodes
                  .map((code) => `${code.code} (${code.orderCount})`)
                  .join(", ")}`
              : " · no codes"}
          </div>
        </div>
      ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs tracking-wide uppercase">
        {label}
      </p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function BucketCard({
  title,
  hint,
  rows,
  hideAmount = false,
}: {
  title: string;
  hint?: string;
  rows: CosmeticsLkDrilldownBucket[];
  hideAmount?: boolean;
}) {
  return (
    <div className="bg-muted/40 rounded-lg p-3">
      <p className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
        {title}
      </p>
      {hint ? <p className="text-muted-foreground mb-2 text-xs">{hint}</p> : null}
      <BucketRows rows={rows} hideAmount={hideAmount} />
    </div>
  );
}

function BucketList({
  title,
  rows,
}: {
  title: string;
  rows: CosmeticsLkDrilldownBucket[];
}) {
  return (
    <div className="bg-muted/40 rounded-lg p-2">
      <p className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
        {title}
      </p>
      <BucketRows rows={rows} />
    </div>
  );
}

function BucketRows({
  rows,
  hideAmount = false,
}: {
  rows: CosmeticsLkDrilldownBucket[];
  hideAmount?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-xs">No data</p>;
  }

  return (
    <ul className="space-y-1 text-sm">
      {rows.map((row) => (
        <li key={row.key} className="flex items-baseline justify-between gap-2">
          <span className="text-muted-foreground truncate">
            {row.label}
            <span className="ml-1 text-xs">({row.orderCount})</span>
          </span>
          {hideAmount ? null : (
            <span className="shrink-0 tabular-nums">{formatAmount(row.total)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
