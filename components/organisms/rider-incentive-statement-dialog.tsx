"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { notify } from "@/lib/notify";

type StatementOrder = {
  date: string;
  shopifyOrderId: string;
  shopifyOrderNumber: string;
  invoiceNumber: string;
  customerName: string;
  phone: string;
  address: string;
  deliveryCity: string;
  deliveryCompletedAt: string;
  invoiceCompletedAt: string;
  deliveryStatus: string;
  invoiceStatus: "Complete" | "Open";
  shippingCost: string;
  riderPayment: string;
  unmatched: boolean;
};

type StatementCompany = {
  company: string;
  orders: StatementOrder[];
  shippingTotal: string;
  riderPaymentTotal: string;
};

type Statement = {
  riderName: string;
  companies: StatementCompany[];
  shippingTotal: string;
  riderPaymentTotal: string;
  unmatchedCount: number;
};

type ListedOrder = StatementOrder & { company: string };

const PAGE_SIZE = 20;

function orderMatchesSearch(order: ListedOrder, query: string) {
  const haystack = [
    order.company,
    order.shopifyOrderId,
    order.shopifyOrderNumber,
    order.invoiceNumber,
    order.customerName,
    order.phone,
    order.address,
    order.deliveryCity,
    order.invoiceStatus,
    order.deliveryCompletedAt,
    order.invoiceCompletedAt,
    order.riderPayment,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

export function RiderIncentiveStatementDialog({
  open,
  onOpenChange,
  riderId,
  riderLabel,
  from,
  to,
  refreshKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  riderId: string | null;
  riderLabel: string;
  from: string;
  to: string;
  refreshKey: number;
}) {
  const [statement, setStatement] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    if (!riderId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to, riderId });
      const res = await fetch(`/api/admin/riders/performance/statement?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(typeof data.error === "string" ? data.error : "Failed to load orders");
        setStatement(null);
        return;
      }
      setStatement({
        riderName: typeof data.riderName === "string" ? data.riderName : riderLabel,
        companies: Array.isArray(data.companies) ? data.companies : [],
        shippingTotal: String(data.shippingTotal ?? "0.00"),
        riderPaymentTotal: String(data.riderPaymentTotal ?? "0.00"),
        unmatchedCount: Number(data.unmatchedCount ?? 0),
      });
    } catch {
      notify.error("Failed to load orders");
      setStatement(null);
    } finally {
      setLoading(false);
    }
  }, [from, riderId, riderLabel, to]);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setPage(0);
    void load();
  }, [open, load, refreshKey]);

  const orders = useMemo<ListedOrder[]>(() => {
    if (!statement) return [];
    return statement.companies.flatMap((company) =>
      company.orders.map((order) => ({ ...order, company: company.company })),
    );
  }, [statement]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return orders;
    return orders.filter((order) => orderMatchesSearch(order, query));
  }, [orders, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageOrders = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const rangeStart = filtered.length === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const rangeEnd = Math.min(filtered.length, (safePage + 1) * PAGE_SIZE);

  const unmatched = statement?.unmatchedCount ?? 0;
  const exportBlocked = unmatched > 0;

  async function exportCsv() {
    if (!riderId || exportBlocked) return;
    setExporting(true);
    try {
      const params = new URLSearchParams({ from, to, riderId });
      const res = await fetch(`/api/admin/riders/performance/statement/export?${params}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        notify.error(typeof data.error === "string" ? data.error : "Export failed");
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const fileName = match?.[1] ?? "rider-incentive.csv";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      notify.error("Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{statement?.riderName || riderLabel}</DialogTitle>
          <DialogDescription>
            {from} to {to}. Orders by company. Rider payment counts only when the invoice is complete.
          </DialogDescription>
        </DialogHeader>

        {statement && !loading ? (
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
            placeholder="Search order, invoice, customer, phone, city, company"
            aria-label="Search orders"
          />
        ) : null}

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {loading ? (
            <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading orders…
            </div>
          ) : statement && orders.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              No completed deliveries in this range.
            </p>
          ) : statement ? (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                {statement.companies.map((company) => (
                  <div key={company.company} className="bg-secondary/30 rounded-lg px-3 py-2 text-sm">
                    <p className="font-medium">{company.company}</p>
                    <p className="text-muted-foreground tabular-nums">
                      {company.orders.length} orders · shipping {company.shippingTotal} · rider pay{" "}
                      {company.riderPaymentTotal}
                    </p>
                  </div>
                ))}
              </div>
              {filtered.length === 0 ? (
                <p className="text-muted-foreground py-6 text-center text-sm">No orders match that search.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="text-muted-foreground text-left">
                      <tr>
                        <th className="px-3 py-1.5 font-medium">Company</th>
                        <th className="px-3 py-1.5 font-medium">Delivery completed</th>
                        <th className="px-3 py-1.5 font-medium">Invoice completed</th>
                        <th className="px-3 py-1.5 font-medium">Shopify</th>
                        <th className="px-3 py-1.5 font-medium">ERP</th>
                        <th className="px-3 py-1.5 font-medium">City</th>
                        <th className="px-3 py-1.5 text-right font-medium">Rider pay</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageOrders.map((order, index) => (
                        <tr
                          key={`${order.company}-${order.shopifyOrderId}-${order.invoiceNumber}-${index}`}
                          className="border-t"
                        >
                          <td className="px-3 py-1.5">{order.company}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap">
                            {order.deliveryCompletedAt || order.date}
                          </td>
                          <td className="px-3 py-1.5 whitespace-nowrap">{order.invoiceCompletedAt || "Open"}</td>
                          <td className="px-3 py-1.5">{order.shopifyOrderNumber || order.shopifyOrderId || "—"}</td>
                          <td className="px-3 py-1.5">{order.invoiceNumber || "—"}</td>
                          <td className="px-3 py-1.5">{order.deliveryCity || "—"}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {order.riderPayment}
                            {order.unmatched ? (
                              <span className="bg-destructive/10 text-destructive ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase">
                                unmatched
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}
        </div>

        {statement && !loading && filtered.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground tabular-nums">
              {rangeStart}–{rangeEnd} of {filtered.length}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={safePage === 0}
                onClick={() => setPage(safePage - 1)}
              >
                Previous
              </Button>
              <span className="tabular-nums">
                {safePage + 1} / {pageCount}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage(safePage + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}

        {statement && !loading ? (
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-t pt-3 text-sm">
            <span className="font-medium">Full total</span>
            <span className="tabular-nums">
              shipping {statement.shippingTotal} · rider pay {statement.riderPaymentTotal}
            </span>
          </div>
        ) : null}

        {exportBlocked ? (
          <p className="text-destructive text-sm">
            Finish {unmatched} unmatched {unmatched === 1 ? "order" : "orders"} before export.
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            onClick={() => void exportCsv()}
            disabled={loading || exporting || exportBlocked || !statement}
          >
            {exporting ? "Exporting…" : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
