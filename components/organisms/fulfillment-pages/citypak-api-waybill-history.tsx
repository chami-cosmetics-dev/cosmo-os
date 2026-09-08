"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { PrintCitypakWaybillButton, PrintCitypakWaybillPackButton } from "@/components/molecules/print-citypak-waybill-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAppDateTime } from "@/lib/format-datetime";
import { notify } from "@/lib/notify";
import type {
  CitypakApiWaybillBatchRow,
  CitypakApiWaybillHistoryRow,
} from "@/lib/page-data/waybill-lookup-types";

function formatDate(value: string | null) {
  return formatAppDateTime(value, "-");
}

export function CitypakApiWaybillHistoryPanel({
  refreshTrigger = 0,
  initialBatches,
  title = "CityPak API waybill history",
}: {
  refreshTrigger?: number;
  initialBatches?: CitypakApiWaybillBatchRow[];
  title?: string;
}) {
  const [batches, setBatches] = useState<CitypakApiWaybillBatchRow[]>(initialBatches ?? []);
  const [loading, setLoading] = useState(!initialBatches);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/fulfillment/citypak-waybills/history");
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
  }, []);

  useEffect(() => {
    if (initialBatches && refreshTrigger === 0) {
      setBatches(initialBatches);
      setLoading(false);
      return;
    }
    void load();
  }, [initialBatches, load, refreshTrigger]);

  const allWaybillIds = batches.flatMap((batch) => batch.waybills.map((row) => row.id));

  function toggleSelect(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );
  }

  return (
    <Card className="border-border/70 shadow-xs">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-border/50">
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Bulk dispatch batches with who dispatched and when. Expand a row to reprint.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={loading}
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
            <PrintCitypakWaybillPackButton
              orderIds={[]}
              waybillIds={selectedIds}
              label={`Print selected (${selectedIds.length})`}
            />
          )}
          {allWaybillIds.length > 0 && (
            <PrintCitypakWaybillPackButton
              orderIds={[]}
              waybillIds={allWaybillIds}
              label={`Print all (${allWaybillIds.length})`}
            />
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
            No CityPak API batches yet. They appear here after a successful City Pack API dispatch.
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
                    batch.uploadedBy?.name?.trim() ||
                    batch.uploadedBy?.email?.trim() ||
                    "—";
                  return (
                    <Fragment key={batch.id}>
                      <tr className="border-t border-border/60">
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
                            {batch.bookedCount} CityPak API waybill
                            {batch.bookedCount === 1 ? "" : "s"}
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              {expanded ? "hide" : "show"}
                            </span>
                          </button>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {formatDate(batch.createdAt)}
                        </td>
                        <td className="px-3 py-2">{dispatcher}</td>
                        <td className="px-3 py-2">{batch.bookedCount}</td>
                        <td className="px-3 py-2 text-right">
                          {batchWaybillIds.length > 0 ? (
                            <PrintCitypakWaybillPackButton
                              orderIds={[]}
                              waybillIds={batchWaybillIds}
                              label="Print batch"
                            />
                          ) : (
                            "—"
                          )}
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
                                  <th className="px-3 py-2 font-medium text-right">Print</th>
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
                                      {row.manual
                                        ? "Manual"
                                        : row.orderLabel ?? row.orderId ?? "—"}
                                    </td>
                                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                                      {formatDate(row.createdAt)}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      <PrintCitypakWaybillButton
                                        waybillId={row.id}
                                        orderId={row.orderId}
                                        tracking={row.waybillNo}
                                      />
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
    </Card>
  );
}
