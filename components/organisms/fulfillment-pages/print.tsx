"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Loader2, Printer, RefreshCw, Search } from "lucide-react";

import {
  FulfillmentPermissionsProvider,
  useFulfillmentPermissions,
} from "@/components/contexts/fulfillment-permissions-context";
import { Button } from "@/components/ui/button";
import { FulfillmentOrderReference } from "@/components/molecules/fulfillment-order-reference";
import { Input } from "@/components/ui/input";
import { formatFulfillmentOrderReferenceText } from "@/lib/fulfillment-order-reference";
import type { FulfillmentPermissions } from "@/lib/fulfillment-permissions";
import { notify } from "@/lib/notify";
import { getPaymentMethodInfo } from "@/lib/payment-method-label";
import { mapApiOrderToFulfillmentOrder } from "@/lib/fulfillment-order-map";
import { TASK_REMINDER_ORDER_ID_PARAM } from "@/lib/task-reminder-links";

type PrintOrder = {
  id: string;
  name: string | null;
  orderNumber: string | null;
  shopifyOrderId?: string | null;
  erpnextInvoiceId: string | null;
  sourceName: string;
  totalPrice: string;
  currency: string | null;
  customerPhone: string | null;
  printCount: number;
  lastPrintedAt: string | null;
  companyLocation: { id: string; name: string } | null;
  assignedMerchant: { id: string; name: string | null; email: string | null } | null;
  merchantCouponCode?: string | null;
  financialStatus: string | null;
  paymentGatewayPrimary?: string | null;
  paymentGatewayNames?: string[] | null;
  createdAt: string;
};

function orderLabel(order: PrintOrder): string {
  return formatFulfillmentOrderReferenceText(order);
}

function printMerchantLabel(order: PrintOrder): string {
  const assigned =
    order.assignedMerchant?.name?.trim() ||
    order.assignedMerchant?.email?.trim() ||
    null;
  if (assigned) return assigned;
  const coupon = order.merchantCouponCode?.trim();
  if (coupon) return coupon;
  return "—";
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

const PRINT_QUEUE_PAGE_SIZE = 100;

async function fetchAllPrintQueueOrders(search: string): Promise<PrintOrder[]> {
  const allOrders: PrintOrder[] = [];
  let page = 1;
  let total = 0;

  while (true) {
    const params = new URLSearchParams({
      sort_by: "updated",
      sort_order: "desc",
      limit: String(PRINT_QUEUE_PAGE_SIZE),
      page: String(page),
      print_mode: "true",
      unprinted_only: "true",
    });
    if (search.trim()) params.set("search", search.trim());

    const res = await fetch(`/api/admin/orders/page-data?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to load print queue");

    const data = (await res.json()) as { orders?: PrintOrder[]; total?: number };
    const batch = data.orders ?? [];
    total = data.total ?? batch.length;
    allOrders.push(...batch);

    if (allOrders.length >= total || batch.length < PRINT_QUEUE_PAGE_SIZE) break;
    page += 1;
  }

  return allOrders;
}

function PrintQueueInner() {
  const perms = useFulfillmentPermissions();
  const searchParams = useSearchParams();

  const [orders, setOrders] = useState<PrintOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [printing, setPrinting] = useState(false);
  const [view, setView] = useState<"queue" | "history">("queue");
  const [refreshTick, setRefreshTick] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const appliedDeepLinkRef = useRef<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setHistoryPage(1);
  }, [debouncedSearch]);

  const deepLinkOrderId = searchParams.get(TASK_REMINDER_ORDER_ID_PARAM)?.trim() ?? null;

  useEffect(() => {
    if (!deepLinkOrderId || appliedDeepLinkRef.current === deepLinkOrderId) return;
    const inList = orders.find((order) => order.id === deepLinkOrderId);
    if (inList) {
      setView("queue");
      setSelected(new Set([deepLinkOrderId]));
      appliedDeepLinkRef.current = deepLinkOrderId;
      return;
    }
    if (loading) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/orders/${deepLinkOrderId}`);
        if (!res.ok) return;
        const payload = (await res.json()) as {
          merchantCouponCode?: string | null;
        } & Parameters<typeof mapApiOrderToFulfillmentOrder>[0];
        const data = mapApiOrderToFulfillmentOrder(payload);
        if (cancelled) return;
        const printOrder: PrintOrder = {
          id: data.id,
          name: data.name,
          orderNumber: data.orderNumber,
          shopifyOrderId: data.shopifyOrderId,
          erpnextInvoiceId: data.erpnextInvoiceId ?? null,
          sourceName: data.sourceName,
          totalPrice: data.totalPrice,
          currency: data.currency,
          customerPhone: data.customerPhone,
          printCount: data.printCount ?? 0,
          lastPrintedAt: null,
          companyLocation: data.companyLocation,
          assignedMerchant: data.assignedMerchant,
          merchantCouponCode: payload.merchantCouponCode ?? null,
          financialStatus: null,
          paymentGatewayPrimary: data.paymentGatewayPrimary,
          paymentGatewayNames: data.paymentGatewayNames,
          createdAt: data.createdAt,
        };
        setView("queue");
        setOrders((current) =>
          current.some((order) => order.id === printOrder.id)
            ? current
            : [printOrder, ...current],
        );
        setSelected(new Set([deepLinkOrderId]));
        appliedDeepLinkRef.current = deepLinkOrderId;
      } catch {
        // ignore — user can still pick from queue manually
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [deepLinkOrderId, loading, orders]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      if (view === "queue") {
        const nextOrders = await fetchAllPrintQueueOrders(debouncedSearch);
        setOrders(nextOrders);
        if (deepLinkOrderId && nextOrders.some((order) => order.id === deepLinkOrderId)) {
          setView("queue");
          setSelected(new Set([deepLinkOrderId]));
          appliedDeepLinkRef.current = deepLinkOrderId;
        } else {
          setSelected(new Set());
          if (deepLinkOrderId) appliedDeepLinkRef.current = null;
        }
        return;
      }

      const params = new URLSearchParams({
        sort_by: "updated",
        sort_order: "desc",
        limit: String(PRINT_QUEUE_PAGE_SIZE),
        page: String(historyPage),
        print_history_mode: "true",
      });

      if (debouncedSearch.trim()) {
        params.set("search", debouncedSearch.trim());
      }

      const res = await fetch(`/api/admin/orders/page-data?${params.toString()}`);
      if (!res.ok) {
        notify.error("Failed to load print queue");
        return;
      }
      const data = (await res.json()) as { orders?: PrintOrder[]; total?: number };
      const nextOrders = data.orders ?? [];
      setOrders(nextOrders);
      setHistoryTotal(data.total ?? nextOrders.length);
      setSelected(new Set());
      if (deepLinkOrderId) appliedDeepLinkRef.current = null;
    } catch {
      notify.error("Failed to load print queue");
    } finally {
      setLoading(false);
    }
  }, [view, debouncedSearch, deepLinkOrderId, historyPage]);

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
    setPrinting(true);
    try {
      const groupRes = await fetch("/api/admin/fulfillment/pick-list/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: ids }),
      });
      if (!groupRes.ok) {
        const json = (await groupRes.json().catch(() => ({}))) as { error?: string };
        notify.error(json.error ?? "Failed to create pick list group");
        setPrinting(false);
        return;
      }

      const idsParam = encodeURIComponent(ids.join(","));
      window.open(`/api/admin/orders/bulk-print?ids=${idsParam}`, "_blank", "noopener");
      notify.success(
        `Printing ${ids.length} invoice${ids.length !== 1 ? "s" : ""}. Download the pick list from Inventory Pick List.`,
      );
      setTimeout(() => {
        setRefreshTick((t) => t + 1);
        setPrinting(false);
      }, 1500);
    } catch {
      notify.error("Bulk print failed");
      setPrinting(false);
    }
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
            Select invoices to print. Printed orders move to dispatch as &ldquo;Printed&rdquo; — use Package Ready on single dispatch when needed.
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
                : "No printed orders found."}
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
                        <FulfillmentOrderReference order={order} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {order.companyLocation?.name ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {printMerchantLabel(order)}
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
          <div className="flex items-center justify-between border-t border-border/70 px-4 py-2 text-xs text-muted-foreground">
            <span>
              {view === "queue"
                ? `${unprinted.length} unprinted order${unprinted.length !== 1 ? "s" : ""} in queue`
                : historyTotal > PRINT_QUEUE_PAGE_SIZE
                  ? `Showing ${(historyPage - 1) * PRINT_QUEUE_PAGE_SIZE + 1}–${(historyPage - 1) * PRINT_QUEUE_PAGE_SIZE + orders.length} of ${historyTotal} printed orders`
                  : `${historyTotal} printed order${historyTotal !== 1 ? "s" : ""}`}
              {selected.size > 0 && ` · ${selected.size} selected`}
            </span>
            {view === "history" && historyTotal > PRINT_QUEUE_PAGE_SIZE && (
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={historyPage <= 1 || loading}
                  onClick={() => setHistoryPage((p) => p - 1)}
                >
                  ← Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={historyPage >= Math.ceil(historyTotal / PRINT_QUEUE_PAGE_SIZE) || loading}
                  onClick={() => setHistoryPage((p) => p + 1)}
                >
                  Next →
                </Button>
              </div>
            )}
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
