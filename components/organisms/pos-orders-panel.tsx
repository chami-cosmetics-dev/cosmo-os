"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ShoppingBag, Store, Package, Search } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { notify } from "@/lib/notify";
import { formatAppDateTime } from "@/lib/format-datetime";

type PosOrder = {
  id: string;
  invoiceNo: string | null;
  company: string;
  companyLocationId: string | null;
  companyLocationName: string | null;
  posProfile: string | null;
  warehouse: string;
  fulfillmentStage: string | null;
  financialStatus: string | null;
  paymentGatewayPrimary: string | null;
  totalPrice: string;
  currency: string | null;
  customerName: string | null;
  customerPhone: string | null;
  createdAt: string;
};

type Group = {
  company: string;
  posProfile: string | null;
  warehouse: string;
  count: number;
};

type PosOrdersData = {
  orders: PosOrder[];
  groups: Group[];
  total: number;
};

const ALL_VALUE = "__all";

const STAGE_LABELS: Record<string, string> = {
  order_received: "Order Received",
  sample_free_issue: "Sample/Free Issue",
  print: "Print",
  ready_to_dispatch: "Ready to Dispatch",
  dispatched: "Dispatched",
  delivery_complete: "Delivery Complete",
  invoice_complete: "Invoice Complete",
  returned_to_store: "Returned to Store",
  returned: "Returned",
};

const FINANCIAL_STATUS_CLASSES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  paid: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  voided: "bg-secondary text-secondary-foreground",
  refunded: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
};

const STAGE_CLASSES: Record<string, string> = {
  order_received: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
  sample_free_issue: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  print: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  ready_to_dispatch: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  dispatched: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  delivery_complete: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  invoice_complete: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  returned_to_store: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
  returned: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
};

function Badge({ text, cls }: { text: string; cls: string }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {text}
    </span>
  );
}

function formatPrice(val: string, currency?: string | null): string {
  const n = parseFloat(val);
  if (Number.isNaN(n)) return val;
  const formatted = n.toLocaleString("en-LK", { minimumFractionDigits: 2 });
  return currency ? `${formatted} ${currency}` : formatted;
}

function formatDate(val: string): string {
  return formatAppDateTime(val);
}

export function PosOrdersPanel() {
  const [data, setData] = useState<PosOrdersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [companyFilter, setCompanyFilter] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [posProfileFilter, setPosProfileFilter] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/orders/pos-orders");
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        notify.error(err.error ?? "Failed to load POS orders");
        return;
      }
      setData((await res.json()) as PosOrdersData);
    } catch {
      notify.error("Failed to load POS orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const companies = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.orders.map((o) => o.company))].sort();
  }, [data]);

  // Warehouses filtered by selected company
  const warehouses = useMemo(() => {
    if (!data) return [];
    const filtered = companyFilter ? data.orders.filter((o) => o.company === companyFilter) : data.orders;
    return [...new Set(filtered.map((o) => o.warehouse))].sort();
  }, [data, companyFilter]);

  // POS profiles filtered by selected company + warehouse
  const posProfiles = useMemo(() => {
    if (!data) return [];
    let filtered = data.orders;
    if (companyFilter) filtered = filtered.filter((o) => o.company === companyFilter);
    if (warehouseFilter) filtered = filtered.filter((o) => o.warehouse === warehouseFilter);
    return [...new Set(filtered.map((o) => o.posProfile ?? "—"))].sort();
  }, [data, companyFilter, warehouseFilter]);

  const filteredOrders = useMemo(() => {
    if (!data) return [];
    return data.orders.filter((o) => {
      if (companyFilter && o.company !== companyFilter) return false;
      if (warehouseFilter && o.warehouse !== warehouseFilter) return false;
      if (posProfileFilter) {
        const profile = o.posProfile ?? "—";
        if (profile !== posProfileFilter) return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return (
          (o.invoiceNo?.toLowerCase().includes(q) ?? false) ||
          (o.customerName?.toLowerCase().includes(q) ?? false) ||
          (o.customerPhone?.includes(q) ?? false) ||
          (o.posProfile?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });
  }, [data, companyFilter, warehouseFilter, posProfileFilter, search]);

  const summaryGroups = useMemo(() => {
    if (!data) return [];
    if (!companyFilter && !warehouseFilter && !posProfileFilter) return data.groups;
    const groupMap = new Map<string, Group>();
    for (const o of filteredOrders) {
      const key = `${o.company}||${o.posProfile ?? ""}`;
      const existing = groupMap.get(key);
      if (existing) existing.count++;
      else groupMap.set(key, { company: o.company, posProfile: o.posProfile, warehouse: o.warehouse, count: 1 });
    }
    return Array.from(groupMap.values()).sort(
      (a, b) => a.company.localeCompare(b.company) || (a.posProfile ?? "").localeCompare(b.posProfile ?? ""),
    );
  }, [data, companyFilter, warehouseFilter, posProfileFilter, filteredOrders]);

  // Summary cards: company → warehouses → pos profiles
  const companySummary = useMemo(() => {
    const companyMap = new Map<string, {
      warehouses: Map<string, { posProfiles: { name: string | null; count: number }[]; count: number }>;
      total: number;
    }>();

    for (const g of summaryGroups) {
      let co = companyMap.get(g.company);
      if (!co) {
        co = { warehouses: new Map(), total: 0 };
        companyMap.set(g.company, co);
      }
      co.total += g.count;

      let wh = co.warehouses.get(g.warehouse);
      if (!wh) {
        wh = { posProfiles: [], count: 0 };
        co.warehouses.set(g.warehouse, wh);
      }
      wh.count += g.count;
      wh.posProfiles.push({ name: g.posProfile, count: g.count });
    }

    return Array.from(companyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([company, info]) => ({
        company,
        total: info.total,
        warehouses: Array.from(info.warehouses.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([warehouse, wh]) => ({
            warehouse,
            count: wh.count,
            posProfiles: wh.posProfiles.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
          })),
      }));
  }, [summaryGroups]);

  return (
    <div className="min-w-0 max-w-full overflow-x-hidden space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-5 shadow-[0_18px_40px_-28px_var(--primary)] sm:p-6">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.4),transparent_65%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent_65%)]" />
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
          POS
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          <ShoppingBag className="size-5 text-muted-foreground" />
          POS Orders
        </h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm sm:text-base">
          ERPNext POS orders grouped by company, warehouse, and POS profile.
        </p>
      </section>

      {/* Summary cards */}
      {!loading && data && companySummary.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {companySummary.map((co) => (
            <div
              key={co.company}
              className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_95%,white),color-mix(in_srgb,var(--secondary)_8%,transparent))] p-4 shadow-xs"
            >
              <div className="flex items-center gap-2 mb-2">
                <Store className="size-4 text-muted-foreground shrink-0" />
                <p className="text-sm font-semibold truncate">{co.company}</p>
                <span className="ml-auto shrink-0 text-xs font-medium bg-primary/10 text-primary rounded-full px-2 py-0.5">
                  {co.total}
                </span>
              </div>
              <div className="space-y-2">
                {co.warehouses.map((wh) => (
                  <div key={wh.warehouse} className="rounded-lg bg-muted/40 px-2.5 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <Package className="size-3 shrink-0 text-muted-foreground" />
                      <span className="text-xs font-medium truncate">{wh.warehouse !== "—" ? wh.warehouse : "No warehouse"}</span>
                      <span className="ml-auto shrink-0 text-xs font-medium text-foreground">{wh.count}</span>
                    </div>
                    {wh.posProfiles.length > 0 && (
                      <div className="mt-1 space-y-0.5 pl-4">
                        {wh.posProfiles.map((p) => (
                          <div key={p.name ?? "unknown"} className="flex items-center gap-1.5">
                            <ShoppingBag className="size-2.5 shrink-0 text-muted-foreground/60" />
                            <span className="text-xs text-muted-foreground truncate">{p.name ?? "Unknown profile"}</span>
                            <span className="ml-auto shrink-0 text-xs text-muted-foreground">{p.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters + table */}
      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent),color-mix(in_srgb,var(--primary)_8%,transparent))]">
          <CardTitle className="flex items-center gap-2 text-xl">
            <ShoppingBag className="size-5 text-muted-foreground" />
            POS Orders
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            {loading ? "Loading…" : `${filteredOrders.length} of ${data?.total ?? 0} orders`}
          </p>
        </CardHeader>
        <CardContent className="min-w-0 max-w-full overflow-x-hidden space-y-4 pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                placeholder="Search invoice, customer…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border-border/70 bg-background/90 pl-9"
              />
            </div>
            <Select
              value={companyFilter || ALL_VALUE}
              onValueChange={(v) => {
                setCompanyFilter(v === ALL_VALUE ? "" : v);
                setWarehouseFilter("");
                setPosProfileFilter("");
              }}
            >
              <SelectTrigger className="w-full border-border/70 bg-background/90">
                <SelectValue placeholder="All companies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>All companies</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={warehouseFilter || ALL_VALUE}
              onValueChange={(v) => {
                setWarehouseFilter(v === ALL_VALUE ? "" : v);
                setPosProfileFilter("");
              }}
            >
              <SelectTrigger className="w-full border-border/70 bg-background/90">
                <SelectValue placeholder="All warehouses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>All warehouses</SelectItem>
                {warehouses.map((w) => (
                  <SelectItem key={w} value={w}>{w}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={posProfileFilter || ALL_VALUE}
              onValueChange={(v) => setPosProfileFilter(v === ALL_VALUE ? "" : v)}
            >
              <SelectTrigger className="w-full border-border/70 bg-background/90">
                <SelectValue placeholder="All POS profiles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>All POS profiles</SelectItem>
                {posProfiles.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Loading POS orders…</div>
          ) : filteredOrders.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">No POS orders found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Invoice</th>
                    <th className="pb-2 pr-3 font-medium">Company</th>
                    <th className="pb-2 pr-3 font-medium">Warehouse</th>
                    <th className="pb-2 pr-3 font-medium">POS Profile</th>
                    <th className="pb-2 pr-3 font-medium">Customer</th>
                    <th className="pb-2 pr-3 font-medium">Payment</th>
                    <th className="pb-2 pr-3 font-medium">Stage</th>
                    <th className="pb-2 pr-3 font-medium">Status</th>
                    <th className="pb-2 pr-3 font-medium text-right">Amount</th>
                    <th className="pb-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {filteredOrders.map((o) => (
                    <tr key={o.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2 pr-3 font-mono text-xs font-medium whitespace-nowrap">
                        {o.invoiceNo ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground max-w-30 truncate">
                        {o.companyLocationName ?? o.company}
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground whitespace-nowrap">
                        {o.warehouse}
                      </td>
                      <td className="py-2 pr-3 text-xs font-medium max-w-35 truncate">
                        {o.posProfile ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground max-w-30 truncate">
                        {o.customerName ?? o.customerPhone ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-xs whitespace-nowrap">
                        {o.paymentGatewayPrimary ?? "—"}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {o.fulfillmentStage ? (
                          <Badge
                            text={STAGE_LABELS[o.fulfillmentStage] ?? o.fulfillmentStage}
                            cls={STAGE_CLASSES[o.fulfillmentStage] ?? "bg-secondary text-secondary-foreground"}
                          />
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {o.financialStatus ? (
                          <Badge
                            text={o.financialStatus.charAt(0).toUpperCase() + o.financialStatus.slice(1)}
                            cls={FINANCIAL_STATUS_CLASSES[o.financialStatus.toLowerCase()] ?? "bg-secondary text-secondary-foreground"}
                          />
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right text-xs font-medium whitespace-nowrap">
                        {formatPrice(o.totalPrice, o.currency)}
                      </td>
                      <td className="py-2 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(o.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
