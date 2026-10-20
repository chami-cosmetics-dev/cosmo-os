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
  receivedAt?: string | null;
  receivedByName?: string | null;
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

type CompanyOrders = {
  companyName: string;
  cashAmount: string;
  receivedAt: string | null;
  receivedByName: string | null;
  orders: OrderRow[];
};

type OrderRow = {
  orderId: string;
  orderNumber: string;
  companyName: string;
  deliveredAt?: string | null;
  cashAmount: string;
  paymentMethod: string | null;
  paymentGatewayPrimary: string | null;
  invoiceClosed: boolean;
  invoiceCompleteAt?: string | null;
  eligible: boolean;
  canEditPaymentType?: boolean;
  financeApprovalPending?: boolean;
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
  canExportHandover = false,
  disabled = false,
}: {
  from: string;
  to: string;
  riders: RiderOption[];
  canHandoverSummary: boolean;
  canHandoverReceive: boolean;
  canExportHandover?: boolean;
  disabled?: boolean;
}) {
  const [riderId, setRiderId] = useState("");
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [companies, setCompanies] = useState<CompanyOrders[] | null>(null);
  const [ordersRequested, setOrdersRequested] = useState(false);
  const [orderQuery, setOrderQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [orderTotal, setOrderTotal] = useState(0);
  const [ordersRefresh, setOrdersRefresh] = useState(0);
  const [modeByOrder, setModeByOrder] = useState<Record<string, string>>({});
  const [receipt, setReceipt] = useState<ReceiptView | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const isBusy = busyKey !== null || disabled;
  const slip = summary && summary.riderId === riderId && summary.from === from && summary.to === to ? summary : null;
  const shownReceipt = slip?.latestReceipt ?? receipt;

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

  async function markReceived(companyName: string, confirmDuplicate = false) {
    if (!riderId) {
      notify.error("Select a rider");
      return;
    }
    setBusyKey(`receive:${companyName}`);
    try {
      const res = await fetch("/api/admin/riders/handover/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riderId, from, to, companyName, confirmDuplicate }),
      });
      const data = await readError(res);
      if (res.status === 409 && !confirmDuplicate) {
        const accepted = window.confirm(
          data.error ?? `Cash was already marked received for ${companyName}. Record it again?`,
        );
        if (!accepted) return;
        await markReceived(companyName, true);
        return;
      }
      if (!res.ok) {
        notify.error(data.error ?? "Could not mark money received");
        return;
      }
      setReceipt(data as ReceiptView);
      notify.success(`Money received for ${companyName}`);
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
      setAppliedQuery(next);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [orderQuery]);

  useEffect(() => {
    if (!ordersRequested || !riderId || !canHandoverReceive) return;
    const controller = new AbortController();
    async function run() {
      setBusyKey("orders");
      try {
        const params = new URLSearchParams({
          riderId,
          from,
          to,
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
          companies?: CompanyOrders[];
          total?: number;
        };
        const nextCompanies = payload.companies ?? [];
        setCompanies(nextCompanies);
        setOrderTotal(payload.total ?? nextCompanies.reduce((sum, group) => sum + group.orders.length, 0));
        setModeByOrder((current) => {
          const next = { ...current };
          for (const group of nextCompanies) {
            for (const row of group.orders) {
              if (!next[row.orderId] && row.selectedMop) next[row.orderId] = row.selectedMop;
            }
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
  }, [ordersRequested, riderId, from, to, appliedQuery, ordersRefresh, canHandoverReceive]);

  function loadOrders() {
    if (!riderId) {
      notify.error("Select a rider");
      return;
    }
    setOrdersRequested(true);
    setAppliedQuery(orderQuery.trim());
    setOrdersRefresh((value) => value + 1);
  }

  async function exportStatus() {
    setBusyKey("export");
    try {
      const params = new URLSearchParams({ from, to });
      if (riderId) params.set("riderId", riderId);
      const res = await fetch(`/api/admin/riders/handover/export?${params.toString()}`);
      if (!res.ok) {
        const data = await readError(res);
        notify.error(data.error ?? "Could not export handover status");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `handover-status-${from}-to-${to}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusyKey(null);
    }
  }

  async function persistPaymentType(row: OrderRow, modeOfPayment: string) {
    if (!riderId) {
      notify.error("Select a rider");
      return;
    }
    setModeByOrder((current) => ({ ...current, [row.orderId]: modeOfPayment }));
    if (!modeOfPayment.trim()) return;
    const mopKey = row.modes.find((mode) => mode.mopName === modeOfPayment)?.key;
    if (mopKey !== "cash" && mopKey !== "cod" && mopKey !== "card_delivery") return;

    setBusyKey(`pay:${row.orderId}`);
    try {
      const res = await fetch("/api/admin/riders/handover/payment-method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          riderId,
          from,
          to,
          orderId: row.orderId,
          modeOfPayment,
        }),
      });
      const data = await readError(res);
      if (!res.ok) {
        notify.error(data.error ?? "Could not update payment method");
        return;
      }
      setOrdersRefresh((value) => value + 1);
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

  async function markInvoices(companyName: string) {
    if (!riderId) {
      notify.error("Select a rider");
      return;
    }
    const company = companies?.find((group) => group.companyName === companyName);
    const orderIds = new Set(company?.orders.map((row) => row.orderId) ?? []);
    setBusyKey(`close:${companyName}`);
    try {
      const modes = Object.entries(modeByOrder)
        .filter(([orderId]) => orderIds.has(orderId))
        .map(([orderId, modeOfPayment]) => ({ orderId, modeOfPayment: modeOfPayment.trim() }))
        .filter((row) => row.modeOfPayment);
      const res = await fetch("/api/admin/riders/handover/invoice-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riderId, from, to, companyName, modes }),
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
          One rider and the dates above. Each assigned company confirms its own cash and closes only its invoices.
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
                setCompanies(null);
                setOrdersRequested(false);
                setOrderQuery("");
                setAppliedQuery("");
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
          {canExportHandover ? (
            <Button type="button" variant="outline" disabled={isBusy} onClick={() => void exportStatus()}>
              {busyKey === "export" ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Exporting...
                </>
              ) : (
                "Export handover status"
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
                      <td className="py-1">
                        <div>{line.companyName}</div>
                        {line.receivedAt ? (
                          <div className="text-muted-foreground text-xs">
                            Received {formatWhen(line.receivedAt)}
                            {line.receivedByName ? ` by ${line.receivedByName}` : ""}
                          </div>
                        ) : null}
                        {canHandoverReceive ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-1 print:hidden"
                            disabled={isBusy}
                            onClick={() => void markReceived(line.companyName, false)}
                          >
                            {busyKey === `receive:${line.companyName}` ? (
                              <>
                                <Loader2 className="animate-spin" aria-hidden />
                                Saving...
                              </>
                            ) : (
                              "Mark money received"
                            )}
                          </Button>
                        ) : null}
                      </td>
                      <td className="py-1 text-right align-top tabular-nums">{line.cashAmount}</td>
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
              <p className="text-muted-foreground text-xs">{orderTotal} orders</p>
            </div>
            {busyKey === "orders" && !companies ? (
              <p className="text-sm">Loading…</p>
            ) : orderTotal === 0 ? (
              <p className="text-sm">
                {appliedQuery ? "No orders match this search." : "No delivery-complete orders in this range."}
              </p>
            ) : (
              (companies ?? []).map((group) => (
                <section key={group.companyName} className="space-y-2 rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold">{group.companyName}</h3>
                      <p className="text-muted-foreground text-xs">
                        Cash {group.cashAmount}
                        {group.receivedAt
                          ? ` · Received ${formatWhen(group.receivedAt)}${group.receivedByName ? ` by ${group.receivedByName}` : ""}`
                          : " · Money not received"}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isBusy}
                      onClick={() => void markReceived(group.companyName, false)}
                    >
                      {busyKey === `receive:${group.companyName}` ? (
                        <>
                          <Loader2 className="animate-spin" aria-hidden />
                          Saving...
                        </>
                      ) : (
                        "Mark money received"
                      )}
                    </Button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="px-2 py-1">Order</th>
                          <th className="px-2 py-1 text-right">Cash</th>
                          <th className="px-2 py-1">Payment</th>
                          <th className="px-2 py-1">Delivered</th>
                          <th className="px-2 py-1">Invoice</th>
                          <th className="px-2 py-1">Payment type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.orders.map((row) => (
                          <tr key={row.orderId} className="border-b">
                            <td className="px-2 py-2 whitespace-nowrap">{row.orderNumber}</td>
                            <td className="px-2 py-2 text-right tabular-nums">
                              {row.invoiceClosed ? "—" : row.cashAmount}
                            </td>
                            <td className="px-2 py-2">{row.paymentMethod || row.paymentGatewayPrimary || "—"}</td>
                            <td className="px-2 py-2 whitespace-nowrap">
                              {row.deliveredAt ? formatWhen(row.deliveredAt) : "—"}
                            </td>
                            <td className="px-2 py-2">
                              {row.invoiceClosed ? (
                                `Complete${row.invoiceCompleteAt ? ` ${formatWhen(row.invoiceCompleteAt)}` : ""}`
                              ) : row.financeApprovalPending ? (
                                <span className="inline-flex rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-800">
                                  Finance approval pending
                                </span>
                              ) : (
                                row.blockReason || "Open"
                              )}
                            </td>
                            <td className="px-2 py-2">
                              {row.canEditPaymentType ? (
                                <select
                                  className="border-input bg-background h-8 rounded-md border px-2 text-sm"
                                  value={modeByOrder[row.orderId] ?? row.selectedMop ?? ""}
                                  disabled={isBusy}
                                  onChange={(event) =>
                                    void persistPaymentType(row, event.target.value)
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
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Button type="button" disabled={isBusy} onClick={() => void markInvoices(group.companyName)}>
                    {busyKey === `close:${group.companyName}` ? (
                      <>
                        <Loader2 className="animate-spin" aria-hidden />
                        Marking...
                      </>
                    ) : (
                      "Mark invoices completed"
                    )}
                  </Button>
                </section>
              ))
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
