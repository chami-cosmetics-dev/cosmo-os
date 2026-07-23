"use client";

import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";

import { OsfFieldSourceLegend } from "@/components/molecules/osf-field-source-legend";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import { formatAppIsoDate } from "@/lib/format-datetime";

type Vendor = { id: string; name: string };
type PriorityOption = { id: string; name: string };

function currentMonthColombo(): string {
  return formatAppIsoDate(new Date()).slice(0, 7);
}

function todayColombo(): string {
  return formatAppIsoDate(new Date());
}

export function OsfGeneratePanel({ canReorderOnly = false }: { canReorderOnly?: boolean }) {
  const [salesMonth, setSalesMonth] = useState(currentMonthColombo);
  const [asOfDate, setAsOfDate] = useState(todayColombo);
  const [skuPrefix, setSkuPrefix] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [itemStatus, setItemStatus] = useState("");
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [priorities, setPriorities] = useState<PriorityOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyMode, setBusyMode] = useState<"full" | "reorder" | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

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
      const res = await fetch("/api/admin/osf/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salesMonth,
          asOfDate,
          includeInactive: false,
          belowThresholdOnly,
          ...(skuPrefix.trim() ? { skuPrefix: skuPrefix.trim() } : {}),
          ...(vendorId ? { vendorIds: [vendorId] } : {}),
          ...(itemStatus ? { itemStatusCategories: [itemStatus] } : {}),
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
      if (belowThresholdOnly && rowCount === 0) {
        notify.error(
          "No SKUs below reorder threshold — set warehouse ROPs first; only SKUs with stock/ROP under the threshold % are included.",
        );
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = belowThresholdOnly ? `OSF-reorder-${asOfDate}.xlsx` : `OSF-${asOfDate}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      if (!(belowThresholdOnly && rowCount === 0)) {
        notify.success(belowThresholdOnly ? "Reorder-only OSF downloaded" : "OSF downloaded");
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
        <h3 className="font-medium">Generate Main OSF</h3>
        <p className="text-sm text-muted-foreground">
          Downloads one Main-sheet workbook. Missing ERP stock/cost stays blank.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs font-medium">
          Sales month
          <Input
            type="month"
            className="mt-1"
            value={salesMonth}
            onChange={(e) => setSalesMonth(e.target.value)}
          />
        </label>
        <label className="text-xs font-medium">
          As-of date
          <Input
            type="date"
            className="mt-1"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
          />
        </label>
        <label className="text-xs font-medium">
          SKU prefix (optional)
          <Input
            className="mt-1"
            value={skuPrefix}
            placeholder="e.g. CAN"
            onChange={(e) => setSkuPrefix(e.target.value)}
          />
        </label>
        <label className="text-xs font-medium">
          Brand / vendor (optional)
          <select
            className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
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
            value={itemStatus}
            onChange={(e) => setItemStatus(e.target.value)}
          >
            <option value="">All</option>
            {priorities.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => void generate(false)}
          disabled={busy || !salesMonth}
        >
          {busyMode === "full" ? (
            <Loader2 className="size-4 animate-spin" />
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
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            {busyMode === "reorder" ? "Generating…" : "Download reorder-only OSF"}
          </Button>
        )}
      </div>

      {canReorderOnly && (
        <p className="text-xs text-muted-foreground">
          Reorder-only includes SKUs with warehouse ROP set and total stock ÷ total ROP below
          that SKU’s threshold (default 70%). SKUs without ROP are skipped.
        </p>
      )}
      {errorDetail && (
        <p className="text-xs text-destructive/90 whitespace-pre-wrap">{errorDetail}</p>
      )}

      <OsfFieldSourceLegend />
    </div>
  );
}
