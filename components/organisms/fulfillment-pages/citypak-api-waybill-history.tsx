"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";

import { ReceiverFields } from "@/components/molecules/citypak-shipment-review-dialog";
import { PrintLayoutDialog, PrintCitypakWaybillButton, PrintCitypakWaybillPackButton } from "@/components/molecules/print-citypak-waybill-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { citypakWaybillByIdPath, toCitypakPhone, type CitypakShipmentOverride } from "@/lib/citypak-api";
import { formatAppDateTime, formatAppIsoDate } from "@/lib/format-datetime";
import { notify } from "@/lib/notify";
import type {
  CitypakApiWaybillBatchRow,
  CitypakApiWaybillHistoryRow,
} from "@/lib/page-data/waybill-lookup-types";

const HISTORY_ENDPOINT = "/api/admin/fulfillment/citypak-waybills/history";

type Scope = { batchId?: string; waybillIds?: string[]; all?: boolean };

function formatDate(value: string | null) {
  return formatAppDateTime(value, "-");
}

function shipmentValid(shipment: CitypakShipmentOverride) {
  return (
    shipment.receiverName.trim().length > 0 &&
    shipment.receiverAddress1.trim().length > 0 &&
    shipment.receiverCity.trim().length > 0 &&
    toCitypakPhone(shipment.receiverPhone).length >= 9
  );
}

/** Edit receiver details and reprint. Tracking / CityPak booking stay the same. */
function EditWaybillDetailsDialog({
  waybill,
  onOpenChange,
  onDone,
  onPrint,
}: {
  waybill: CitypakApiWaybillHistoryRow | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
  onPrint: (waybill: CitypakApiWaybillHistoryRow) => void;
}) {
  const [shipment, setShipment] = useState<CitypakShipmentOverride | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!waybill) {
      setShipment(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const response = await fetch(
          `/api/admin/fulfillment/citypak-waybills/${waybill.id}/rebook`
        );
        const data = (await response.json().catch(() => null)) as
          | { shipment?: CitypakShipmentOverride; error?: string }
          | null;
        if (cancelled) return;
        if (!response.ok || !data?.shipment) {
          notify.error(data?.error ?? "Could not load waybill details.");
          onOpenChange(false);
          return;
        }
        setShipment(data.shipment);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [waybill, onOpenChange]);

  async function submit(printAfter: boolean) {
    if (!waybill || !shipment) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/fulfillment/citypak-waybills/${waybill.id}/rebook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(shipment),
      });
      const data = (await response.json().catch(() => null)) as
        | { message?: string; error?: string }
        | null;
      if (!response.ok) {
        notify.error(data?.error ?? "Could not save details.");
        return;
      }
      notify.success(data?.message ?? "Details saved.");
      onOpenChange(false);
      onDone();
      if (printAfter) onPrint(waybill);
    } catch {
      notify.error("Could not save details.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={Boolean(waybill)} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,42rem)] max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit waybill details · {waybill?.waybillNo}</DialogTitle>
          <DialogDescription>
            Change name, address, or phone, then print. Tracking stays the same — CityPak is not
            re-booked. COD stays locked unless you unlock it.
          </DialogDescription>
        </DialogHeader>
        {loading || !shipment ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading receiver details...
          </p>
        ) : (
          <ReceiverFields
            value={shipment}
            codLocked
            onChange={(next) => setShipment((current) => (current ? { ...current, ...next } : current))}
          />
        )}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={saving || !shipment || !shipmentValid(shipment)}
            onClick={() => void submit(false)}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button
            type="button"
            disabled={saving || !shipment || !shipmentValid(shipment)}
            onClick={() => void submit(true)}
          >
            {saving ? "Saving..." : "Save & print"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CitypakApiWaybillHistoryPanel({
  refreshTrigger = 0,
  title = "CityPak API waybill history",
}: {
  refreshTrigger?: number;
  title?: string;
}) {
  const today = formatAppIsoDate(new Date());
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [batches, setBatches] = useState<CitypakApiWaybillBatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<CitypakApiWaybillHistoryRow | null>(null);
  const [printTarget, setPrintTarget] = useState<CitypakApiWaybillHistoryRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        from: fromDate,
        to: toDate,
        ...(includeArchived ? { includeArchived: "1" } : {}),
      });
      const response = await fetch(`${HISTORY_ENDPOINT}?${params}`);
      const data = (await response.json().catch(() => null)) as
        | { batches?: CitypakApiWaybillBatchRow[]; error?: string }
        | null;
      if (!response.ok || !data) {
        notify.error(data?.error ?? "Could not load CityPak API history.");
        return;
      }
      setBatches(data.batches ?? []);
      setSelectedIds([]);
    } catch {
      notify.error("Could not load CityPak API history.");
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, includeArchived]);

  useEffect(() => {
    void load();
  }, [load, refreshTrigger]);

  const allWaybillIds = batches.flatMap((batch) => batch.waybills.map((row) => row.id));

  function toggleSelect(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );
  }

  async function clearSavedPrints() {
    setBusy(true);
    try {
      const response = await fetch(HISTORY_ENDPOINT, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_cache", all: true }),
      });
      const data = (await response.json().catch(() => null)) as
        | { message?: string; error?: string }
        | null;
      if (!response.ok) {
        notify.error(data?.error ?? "Could not clear saved prints.");
        return;
      }
      notify.success(data?.message ?? "Saved prints cleared.");
    } catch {
      notify.error("Could not clear saved prints.");
    } finally {
      setBusy(false);
    }
  }

  async function clearHistoryList(scope: Scope, confirmText: string) {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    try {
      const response = await fetch(HISTORY_ENDPOINT, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scope),
      });
      const data = (await response.json().catch(() => null)) as
        | { message?: string; error?: string }
        | null;
      if (!response.ok) {
        notify.error(data?.error ?? "Could not clear history.");
        return;
      }
      notify.success(data?.message ?? "History cleared.");
      await load();
    } catch {
      notify.error("Could not clear history.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-border/70 shadow-xs">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-border/50">
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Default shows today&apos;s booked waybills. Clear hides from the list but keeps the
            trace — pick a date range or “Show cleared” to find them again.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="space-y-1 text-xs text-muted-foreground">
              From
              <Input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
                className="h-8 w-auto"
              />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              To
              <Input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
                className="h-8 w-auto"
              />
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const day = formatAppIsoDate(new Date());
                setFromDate(day);
                setToDate(day);
              }}
            >
              Today
            </Button>
            <label className="flex items-center gap-2 pb-1 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(event) => setIncludeArchived(event.target.checked)}
              />
              Show cleared
            </label>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={loading || busy}
            onClick={() => void load()}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-4" aria-hidden />
            )}
            Refresh
          </Button>
          {selectedIds.length > 0 && (
            <>
              <PrintCitypakWaybillPackButton
                orderIds={[]}
                waybillIds={selectedIds}
                label={`Print selected (${selectedIds.length})`}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2 text-destructive"
                disabled={busy}
                onClick={() =>
                  void clearHistoryList(
                    { waybillIds: selectedIds },
                    `Clear ${selectedIds.length} waybill(s) from this list? Traces stay — use Show cleared / date range to find them. Orders stay API-booked (not sent back to Falcon Upload).`
                  )
                }
              >
                <Trash2 className="size-4" aria-hidden />
                Clear selected
              </Button>
            </>
          )}
          {allWaybillIds.length > 0 && (
            <>
              <PrintCitypakWaybillPackButton
                orderIds={[]}
                waybillIds={allWaybillIds}
                label={`Print all (${allWaybillIds.length})`}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void clearSavedPrints()}
              >
                Clear saved prints
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2 text-destructive"
                disabled={busy}
                onClick={() =>
                  void clearHistoryList(
                    { all: true },
                    "Clear visible CityPak API history from this list? Traces stay for date lookup. Orders stay API-booked."
                  )
                }
              >
                <Trash2 className="size-4" aria-hidden />
                Clear history
              </Button>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading && batches.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading CityPak history...
          </p>
        ) : batches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No CityPak API batches for this date range
            {includeArchived ? "" : " (cleared hidden)"}. Try Today, widen dates, or Show cleared.
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border border-border/70">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Batch</th>
                  <th className="px-3 py-2 font-medium">Dispatched</th>
                  <th className="px-3 py-2 font-medium">By</th>
                  <th className="px-3 py-2 font-medium">Waybills</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch: CitypakApiWaybillBatchRow) => {
                  const expanded = expandedBatchId === batch.id;
                  const batchWaybillIds = batch.waybills.map((row) => row.id);
                  const dispatcher =
                    batch.uploadedBy?.name?.trim() || batch.uploadedBy?.email?.trim() || "—";
                  // Pre-batch waybills are grouped by day, so they have no real batch record.
                  const legacy = batch.id.startsWith("legacy-");
                  const batchScope: Scope = legacy
                    ? { waybillIds: batchWaybillIds }
                    : { batchId: batch.id };
                  return (
                    <Fragment key={batch.id}>
                      <tr className="border-t border-border/60 align-top">
                        <td className="px-3 py-2 font-medium">
                          <button
                            type="button"
                            className="text-left hover:underline"
                            onClick={() =>
                              setExpandedBatchId((current) =>
                                current === batch.id ? null : batch.id
                              )
                            }
                          >
                            {batch.label}
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              {expanded ? "hide" : "show"}
                            </span>
                          </button>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatDate(batch.createdAt)}</td>
                        <td className="px-3 py-2">{dispatcher}</td>
                        <td className="px-3 py-2">{batch.bookedCount}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {batchWaybillIds.length > 0 && (
                              <PrintCitypakWaybillPackButton
                                orderIds={[]}
                                waybillIds={batchWaybillIds}
                                label="Print batch"
                              />
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-2 text-destructive"
                              disabled={busy}
                              onClick={() =>
                                void clearHistoryList(
                                  batchScope,
                                  `Clear batch "${batch.label}" from this list? Trace stays — use Show cleared / date range. Orders stay API-booked.`
                                )
                              }
                            >
                              <Trash2 className="size-4" aria-hidden />
                              Clear
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-t border-border/40 bg-muted/20">
                          <td colSpan={5} className="p-0">
                            <table className="w-full text-sm">
                              <thead className="bg-muted/30 text-left text-muted-foreground">
                                <tr>
                                  <th className="px-3 py-2 font-medium w-10"> </th>
                                  <th className="px-3 py-2 font-medium">Tracking</th>
                                  <th className="px-3 py-2 font-medium">Reference</th>
                                  <th className="px-3 py-2 font-medium">Order</th>
                                  <th className="px-3 py-2 font-medium">Booked</th>
                                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {batch.waybills.map((row: CitypakApiWaybillHistoryRow) => (
                                  <tr key={row.id} className="border-t border-border/60">
                                    <td className="px-3 py-2">
                                      <input
                                        type="checkbox"
                                        checked={selectedIds.includes(row.id)}
                                        onChange={() => toggleSelect(row.id)}
                                        aria-label={`Select ${row.waybillNo}`}
                                      />
                                    </td>
                                    <td className="px-3 py-2 font-medium">{row.waybillNo}</td>
                                    <td className="px-3 py-2">{row.invoiceNumber}</td>
                                    <td className="px-3 py-2">
                                      {row.manual ? "Manual" : row.orderLabel ?? row.orderId ?? "—"}
                                    </td>
                                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                                      {formatDate(row.createdAt)}
                                    </td>
                                    <td className="px-3 py-2">
                                      <div className="flex flex-wrap items-center justify-end gap-2">
                                        <PrintCitypakWaybillButton
                                          waybillId={row.id}
                                          orderId={row.orderId}
                                          tracking={row.waybillNo}
                                        />
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="gap-2"
                                          disabled={busy}
                                          onClick={() => setEditTarget(row)}
                                        >
                                          <Pencil className="size-4" aria-hidden />
                                          Edit details
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                                {batch.waybills.length === 0 && (
                                  <tr>
                                    <td
                                      colSpan={6}
                                      className="px-3 py-4 text-center text-muted-foreground"
                                    >
                                      No waybill rows linked to this batch.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
      <EditWaybillDetailsDialog
        waybill={editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        onDone={() => void load()}
        onPrint={(row) => setPrintTarget(row)}
      />
      <PrintLayoutDialog
        open={Boolean(printTarget)}
        onOpenChange={(open) => {
          if (!open) setPrintTarget(null);
        }}
        onPrint={(layout) => {
          if (!printTarget) return;
          window.open(
            `${citypakWaybillByIdPath(printTarget.id)}?layout=${layout}&t=${Date.now()}`,
            "_blank",
            "noopener,noreferrer"
          );
        }}
      />
    </Card>
  );
}
