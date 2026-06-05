"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, Printer, RefreshCw, Search } from "lucide-react";

import {
  FulfillmentPermissionsProvider,
  useFulfillmentPermissions,
} from "@/components/contexts/fulfillment-permissions-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FulfillmentPermissions } from "@/lib/fulfillment-permissions";
import { notify } from "@/lib/notify";
import { getPaymentMethodInfo } from "@/lib/payment-method-label";

type PrintOrder = {
  id: string;
  name: string | null;
  orderNumber: string | null;
  erpnextInvoiceId: string | null;
  sourceName: string;
  totalPrice: string;
  currency: string | null;
  customerPhone: string | null;
  printCount: number;
  lastPrintedAt: string | null;
  companyLocation: { id: string; name: string } | null;
  assignedMerchant: { id: string; name: string | null; email: string | null } | null;
  financialStatus: string | null;
  paymentGatewayPrimary?: string | null;
  paymentGatewayNames?: string[] | null;
  createdAt: string;
};

function orderLabel(order: PrintOrder): string {
  return order.name ?? order.orderNumber ?? order.erpnextInvoiceId ?? order.id;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-LK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-LK", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function PrintQueueInner() {
  const perms = useFulfillmentPermissions();

  const [orders, setOrders] = useState<PrintOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [printing, setPrinting] = useState(false);
  const [view, setView] = useState<"queue" | "history">("queue");
  const [historyDate, setHistoryDate] = useState(todayStr());
  const [refreshTick, setRefreshTick] = useState(0);
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        sort_by: "updated",
        sort_order: "desc",
        limit: "200",
      });

      if (debouncedSearch.trim()) {
        params.set("search", debouncedSearch.trim());
      }

      if (view === "queue") {
        params.set("print_mode", "true");
        params.set("unprinted_only", "true");
      } else {
        params.set("print_history_mode", "true");
        const start = new Date(historyDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(historyDate);
        end.setHours(23, 59, 59, 999);
        params.set("last_printed_from", start.toISOString());
        params.set("last_printed_to", end.toISOString());
      }

      const res = await fetch(`/api/admin/orders/page-data?${params.toString()}`);
      if (!res.ok) {
        notify.error("Failed to load print queue");
        return;
      }
      const data = (await res.json()) as { orders?: PrintOrder[] };
      setOrders(data.orders ?? []);
      setSelected(new Set());
    } catch {
      notify.error("Failed to load print queue");
    } finally {
      setLoading(false);
    }
  }, [view, historyDate, debouncedSearch]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders, refreshTick]);

  const unprinted = orders.filter((o) => o.printCount === 0);
  const selectedUnprinted = unprinted.filter((o) => selected.has(o.id));
  // queue tab
  const queueAllSelected = unprinted.length > 0 && unprinted.every((o) => selected.has(o.id));
  const queueSomeSelected = unprinted.some((o) => selected.has(o.id));
  // history tab
  const historyAllSelected = orders.length > 0 && orders.every((o) => selected.has(o.id));
  const historySomeSelected = orders.some((o) => selected.has(o.id));

  const allSelected = view === "queue" ? queueAllSelected : historyAllSelected;
  const someSelected = view === "queue" ? queueSomeSelected : historySomeSelected;

  // Drive the indeterminate state of the select-all checkbox
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      const ids = view === "queue" ? unprinted.map((o) => o.id) : orders.map((o) => o.id);
      setSelected(new Set(ids));
    }
  }

  async function doPrint(ids: string[]) {
    const idsParam = encodeURIComponent(ids.join(","));
    window.open(`/api/admin/orders/bulk-print?ids=${idsParam}`, "_blank", "noopener");
    window.open(
      `/api/admin/orders/location-pick-list?download=1&ids=${idsParam}`,
      "_blank",
      "noopener"
    );
    notify.success(`Opened ${ids.length} invoice${ids.length !== 1 ? "s" : ""} for printing`);
    setTimeout(() => {
      setRefreshTick((t) => t + 1);
      setPrinting(false);
    }, 1500);
  }

  function handlePrintSelected() {
    const ids = selectedUnprinted.map((o) => o.id);
    if (ids.length === 0) return;
    setPrinting(true);
    void doPrint(ids);
  }

  function handlePrintAll() {
    if (unprinted.length === 0) {
      notify.info("No unprinted orders in the queue");
      return;
    }
    setPrinting(true);
    void doPrint(unprinted.map((o) => o.id));
  }

  function handleReprint() {
    const ids = orders.filter((o) => selected.has(o.id)).map((o) => o.id);
    if (ids.length === 0) return;
    setPrinting(true);
    void doPrint(ids);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Order Print</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Select invoices to print. Printed orders automatically advance to dispatch.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-1 shrink-0 gap-2"
          disabled={loading}
          onClick={() => setRefreshTick((t) => t + 1)}
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Tab nav */}
      <div className="flex gap-6 border-b border-border/70">
        {(["queue", "history"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setView(tab)}
            className={`-mb-px pb-2.5 text-sm font-medium border-b-2 capitalize transition-colors ${
              view === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "queue"
              ? `Print Queue${!loading && view === "queue" ? ` (${unprinted.length})` : ""}`
              : "Print History"}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-border/70 bg-background">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-border/70 px-4 py-3">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by invoice, order number, phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-9"
            />
          </div>

          {view === "history" && (
            <>
              <Input
                type="date"
                value={historyDate}
                onChange={(e) => setHistoryDate(e.target.value)}
                className="h-9 w-44"
              />
              {perms.canPrint && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 gap-1.5"
                  disabled={!orders.some((o) => selected.has(o.id)) || printing}
                  onClick={handleReprint}
                >
                  {printing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Printer className="size-4" />
                  )}
                  Reprint Selected
                  {orders.filter((o) => selected.has(o.id)).length > 0 &&
                    ` (${orders.filter((o) => selected.has(o.id)).length})`}
                </Button>
              )}
            </>
          )}

          {view === "queue" && perms.canPrint && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-9 gap-1.5"
                disabled={selectedUnprinted.length === 0 || printing}
                onClick={handlePrintSelected}
              >
                {printing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Printer className="size-4" />
                )}
                Print Selected
                {selectedUnprinted.length > 0 && ` (${selectedUnprinted.length})`}
              </Button>
              <Button
                size="sm"
                className="h-9 gap-1.5"
                disabled={unprinted.length === 0 || printing}
                onClick={handlePrintAll}
              >
                {printing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Printer className="size-4" />
                )}
                Print All ({unprinted.length})
              </Button>
            </>
          )}
        </div>

        {/* Body */}
        {loading && orders.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading orders…
          </div>
        ) : orders.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {view === "queue"
              ? debouncedSearch
                ? "No matching orders found."
                : "No unprinted orders in the queue."
              : debouncedSearch
                ? "No matching printed orders found."
                : "No printed orders found for this date."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-200 text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-muted/40">
                  <th className="w-12 px-4 py-2.5">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="size-4 cursor-pointer rounded border-border accent-primary"
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Invoice
                  </th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Location
                  </th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Merchant
                  </th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Phone
                  </th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Payment
                  </th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Total
                  </th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {view === "history" ? "Printed At" : "Date"}
                  </th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {orders.map((order) => {
                  const isPrinted = order.printCount > 0;
                  const isSelected = selected.has(order.id);
                  const label = orderLabel(order);
                  const erpId = order.erpnextInvoiceId;
                  const showErpId = erpId && erpId !== label;
                  const payment = getPaymentMethodInfo({
                    paymentGatewayPrimary: order.paymentGatewayPrimary,
                    paymentGatewayNames: order.paymentGatewayNames,
                    financialStatus: order.financialStatus,
                  });
                  const dateIso =
                    view === "history" && order.lastPrintedAt
                      ? order.lastPrintedAt
                      : order.createdAt;

                  return (
                    <tr
                      key={order.id}
                      onClick={
                        view === "queue" && isPrinted ? undefined : () => toggleOne(order.id)
                      }
                      className={`transition-colors ${
                        view === "history" || !isPrinted ? "cursor-pointer" : ""
                      } ${
                        isSelected
                          ? "bg-primary/5"
                          : view === "queue" && isPrinted
                            ? "opacity-55"
                            : "hover:bg-muted/30"
                      }`}
                    >
                      <td
                        className="px-4 py-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={view === "queue" && isPrinted}
                          onChange={() => toggleOne(order.id)}
                          className="size-4 cursor-pointer rounded border-border accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`Select ${label}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className="block font-medium leading-tight">{label}</span>
                        {showErpId && (
                          <span className="mt-0.5 block font-mono text-xs leading-tight text-muted-foreground">
                            {erpId}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {order.companyLocation?.name ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {order.assignedMerchant?.name ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {order.customerPhone ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {payment.label}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">
                        {Number(order.totalPrice).toLocaleString("en-LK", {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="block text-sm">{fmtDate(dateIso)}</span>
                        <span className="block text-xs text-muted-foreground">
                          {fmtTime(dateIso)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {isPrinted ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <Check className="size-3" />
                            Printed
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                            Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && orders.length > 0 && (
          <div className="border-t border-border/70 px-4 py-2 text-xs text-muted-foreground">
            {view === "queue"
              ? `${unprinted.length} unprinted order${unprinted.length !== 1 ? "s" : ""} in queue`
              : `${orders.length} order${orders.length !== 1 ? "s" : ""} printed`}
            {selected.size > 0 && ` · ${selected.size} selected`}
          </div>
        )}
      </div>
    </div>
  );
}

export function PrintFulfillmentPage({
  permissions,
}: {
  permissions: FulfillmentPermissions;
}) {
  return (
    <FulfillmentPermissionsProvider permissions={permissions}>
      <PrintQueueInner />
    </FulfillmentPermissionsProvider>
  );
}
