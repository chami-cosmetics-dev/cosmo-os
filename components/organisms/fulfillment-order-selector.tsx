"use client";

import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { FulfillmentOrderInvoiceDetails } from "@/components/organisms/fulfillment-order-invoice-details";
import { notify } from "@/lib/notify";

export type FulfillmentOrder = {
  id: string;
  orderNumber: string | null;
  name: string | null;
  sourceName: string;
  totalPrice: string;
  currency: string | null;
  createdAt: string;
  companyLocation: { id: string; name: string } | null;
  assignedMerchant: { id: string; name: string | null; email: string | null } | null;
  customerEmail: string | null;
  customerPhone: string | null;
  printCount?: number;
  packageOnHoldAt?: string | null;
  packageHoldReason?: { id: string; name: string } | null;
  fulfillmentStage?: string | null;
};

interface FulfillmentOrderSelectorProps {
  title: string;
  description: string;
  stages: string;
  selectedOrderId: string | null;
  onSelectOrder: (order: FulfillmentOrder | null) => void;
  refreshTrigger?: number;
  invoiceRefreshTrigger?: number;
  showPrintStatus?: boolean;
  showHoldStatus?: boolean;
  children?: React.ReactNode;
}

export function FulfillmentOrderSelector({
  title,
  description,
  stages,
  selectedOrderId,
  onSelectOrder,
  refreshTrigger = 0,
  invoiceRefreshTrigger = 0,
  showPrintStatus = false,
  showHoldStatus = false,
  children,
}: FulfillmentOrderSelectorProps) {
  const [orders, setOrders] = useState<FulfillmentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(5);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, refreshTrigger]);

  const fetchOrders = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("fulfillment_stages", stages);
    params.set("page", String(page));
    params.set("limit", String(limit));
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    const res = await fetch(`/api/admin/orders/page-data?${params}`);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      notify.error(data.error ?? "Failed to load orders");
      return;
    }
    const data = (await res.json()) as {
      orders: FulfillmentOrder[];
      total: number;
    };
    setOrders(data.orders ?? []);
    setTotal(data.total ?? 0);
  }, [stages, debouncedSearch, refreshTrigger, page, limit]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchOrders()
      .then(() => {
        if (!cancelled) setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchOrders]);

  function formatPrice(val: string, currency?: string | null): string {
    const n = parseFloat(val);
    if (Number.isNaN(n)) return val;
    return n.toLocaleString("en-LK", { minimumFractionDigits: 2 }) + (currency ? ` ${currency}` : "");
  }

  function formatDate(val: string): string {
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-LK");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <p className="text-muted-foreground text-sm">{description}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              placeholder="Search by order number or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {loading ? (
            <p className="py-4 text-center text-muted-foreground text-sm">Loading orders...</p>
          ) : orders.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground text-sm">
              No orders at this stage.
            </p>
          ) : (
            <div className="space-y-6">
              <div className="max-h-[280px] overflow-y-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                    <tr className="border-b">
                      <th className="px-4 py-2 text-left font-medium">Order</th>
                      <th className="px-4 py-2 text-left font-medium">Location</th>
                      <th className="px-4 py-2 text-left font-medium">Merchant</th>
                      <th className="px-4 py-2 text-left font-medium">Customer</th>
                      {showPrintStatus && (
                        <th className="px-4 py-2 text-left font-medium">Print Status</th>
                      )}
                      {showHoldStatus && (
                        <th className="px-4 py-2 text-left font-medium">Hold Status</th>
                      )}
                      <th className="px-4 py-2 text-right font-medium">Total</th>
                      <th className="px-4 py-2 text-left font-medium">Date</th>
                      <th className="px-4 py-2 text-left font-medium">Select</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr
                        key={order.id}
                        className={`border-b last:border-0 ${
                          selectedOrderId === order.id ? "bg-primary/10" : ""
                        }`}
                      >
                        <td className="px-4 py-2 font-medium">
                          {order.name ?? order.orderNumber ?? "—"}
                        </td>
                        <td className="px-4 py-2">{order.companyLocation?.name ?? "—"}</td>
                        <td className="px-4 py-2">{order.assignedMerchant?.name ?? order.assignedMerchant?.email ?? "—"}</td>
                        <td className="px-4 py-2 max-w-[140px] truncate" title={order.customerEmail ?? order.customerPhone ?? undefined}>
                          {order.customerEmail ?? order.customerPhone ?? "—"}
                        </td>
                        {showPrintStatus && (
                          <td className="px-4 py-2">
                            {(order.printCount ?? 0) === 0
                              ? "Not printed"
                              : order.printCount === 1
                                ? "Printed once"
                                : `Printed ${order.printCount}×`}
                          </td>
                        )}
                        {showHoldStatus && (
                          <td className="px-4 py-2">
                            {order.packageOnHoldAt && order.packageHoldReason ? (
                              <span className="text-amber-600" title={order.packageHoldReason.name}>
                                On hold: {order.packageHoldReason.name}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-2 text-right">
                          {formatPrice(order.totalPrice, order.currency)}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{formatDate(order.createdAt)}</td>
                        <td className="px-4 py-2">
                          <Button
                            size="sm"
                            variant={selectedOrderId === order.id ? "default" : "outline"}
                            onClick={() =>
                              onSelectOrder(selectedOrderId === order.id ? null : order)
                            }
                          >
                            {selectedOrderId === order.id ? "Selected" : "Select"}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {total > 0 && (
                <Pagination
                  page={page}
                  limit={limit}
                  total={total}
                  onPageChange={setPage}
                  onLimitChange={(l) => {
                    setLimit(l);
                    setPage(1);
                  }}
                  limitOptions={[5, 10, 25, 50]}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedOrderId && (
        <>
          <FulfillmentOrderInvoiceDetails
            orderId={selectedOrderId}
            refreshTrigger={invoiceRefreshTrigger}
          />
          {children}
        </>
      )}
    </div>
  );
}
