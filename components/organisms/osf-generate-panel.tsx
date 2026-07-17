"use client";

import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";

import { OsfFieldSourceLegend } from "@/components/molecules/osf-field-source-legend";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PRODUCT_ITEM_STATUS_CATEGORIES, PRODUCT_ITEM_STATUS_META } from "@/lib/product-item-status";
import { notify } from "@/lib/notify";

type Vendor = { id: string; name: string };

function currentMonthColombo(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "01";
  return `${get("year")}-${get("month")}`;
}

function todayColombo(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "01";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function OsfGeneratePanel() {
  const [salesMonth, setSalesMonth] = useState(currentMonthColombo);
  const [asOfDate, setAsOfDate] = useState(todayColombo);
  const [skuPrefix, setSkuPrefix] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [itemStatus, setItemStatus] = useState("");
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [busy, setBusy] = useState(false);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/vendors")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Vendor[]) => setVendors(Array.isArray(list) ? list : []))
      .catch(() => undefined);
  }, []);

  async function generate() {
    setBusy(true);
    setErrorDetail(null);
    try {
      const res = await fetch("/api/admin/osf/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salesMonth,
          asOfDate,
          includeInactive: false,
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

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `OSF-${asOfDate}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      notify.success("OSF downloaded");
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setBusy(false);
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
          Item status (optional)
          <select
            className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={itemStatus}
            onChange={(e) => setItemStatus(e.target.value)}
          >
            <option value="">All</option>
            {PRODUCT_ITEM_STATUS_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {PRODUCT_ITEM_STATUS_META[cat].label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Button type="button" onClick={() => void generate()} disabled={busy || !salesMonth}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        {busy ? "Generating…" : "Generate OSF"}
      </Button>

      {errorDetail && (
        <p className="text-xs text-destructive/90 whitespace-pre-wrap">{errorDetail}</p>
      )}

      <OsfFieldSourceLegend />
    </div>
  );
}
