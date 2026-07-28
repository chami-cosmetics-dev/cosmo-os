"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

type QuickSearchOrder = {
  id: string;
  orderLabel: string;
  orderNumber: string | null;
  customerName: string | null;
  customerPhone: string | null;
  fulfillmentStage: string;
  totalPrice: string;
  currency: string | null;
};

export function DashboardOrderSearch() {
  const [query, setQuery] = useState("");
  const [orders, setOrders] = useState<QuickSearchOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(async (value: string) => {
    const q = value.trim();
    if (q.length < 2) {
      setOrders([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/quick-search?q=${encodeURIComponent(q)}&limit=20`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOrders([]);
        setError(typeof data.error === "string" ? data.error : "Search failed");
        return;
      }
      setOrders(Array.isArray(data.orders) ? data.orders : []);
    } catch {
      setOrders([]);
      setError("Search failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void runSearch(query);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query, runSearch]);

  return (
    <div className="relative z-10 mt-4 max-w-xl space-y-2">
      <div className="relative">
        <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search orders by number, phone, or customer name"
          className="bg-background/90 pl-9"
          aria-label="Search orders"
        />
      </div>
      {loading ? <p className="text-muted-foreground text-xs">Searching…</p> : null}
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
      {!loading && query.trim().length >= 2 && orders.length === 0 && !error ? (
        <p className="text-muted-foreground text-xs">No matching orders.</p>
      ) : null}
      {orders.length > 0 ? (
        <ul className="border-border/70 bg-background/95 max-h-72 overflow-auto rounded-lg border shadow-sm">
          {orders.map((order) => (
            <li key={order.id} className="border-border/50 border-b last:border-0">
              <Link
                href={`/dashboard/orders?orderId=${order.id}`}
                className="hover:bg-secondary/20 flex flex-col gap-0.5 px-3 py-2 text-sm"
              >
                <span className="font-medium">{order.orderLabel}</span>
                <span className="text-muted-foreground text-xs">
                  {[order.customerName, order.customerPhone, order.fulfillmentStage]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
