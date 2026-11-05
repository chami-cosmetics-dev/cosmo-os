"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ShoppingBag, Store, Package, Search, Loader2, XCircle } from "lucide-react";

import { OrderCancelKindSelect, type OrderCancelKindChoice } from "@/components/molecules/order-cancel-kind-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pagination } from "@/components/ui/pagination";
import { viewerCreatedPosOrder } from "@/lib/order-cancel-finance";
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
  hasPendingCancelApproval: boolean;
  assignedMerchantId: string | null;
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
  companies: string[];
  warehouses: string[];
  posProfiles: string[];
  total: number;
  page: number;
  limit: number;
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

export function PosOrdersPanel({
  currentUserId = null,
  canCancelAnyPosOrder = false,
}: {
  currentUserId?: string | null;
  canCancelAnyPosOrder?: boolean;
}) {
  const [orders, setOrders] = useState<PosOrder[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [posProfiles, setPosProfiles] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [companyFilter, setCompanyFilter] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [posProfileFilter, setPosProfileFilter] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [cancelTarget, setCancelTarget] = useState<PosOrder | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelKind, setCancelKind] = useState<OrderCancelKindChoice | "">("");
  const [cancelBusy, setCancelBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  const effectiveSearch = useMemo(() => debouncedSearch.trim(), [debouncedSearch]);

  useEffect(() => {
    setPage(1);
  }, [effectiveSearch, companyFilter, warehouseFilter, posProfileFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (effectiveSearch) params.set("search", effectiveSearch);
      if (companyFilter) params.set("company", companyFilter);
      if (warehouseFilter) params.set("warehouse", warehouseFilter);
      if (posProfileFilter) params.set("pos_profile", posProfileFilter);

      const res = await fetch(`/api/admin/orders/pos-orders?${params}`);
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        notify.error(err.error ?? "Failed to load POS orders");
        return;
      }
      const data = (await res.json()) as PosOrdersData;
      setOrders(data.orders);
      setGroups(data.groups);
      setCompanies(data.companies ?? []);
      setWarehouses(data.warehouses ?? []);
      setPosProfiles(data.posProfiles ?? []);
      setTotal(data.total);
    } catch {
      notify.error("Failed to load POS orders");
    } finally {
      setLoading(false);
    }
  }, [page, limit, effectiveSearch, companyFilter, warehouseFilter, posProfileFilter]);

  useEffect(() => {
    let cancelled = false;
    void load().finally(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function requestCancel() {
    if (!cancelTarget || cancelReason.trim().length < 5 || !cancelKind) return;
    setCancelBusy(true);
    try {
      const res = await fetch(`/api/admin/orders/${cancelTarget.id}/fulfillment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cancel_order",
          reason: cancelReason.trim(),
          cancelKind,
        }),
      });
      const body = (await res.json()) as { error?: string; requiresApproval?: boolean };
      if (!res.ok) {
        notify.error(body.error ?? "Failed to request cancel");
        return;
      }
      notify.success(
        body.requiresApproval
          ? "Cancel request sent to that company's finance user."
          : "Order cancelled.",
      );
      setCancelTarget(null);
      setCancelReason("");
      setCancelKind("");
      await load();
    } catch {
      notify.error("Failed to request cancel");
    } finally {
      setCancelBusy(false);
    }
  }

  const companySummary = useMemo(() => {
    const companyMap = new Map<
      string,
      {
        warehouses: Map<string, { posProfiles: { name: string | null; count: number }[]; count: number }>;
        total: number;
      }
    >();

    for (const g of groups) {
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
  }, [groups]);

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

      {!loading && companySummary.length > 0 && (
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
                      <span className="text-xs font-medium truncate">
                        {wh.warehouse !== "—" ? wh.warehouse : "No warehouse"}
                      </span>
                      <span className="ml-auto shrink-0 text-xs font-medium text-foreground">
                        {wh.count}
                      </span>
                    </div>
                    {wh.posProfiles.length > 0 && (
                      <div className="mt-1 space-y-0.5 pl-4">
                        {wh.posProfiles.map((p) => (
                          <div key={p.name ?? "unknown"} className="flex items-center gap-1.5">
                            <ShoppingBag className="size-2.5 shrink-0 text-muted-foreground/60" />
                            <span className="text-xs text-muted-foreground truncate">
                              {p.name ?? "Unknown profile"}
                            </span>
                            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                              {p.count}
                            </span>
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

      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent),color-mix(in_srgb,var(--primary)_8%,transparent))]">
          <CardTitle className="flex items-center gap-2 text-xl">
            <ShoppingBag className="size-5 text-muted-foreground" />
            POS Orders
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            {loading ? "Loading…" : `${total} order${total === 1 ? "" : "s"}`}
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
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
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
                  <SelectItem key={w} value={w}>
                    {w}
                  </SelectItem>
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
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Loading POS orders…</div>
          ) : orders.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">No POS orders found.</div>
          ) : (
            <>
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
                      <th className="pb-2 pr-3 font-medium">Date</th>
                      <th className="pb-2 font-medium">Cancel</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {orders.map((o) => (
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
                              cls={
                                STAGE_CLASSES[o.fulfillmentStage] ??
                                "bg-secondary text-secondary-foreground"
                              }
                            />
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {o.financialStatus ? (
                            <Badge
                              text={
                                o.financialStatus.charAt(0).toUpperCase() +
                                o.financialStatus.slice(1)
                              }
                              cls={
                                FINANCIAL_STATUS_CLASSES[o.financialStatus.toLowerCase()] ??
                                "bg-secondary text-secondary-foreground"
                              }
                            />
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right text-xs font-medium whitespace-nowrap">
                          {formatPrice(o.totalPrice, o.currency)}
                        </td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(o.createdAt)}
                        </td>
                        <td className="py-2 whitespace-nowrap">
                          {o.financialStatus?.toLowerCase() === "voided" ? (
                            <span className="text-xs text-muted-foreground">Cancelled</span>
                          ) : o.hasPendingCancelApproval ? (
                            <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                              Pending finance
                            </span>
                          ) : canCancelAnyPosOrder ||
                            viewerCreatedPosOrder(currentUserId, o.assignedMerchantId) ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1 border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              disabled={cancelBusy}
                              onClick={() => {
                                setCancelReason("");
                                setCancelKind("");
                                setCancelTarget(o);
                              }}
                            >
                              <XCircle className="size-3.5" aria-hidden />
                              Cancel
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
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
                  onLimitChange={(newLimit) => {
                    setLimit(newLimit);
                    setPage(1);
                  }}
                  limitOptions={[10, 25, 50, 100]}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open && !cancelBusy) {
            setCancelTarget(null);
            setCancelReason("");
            setCancelKind("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel POS order {cancelTarget?.invoiceNo ?? ""}</AlertDialogTitle>
            <AlertDialogDescription>
              This sends a finance approval. The company finance user is emailed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-1">
            <OrderCancelKindSelect value={cancelKind} onChange={setCancelKind} disabled={cancelBusy} />
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="pos-cancel-reason">
                Cancellation reason <span className="text-destructive">*</span>
              </label>
              <Textarea
                id="pos-cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Customer asked to cancel this counter sale"
                maxLength={500}
                rows={3}
                disabled={cancelBusy}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {cancelReason.trim().length}/500 — minimum 5 characters
              </p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelBusy}>Back</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={cancelBusy || cancelReason.trim().length < 5 || !cancelKind}
              onClick={() => void requestCancel()}
            >
              {cancelBusy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Sending...
                </>
              ) : (
                "Send to Finance"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
