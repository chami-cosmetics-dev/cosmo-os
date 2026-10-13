"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";

type HistoryRow = {
  id: string;
  direction: "store_to_shop" | "shop_to_main";
  erpName: string | null;
  erpUrl: string | null;
  erpCompany: string;
  sourceWarehouse: string;
  targetWarehouse: string;
  status: "sent" | "received" | "requested" | "confirming" | "confirmed";
  createdAt: string;
  receivedAt: string | null;
  createdByName: string | null;
  receivedByName: string | null;
  mismatch: boolean;
  lineCount: number;
  sentQty: number;
  receivedQty: number;
  mismatchCount: number;
  shortUnits: number;
  overUnits: number;
};

type DetailLine = {
  id: string;
  itemCode: string;
  itemName: string;
  barcode: string;
  sentQty: number;
  receivedQty: number;
  receivedQtyUpdatedByName: string | null;
};

type Detail = HistoryRow & { lines: DetailLine[] };

function when(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function statusLabel(status: HistoryRow["status"]) {
  if (status === "received") return "Received";
  if (status === "requested") return "Waiting for stores";
  if (status === "confirming") return "Confirming";
  if (status === "confirmed") return "Confirmed";
  return "Sent";
}

function finished(status: HistoryRow["status"]) {
  return status === "received" || status === "confirmed";
}

function varianceText(row: Pick<HistoryRow, "status" | "shortUnits" | "overUnits" | "mismatchCount">) {
  if (!finished(row.status) || row.mismatchCount === 0) return null;
  const parts = [];
  if (row.shortUnits) parts.push(`short ${row.shortUnits}`);
  if (row.overUnits) parts.push(`over ${row.overUnits}`);
  return parts.join(", ");
}

export function MaterialTransferHistory({
  scope,
  title = "History",
}: {
  scope: "all" | "shop";
  title?: string;
}) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [unassigned, setUnassigned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [mismatchOnly, setMismatchOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const mismatch = mismatchOnly ? "&mismatch=1" : "";
      const res = await fetch(`/api/admin/store/material-transfer/history?scope=${scope}${mismatch}`);
      const json = (await res.json()) as {
        transfers?: HistoryRow[];
        shopUnassigned?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Could not load history");
      setRows(json.transfers ?? []);
      setUnassigned(Boolean(json.shopUnassigned));
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not load history");
    } finally {
      setLoading(false);
    }
  }, [scope, mismatchOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onSaved() {
      void load();
    }
    window.addEventListener("material-transfer-saved", onSaved);
    return () => window.removeEventListener("material-transfer-saved", onSaved);
  }, [load]);

  async function toggle(id: string) {
    if (openId === id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/store/material-transfer/${id}`);
      const json = (await res.json()) as { transfer?: Detail; error?: string };
      if (!res.ok || !json.transfer) throw new Error(json.error || "Could not load the transfer");
      setDetail(json.transfer);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not load the transfer");
      setOpenId(null);
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={mismatchOnly ? "default" : "outline"}
            disabled={loading}
            onClick={() => setMismatchOnly((current) => !current)}
          >
            {mismatchOnly ? "Showing mismatches" : "Mismatches"}
          </Button>
          <Button type="button" variant="outline" disabled={loading} onClick={() => void load()}>
          {loading ? (
            <>
              <Loader2 className="animate-spin" aria-hidden />
              Loading...
            </>
          ) : (
            "Refresh"
          )}
          </Button>
        </div>
      </div>
      <p className="text-muted-foreground text-sm">
        {scope === "all"
          ? "Every shop. Status updates when the shop marks the transfer received."
          : "Transfers for your shop."}
      </p>
      {unassigned ? (
        <p className="text-sm text-red-600">
          Assign an outlet on the staff profile to see this shop&apos;s transfers.
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Entry</th>
              <th className="px-3 py-2 font-medium">To</th>
              <th className="px-3 py-2 font-medium">Sent</th>
              <th className="px-3 py-2 font-medium">Received</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">By</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading ? (
              <tr>
                <td className="text-muted-foreground px-3 py-6" colSpan={7}>
                  No transfers yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <Fragment key={row.id}>
                  <tr className="cursor-pointer border-t" onClick={() => void toggle(row.id)}>
                    <td className="px-3 py-2">{when(row.createdAt)}</td>
                    <td className="px-3 py-2">
                      {row.erpUrl && row.erpName ? (
                        <a
                          href={row.erpUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium underline"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {row.erpName}
                        </a>
                      ) : (
                        <span>{row.sourceWarehouse}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{row.targetWarehouse}</td>
                    <td className="px-3 py-2">{row.sentQty}</td>
                    <td className="px-3 py-2">{row.receivedQty}</td>
                    <td className="px-3 py-2">
                      {statusLabel(row.status)}
                      {varianceText(row) ? (
                        <span className="text-muted-foreground block text-xs">{varianceText(row)}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      {row.createdByName || "—"}
                      {row.receivedByName ? (
                        <span className="text-muted-foreground block text-xs">
                          Received by {row.receivedByName}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                  {openId === row.id ? (
                    <tr key={`${row.id}-detail`} className="border-t bg-muted/20">
                      <td className="px-3 py-3" colSpan={7}>
                        {detailLoading || detail?.id !== row.id ? (
                          <span className="text-muted-foreground flex items-center gap-2">
                            <Loader2 className="animate-spin" aria-hidden />
                            Loading lines...
                          </span>
                        ) : (
                          <table className="w-full">
                            <thead>
                              <tr className="text-left">
                                <th className="py-1 pr-3 font-medium">SKU</th>
                                <th className="py-1 pr-3 font-medium">Description</th>
                                <th className="py-1 pr-3 font-medium">Barcode</th>
                                <th className="py-1 pr-3 font-medium">Sent</th>
                                <th className="py-1 pr-3 font-medium">Received</th>
                                <th className="py-1 font-medium">Counted by</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.lines.map((line) => {
                                const differs = finished(detail.status) && line.receivedQty !== line.sentQty;
                                return (
                                <tr
                                  key={line.id}
                                  className={
                                    differs
                                      ? "bg-amber-100 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
                                      : undefined
                                  }
                                >
                                  <td className="py-1 pr-3">{line.itemCode}</td>
                                  <td className="py-1 pr-3">{line.itemName}</td>
                                  <td className="py-1 pr-3">{line.barcode || "—"}</td>
                                  <td className="py-1 pr-3">{line.sentQty}</td>
                                  <td className="py-1 pr-3">{line.receivedQty}</td>
                                  <td className="py-1">{line.receivedQtyUpdatedByName || "—"}</td>
                                </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
