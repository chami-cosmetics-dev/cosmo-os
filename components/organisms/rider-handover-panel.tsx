"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";

type RiderOption = {
  id: string;
  name: string | null;
  knownName: string | null;
};

type CompanyLine = {
  companyName: string;
  cashAmount: string;
};

type ReceiptView = {
  id: string;
  periodFrom?: string;
  periodTo?: string;
  receivedAt: string;
  receivedByName: string;
  companies: CompanyLine[];
  fullTotal: string;
};

type ClosedInvoice = {
  orderNumber: string;
  companyName: string;
  invoiceCompleteAt: string | null;
};

type SummaryResponse = {
  riderId: string;
  riderName: string;
  from: string;
  to: string;
  companies: CompanyLine[];
  fullTotal: string;
  closedInvoices?: ClosedInvoice[];
  latestReceipt: ReceiptView | null;
  coveringReceipts?: ReceiptView[];
};

type OrderRow = {
  orderId: string;
  orderNumber: string;
  companyName: string;
  cashAmount: string;
  paymentMethod: string | null;
  paymentGatewayPrimary: string | null;
  invoiceClosed: boolean;
  invoiceCompleteAt?: string | null;
  eligible: boolean;
  canEditPaymentType?: boolean;
  blockReason: string | null;
  modes: Array<{ key: string; label: string; mopName: string }>;
  selectedMop: string | null;
};

type CloseResult = {
  orderId: string;
  ref: string;
  success: boolean;
  error?: string;
  peStatus?: string;
};

function riderLabel(rider: RiderOption) {
  return rider.knownName || rider.name || rider.id;
}

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

export function RiderHandoverPanel({
  from,
  to,
  riders,
  canHandoverSummary,
  canHandoverReceive,
  disabled = false,
}: {
  from: string;
  to: string;
  riders: RiderOption[];
  canHandoverSummary: boolean;
  canHandoverReceive: boolean;
  disabled?: boolean;
}) {
  const [riderId, setRiderId] = useState("");
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [ordersRequested, setOrdersRequested] = useState(false);
  const [orderQuery, setOrderQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [orderTotal, setOrderTotal] = useState(0);
  const [ordersRefresh, setOrdersRefresh] = useState(0);
  const [modeByOrder, setModeByOrder] = useState<Record<string, string>>({});
  const [receipt, setReceipt] = useState<ReceiptView | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const isBusy = busyKey !== null || disabled;
  const slip = summary && summary.riderId === riderId && summary.from === from && summary.to === to ? summary : null;
  const shownReceipt = slip?.latestReceipt ?? receipt;
  const pageSize = 20;
  const rangeStart = orderTotal === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(orderTotal, page * pageSize);

  async function readError(res: Response) {
    const data = (await res.json().catch(() => ({}))) as { error?: string; latestReceipt?: ReceiptView };
    return data;
  }

  async function generateSummary() {
    if (!riderId) {
      notify.error("Select a rider");
      return;
    }
    setBusyKey("summary");
    try {
      const params = new URLSearchParams({ riderId, from, to });
      const res = await fetch(`/api/admin/riders/handover/summary?${params.toString()}`);
      const data = await readError(res);
      if (!res.ok) {
        notify.error(data.error ?? "Could not build the handover slip");
        return;
      }
      const next = data as SummaryResponse;
      setSummary(next);
      setReceipt(next.latestReceipt);
    } finally {
      setBusyKey(null);
    }
  }

  async function markReceived(confirmDuplicate = false) {
    if (!riderId) {
      notify.error("Select a rider");
      return;
    }
    setBusyKey("receive");
    try {
      const res = await fetch("/api/admin/riders/handover/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riderId, from, to, confirmDuplicate }),
      });
      const data = await readError(res);
      if (res.status === 409 && !confirmDuplicate) {
        const accepted = window.confirm(
          data.error ?? "Cash was already marked received for this rider and period. Record it again?",
        );
        if (!accepted) return;
        await markReceived(true);
        return;
      }
      if (!res.ok) {
        notify.error(data.error ?? "Could not mark money received");
        return;
      }
      setReceipt(data as ReceiptView);
      notify.success("Money received");
      if (canHandoverSummary) {
        const params = new URLSearchParams({ riderId, from, to });
        const summaryRes = await fetch(`/api/admin/riders/handover/summary?${params.toString()}`);
        if (summaryRes.ok) {
          setSummary((await summaryRes.json()) as SummaryResponse);
        }
      }
    } finally {
      setBusyKey(null);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = orderQuery.trim();
      setAppliedQuery((current) => {
        if (current !== next) setPage(1);
        return next;
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [orderQuery]);

  useEffect(() => {
    if (!ordersRequested || !riderId) return;
    const controller = new AbortController();
    async function run() {
      setBusyKey("orders");
      try {
        const params = new URLSearchParams({
          riderId,
          from,
          to,
          page: String(page),
          q: appliedQuery,
        });
        const res = await fetch(`/api/admin/riders/handover/orders?${params.toString()}`, {
          signal: controller.signal,
        });
        const data = await readError(res);
        if (!res.ok) {
          notify.error(data.error ?? "Could not load orders");
          return;
        }
        const payload = data as {
          orders?: OrderRow[];
          total?: number;
          page?: number;
          pageCount?: number;
        };
        const rows = payload.orders ?? [];
        setOrders(rows);
        setOrderTotal(payload.total ?? rows.length);
        setPageCount(payload.pageCount ?? 1);
        if (typeof payload.page === "number" && payload.page !== page) setPage(payload.page);
        setModeByOrder((current) => {
          const next = { ...current };
          for (const row of rows) {
            if (!next[row.orderId] && row.selectedMop) next[row.orderId] = row.selectedMop;
          }
          return next;
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        notify.error("Could not load orders");
      } finally {
        if (!controller.signal.aborted) setBusyKey(null);
      }
    }
    void run();
    return () => controller.abort();
  }, [ordersRequested, riderId, from, to, page, appliedQuery, ordersRefresh]);

  function loadOrders() {
    if (!riderId) {
      notify.error("Select a rider");
      return;
    }
    setOrdersRequested(true);
    setPage(1);
    setAppliedQuery(orderQuery.trim());
    setOrdersRefresh((value) => value + 1);
  }

  async function markInvoices() {
    if (!riderId) {
      notify.error("Select a rider");
      return;
    }
    setBusyKey("close");
    try {
      const modes = Object.entries(modeByOrder)
        .map(([orderId, modeOfPayment]) => ({ orderId, modeOfPayment: modeOfPayment.trim() }))
        .filter((row) => row.modeOfPayment);
      const res = await fetch("/api/admin/riders/handover/invoice-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riderId, from, to, modes }),
      });
      const data = await readError(res);
      if (!res.ok) {
        notify.error(data.error ?? "Could not mark invoices completed");
        return;
      }
      const results = ((data as { results?: CloseResult[] }).results ?? []);
      const failed = results.filter((row) => !row.success);
      const closed = results.length - failed.length;
      if (failed.length === 0) {
        notify.success(closed === 0 ? "No orders to close" : `Marked ${closed} invoice${closed === 1 ? "" : "s"} completed`);
      } else {
        const detail = failed
          .slice(0, 3)
          .map((row) => `${row.ref}: ${row.error ?? "failed"}`)
          .join(" ");
        notify.error(`${closed} closed, ${failed.length} failed. ${detail}`);
      }
      setOrdersRefresh((value) => value + 1);
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <Card>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .rider-handover-slip, .rider-handover-slip * { visibility: visible; }
          .rider-handover-slip {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white;
            color: black;
          }
        }
      `}</style>
      <CardHeader className="print:hidden">
        <CardTitle className="text-base">Cash handover</CardTitle>
        <CardDescription>
          One rider and the dates above. The slip is company cash only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3 print:hidden">
          <div>
            <label className="text-muted-foreground mb-1 block text-xs" htmlFor="handover-rider">
              Rider
            </label>
            <select
              id="handover-rider"
              className="border-input bg-background h-9 rounded-md border px-2 text-sm"
              value={riderId}
              disabled={isBusy}
              onChange={(event) => {
                setRiderId(event.target.value);
                setSummary(null);
                setOrders(null);
                setOrdersRequested(false);
                setOrderQuery("");
                setAppliedQuery("");
                setPage(1);
                setOrderTotal(0);
                setReceipt(null);
              }}
            >
              <option value="">Select rider</option>
              {riders.map((rider) => (
                <option key={rider.id} value={rider.id}>
                  {riderLabel(rider)}
                </option>
              ))}
            </select>
          </div>
          {canHandoverSummary ? (
            <Button type="button" disabled={isBusy} onClick={() => void generateSummary()}>
              {busyKey === "summary" ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Building...
                </>
              ) : (
                "Generate"
              )}
            </Button>
          ) : null}
          {canHandoverSummary ? (
            <Button type="button" variant="outline" disabled={isBusy || !slip} onClick={() => window.print()}>
              Print
            </Button>
          ) : null}
          {canHandoverReceive ? (
            <Button type="button" variant="outline" disabled={isBusy} onClick={() => void markReceived(false)}>
              {busyKey === "receive" ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Saving...
                </>
              ) : (
                "Mark money received"
              )}
            </Button>
          ) : null}
          {canHandoverReceive ? (
            <Button type="button" variant="outline" disabled={isBusy} onClick={() => loadOrders()}>
              {busyKey === "orders" ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Loading...
                </>
              ) : (
                "Load orders"
              )}
            </Button>
          ) : null}
        </div>

        {shownReceipt && !slip ? (
          <p className="text-muted-foreground text-sm print:hidden">
            Money received {formatWhen(shownReceipt.receivedAt)} by {shownReceipt.receivedByName}. Full total{" "}
            {shownReceipt.fullTotal}.
          </p>
        ) : null}

        {slip ? (
          <div className="rider-handover-slip space-y-4 rounded-md border p-4">
            <div>
              <h2 className="text-lg font-semibold">Cash handover</h2>
              <p>{slip.riderName}</p>
              <p>
                {slip.from} to {slip.to}
              </p>
            </div>
            {(slip.coveringReceipts ?? []).length > 0 ? (
              <div>
                <h3 className="text-sm font-semibold">Money received</h3>
                {(slip.coveringReceipts ?? []).map((line) => (
                  <p key={line.id}>
                    Money received {formatWhen(line.receivedAt)} by {line.receivedByName}
                    {line.periodFrom && line.periodTo ? ` for ${line.periodFrom} to ${line.periodTo}` : ""}. Full
                    total {line.fullTotal}.
                  </p>
                ))}
              </div>
            ) : null}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-1">Company</th>
                  <th className="py-1 text-right">Cash</th>
                </tr>
              </thead>
              <tbody>
                {slip.companies.length === 0 ? (
                  <tr>
                    <td className="py-1" colSpan={2}>
                      No cash to hand over
                    </td>
                  </tr>
                ) : (
                  slip.companies.map((line) => (
                    <tr key={line.companyName} className="border-b">
                      <td className="py-1">{line.companyName}</td>
                      <td className="py-1 text-right tabular-nums">{line.cashAmount}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr>
                  <th className="py-2 text-left">Full total</th>
                  <th className="py-2 text-right tabular-nums">{slip.fullTotal}</th>
                </tr>
              </tfoot>
            </table>
            {(slip.closedInvoices ?? []).length > 0 ? (
              <div>
                <h3 className="text-sm font-semibold">Invoice complete</h3>
                <table className="mt-1 w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-1">Order</th>
                      <th className="py-1">Company</th>
                      <th className="py-1">Marked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(slip.closedInvoices ?? []).map((line) => (
                      <tr key={`${line.orderNumber}-${line.invoiceCompleteAt ?? ""}`} className="border-b">
                        <td className="py-1 whitespace-nowrap">{line.orderNumber}</td>
                        <td className="py-1">{line.companyName}</td>
                        <td className="py-1 whitespace-nowrap">
                          {line.invoiceCompleteAt ? formatWhen(line.invoiceCompleteAt) : "Invoice complete"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <div className="grid gap-8 pt-10 sm:grid-cols-2">
              <div>
                <p>Handover by</p>
                <p className="mt-1 font-medium">{slip.riderName}</p>
                <div className="mt-12 border-b border-current" />
              </div>
              <div>
                <p>Cash collected</p>
                <div className="mt-16 border-b border-current" />
              </div>
            </div>
          </div>
        ) : null}

        {canHandoverReceive && ordersRequested ? (
          <div className="space-y-3 print:hidden">
            <div className="flex flex-wrap items-center gap-3">
              <Input
                value={orderQuery}
                onChange={(event) => setOrderQuery(event.target.value)}
                placeholder="Search order, company, payment"
                aria-label="Search loaded orders"
                className="max-w-sm"
              />
              <p className="text-muted-foreground text-xs">
                {rangeStart}–{rangeEnd} of {orderTotal}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-2 py-1">Order</th>
                    <th className="px-2 py-1">Company</th>
                    <th className="px-2 py-1 text-right">Cash</th>
                    <th className="px-2 py-1">Payment</th>
                    <th className="px-2 py-1">Invoice</th>
                    <th className="px-2 py-1">Payment type</th>
                  </tr>
                </thead>
                <tbody>
                  {busyKey === "orders" && !orders ? (
                    <tr>
                      <td className="px-2 py-2" colSpan={6}>
                        Loading…
                      </td>
                    </tr>
                  ) : orderTotal === 0 ? (
                    <tr>
                      <td className="px-2 py-2" colSpan={6}>
                        {appliedQuery
                          ? "No orders match this search."
                          : "No delivery-complete orders in this range."}
                      </td>
                    </tr>
                  ) : (
                    (orders ?? []).map((row) => (
                      <tr key={row.orderId} className="border-b">
                        <td className="px-2 py-2 whitespace-nowrap">{row.orderNumber}</td>
                        <td className="px-2 py-2">{row.companyName}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{row.invoiceClosed ? "—" : row.cashAmount}</td>
                        <td className="px-2 py-2">{row.paymentMethod || row.paymentGatewayPrimary || "—"}</td>
                        <td className="px-2 py-2">
                          {row.invoiceClosed
                            ? `Complete${row.invoiceCompleteAt ? ` ${formatWhen(row.invoiceCompleteAt)}` : ""}`
                            : row.blockReason || "Open"}
                        </td>
                        <td className="px-2 py-2">
                          {row.canEditPaymentType ? (
                            <select
                              className="border-input bg-background h-8 rounded-md border px-2 text-sm"
                              value={modeByOrder[row.orderId] ?? row.selectedMop ?? ""}
                              disabled={isBusy}
                              onChange={(event) =>
                                setModeByOrder((current) => ({
                                  ...current,
                                  [row.orderId]: event.target.value,
                                }))
                              }
                            >
                              <option value="">Select type</option>
                              {row.modes.map((mode) => (
                                <option key={mode.mopName} value={mode.mopName}>
                                  {mode.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {orderTotal > pageSize ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground tabular-nums">
                  {rangeStart}–{rangeEnd} of {orderTotal}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isBusy || page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    Previous
                  </Button>
                  <span className="tabular-nums">
                    {page} / {pageCount}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isBusy || page >= pageCount}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
            <Button type="button" disabled={isBusy} onClick={() => void markInvoices()}>
              {busyKey === "close" ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Marking...
                </>
              ) : (
                "Mark invoices completed"
              )}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
