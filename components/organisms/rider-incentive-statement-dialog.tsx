"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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
  orderNumber: string;
  invoiceNumber: string;
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
    void load();
  }, [open, load, refreshKey]);

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

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {loading ? (
            <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading orders…
            </div>
          ) : statement && statement.companies.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              No completed deliveries in this range.
            </p>
          ) : (
            statement?.companies.map((company) => (
              <section key={company.company} className="rounded-lg border">
                <div className="bg-secondary/30 flex flex-wrap items-baseline justify-between gap-2 px-3 py-2">
                  <h3 className="text-sm font-medium">{company.company}</h3>
                  <p className="text-sm tabular-nums">
                    {company.orders.length} orders · shipping {company.shippingTotal} · rider pay{" "}
                    {company.riderPaymentTotal}
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-muted-foreground text-left">
                      <tr>
                        <th className="px-3 py-1.5 font-medium">Date</th>
                        <th className="px-3 py-1.5 font-medium">Order</th>
                        <th className="px-3 py-1.5 font-medium">Invoice</th>
                        <th className="px-3 py-1.5 font-medium">Delivery</th>
                        <th className="px-3 py-1.5 font-medium">Invoice status</th>
                        <th className="px-3 py-1.5 text-right font-medium">Shipping</th>
                        <th className="px-3 py-1.5 text-right font-medium">Rider pay</th>
                      </tr>
                    </thead>
                    <tbody>
                      {company.orders.map((order, index) => (
                        <tr key={`${order.date}-${order.orderNumber}-${order.invoiceNumber}-${index}`} className="border-t">
                          <td className="px-3 py-1.5 whitespace-nowrap">{order.date}</td>
                          <td className="px-3 py-1.5">{order.orderNumber || "—"}</td>
                          <td className="px-3 py-1.5">{order.invoiceNumber || "—"}</td>
                          <td className="px-3 py-1.5">{order.deliveryStatus}</td>
                          <td className="px-3 py-1.5">
                            {order.invoiceStatus}
                            {order.unmatched ? (
                              <span className="bg-destructive/10 text-destructive ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase">
                                unmatched
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{order.shippingCost}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{order.riderPayment}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))
          )}
        </div>

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
