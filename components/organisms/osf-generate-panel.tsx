"use client";

import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import { formatAppIsoDate } from "@/lib/format-datetime";
import type { OsfVariant } from "@/lib/osf/vat-membership";

type Vendor = { id: string; name: string };
type PriorityOption = { id: string; name: string };

function currentMonthColombo(): string {
  return formatAppIsoDate(new Date()).slice(0, 7);
}

function todayColombo(): string {
  return formatAppIsoDate(new Date());
}

function fallbackFilename(variant: OsfVariant, asOfDate: string, belowThresholdOnly: boolean): string {
  if (belowThresholdOnly) {
    if (variant === "vat") return `OSF-reorder-vat-${asOfDate}.xlsx`;
    if (variant === "non_vat") return `OSF-reorder-non-vat-${asOfDate}.xlsx`;
    return `OSF-reorder-${asOfDate}.xlsx`;
  }
  if (variant === "vat") return `OSF-vat-${asOfDate}.xlsx`;
  if (variant === "non_vat") return `OSF-non-vat-${asOfDate}.xlsx`;
  return `OSF-${asOfDate}.xlsx`;
}

function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = /filename="([^"]+)"/i.exec(header);
  return match?.[1]?.trim() || null;
}

export function OsfGeneratePanel({ canReorderOnly = false }: { canReorderOnly?: boolean }) {
  const [salesMonth, setSalesMonth] = useState(currentMonthColombo);
  const [asOfDate, setAsOfDate] = useState(todayColombo);
  const [skuPrefix, setSkuPrefix] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [itemStatus, setItemStatus] = useState("");
  const [osfVariant, setOsfVariant] = useState<OsfVariant>("main");
  const [maxStockPct, setMaxStockPct] = useState("");
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [priorities, setPriorities] = useState<PriorityOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyMode, setBusyMode] = useState<"full" | "reorder" | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  const variantDrivesMembership = osfVariant === "vat" || osfVariant === "non_vat";

  useEffect(() => {
    fetch("/api/admin/vendors")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Vendor[]) => setVendors(Array.isArray(list) ? list : []))
      .catch(() => undefined);
    fetch("/api/admin/product-items/page-data?page=1&limit=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { priorities?: PriorityOption[] } | null) => {
        if (data?.priorities) setPriorities(data.priorities);
      })
      .catch(() => undefined);
  }, []);

  async function generate(belowThresholdOnly: boolean) {
    setBusy(true);
    setBusyMode(belowThresholdOnly ? "reorder" : "full");
    setErrorDetail(null);
    try {
      const pctTrim = maxStockPct.trim();
      let maxStockPctOfRop: number | undefined;
      if (pctTrim) {
        const n = Math.floor(Number(pctTrim));
        if (!Number.isFinite(n) || n < 1 || n > 100) {
          throw new Error("Stock below % of ROP must be 1–100 or blank");
        }
        maxStockPctOfRop = n;
      }
      const res = await fetch("/api/admin/osf/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salesMonth,
          asOfDate,
          osfVariant,
          includeInactive: false,
          belowThresholdOnly,
          ...(skuPrefix.trim() ? { skuPrefix: skuPrefix.trim() } : {}),
          ...(vendorId ? { vendorIds: [vendorId] } : {}),
          ...(!variantDrivesMembership && itemStatus
            ? { itemStatusCategories: [itemStatus] }
            : {}),
          ...(maxStockPctOfRop != null ? { maxStockPctOfRop } : {}),
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const code = json.code as string | undefined;
        let message = json.error ?? `Generate failed (${res.status})`;
        if (code === "ERP_UNAVAILABLE") {
          message =
            "ERP is unreachable or credentials are missing. Stock and cost were not invented — fix ERP, then retry. ROP/OGF can still be set in the editor independently.";
        }
        setErrorDetail(json.detail ?? null);
        throw new Error(message);
      }

      const rowCount = Number(res.headers.get("X-OSF-Row-Count") ?? "0");
      const pctFilter = maxStockPct.trim();
      if (rowCount === 0 && (belowThresholdOnly || pctFilter)) {
        notify.error(
          pctFilter
            ? `No SKUs with assigned ROP and stock below ${pctFilter}% of ROP.`
            : "No SKUs below reorder threshold — set warehouse ROPs first; only SKUs with stock/ROP under the threshold % are included.",
        );
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        filenameFromContentDisposition(res.headers.get("Content-Disposition")) ??
        fallbackFilename(osfVariant, asOfDate, belowThresholdOnly);
      a.click();
      URL.revokeObjectURL(url);
      if (!(rowCount === 0 && (belowThresholdOnly || pctFilter))) {
        const label =
          osfVariant === "vat" ? "VAT OSF" : osfVariant === "non_vat" ? "Non-VAT OSF" : "OSF";
        notify.success(belowThresholdOnly ? `Reorder-only ${label} downloaded` : `${label} downloaded`);
      }
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setBusy(false);
      setBusyMode(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium">Generate OSF</h3>
        <p className="text-sm text-muted-foreground">
          Main = full catalog except discontinued SKUs. VAT = ERP Product Priority Vat only. Non-VAT
          excludes Vat. Missing ERP stock/cost stays blank.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs font-medium">
          OSF variant
          <select
            className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={osfVariant}
            onChange={(e) => setOsfVariant(e.target.value as OsfVariant)}
            disabled={busy}
          >
            <option value="main">Main OSF</option>
            <option value="vat">VAT OSF</option>
            <option value="non_vat">Non-VAT OSF</option>
          </select>
        </label>
        <label className="text-xs font-medium">
          Sales month
          <Input
            type="month"
            className="mt-1"
            value={salesMonth}
            onChange={(e) => setSalesMonth(e.target.value)}
            disabled={busy}
          />
        </label>
        <label className="text-xs font-medium">
          As-of date
          <Input
            type="date"
            className="mt-1"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            disabled={busy}
          />
        </label>
        <label className="text-xs font-medium">
          SKU prefix (optional)
          <Input
            className="mt-1"
            value={skuPrefix}
            placeholder="e.g. CAN"
            onChange={(e) => setSkuPrefix(e.target.value)}
            disabled={busy}
          />
        </label>
        <label className="text-xs font-medium">
          Brand / vendor (optional)
          <select
            className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            disabled={busy}
          >
            <option value="">All</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium">
          ERP Product Priority (optional)
          <select
            className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={variantDrivesMembership ? "" : itemStatus}
            onChange={(e) => setItemStatus(e.target.value)}
            disabled={busy || variantDrivesMembership}
          >
            <option value="">All</option>
            {priorities
              .filter((p) => p.name.trim().toLowerCase() !== "discontinue")
              .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium">
          Stock below % of ROP (optional)
          <Input
            type="number"
            min={1}
            max={100}
            className="mt-1"
            value={maxStockPct}
            placeholder="e.g. 70"
            onChange={(e) => setMaxStockPct(e.target.value)}
            disabled={busy}
          />
        </label>
      </div>

      {variantDrivesMembership ? (
        <p className="text-xs text-muted-foreground">
          {osfVariant === "vat"
            ? "VAT OSF membership uses ERP Product Priority = Vat (ERP1 or ERP2). Priority dropdown is ignored. Total ROP uses Cosmetics.lk ROP only; shop ROPs show for planning."
            : "Non-VAT OSF excludes SKUs with ERP Product Priority = Vat. Priority dropdown is ignored."}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => void generate(false)}
          disabled={busy || !salesMonth}
        >
          {busyMode === "full" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Download className="size-4" />
          )}
          {busyMode === "full" ? "Generating…" : "Generate OSF"}
        </Button>
        {canReorderOnly && (
          <Button
            type="button"
            variant="outline"
            onClick={() => void generate(true)}
            disabled={busy || !salesMonth}
          >
            {busyMode === "reorder" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Download className="size-4" />
            )}
            {busyMode === "reorder" ? "Generating…" : "Download reorder-only OSF"}
          </Button>
        )}
      </div>

      {maxStockPct.trim() ? (
        <p className="text-xs text-muted-foreground">
          Workbook includes only SKUs with warehouse ROP set and total stock ÷ total ROP
          strictly below {maxStockPct.trim()}%. SKUs without ROP are skipped.
          {osfVariant === "vat" ? " For VAT OSF, total ROP is Cosmetics.lk ROP only." : ""}
        </p>
      ) : null}
      {canReorderOnly && (
        <p className="text-xs text-muted-foreground">
          Reorder-only includes SKUs with warehouse ROP set and total stock ÷ total ROP below
          that SKU’s threshold (default 70%). SKUs without ROP are skipped.
        </p>
      )}
      {errorDetail && (
        <p className="text-xs text-destructive/90 whitespace-pre-wrap">{errorDetail}</p>
      )}
    </div>
  );
}
