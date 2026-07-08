"use client";

import dynamic from "next/dynamic";
import { KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, Search, ShoppingCart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createCanRevertToStageFromKeys } from "@/lib/fulfillment-permissions";
import { getOrderListFulfillmentStageBadges } from "@/lib/fulfillment-stage-display";
import { resolveErpOrderRef } from "@/lib/fulfillment-order-reference";
import { getPaymentMethodInfo } from "@/lib/payment-method-label";
import { Pagination } from "@/components/ui/pagination";
import { SortableColumnHeader } from "@/components/ui/sortable-column-header";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TableSkeleton } from "@/components/skeletons/table-skeleton";
import { createClientPerfLogger } from "@/lib/client-perf";
import { notify } from "@/lib/notify";

const OrderInvoiceViewModal = dynamic(
  () =>
    import("@/components/organisms/order-invoice-view-modal").then((m) => ({
      default: m.OrderInvoiceViewModal,
    })),
  { ssr: false }
);

type Order = {
  id: string;
  shopifyOrderId: string;
  orderNumber: string | null;
  name: string | null;
  erpnextInvoiceId?: string | null;
  sourceName: string;
  totalPrice: string;
  currency: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  fulfillmentStage?: string | null;
  printCount?: number;
  lastPrintedAt?: string | null;
  packageReadyAt?: string | null;
  dispatchedAt?: string | null;
  sampleFreeIssueCompleteAt?: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerName: string | null;
  createdAt: string;
  companyLocation: { id: string; name: string } | null;
  assignedMerchant: { id: string; name: string | null; email: string | null } | null;
  lineItemCount: number;
  paymentGatewayNames: string[];
  paymentGatewayPrimary: string | null;
  pendingPaymentApproval?: boolean;
  pendingDeliveryPaymentApproval?: boolean;
  erpOutOfStockBlocked?: boolean;
  discountCodes?: unknown;
  merchantCouponCode?: string | null;
};

const ALL_FILTER_VALUE = "__all";

const SOURCE_LABEL: Record<string, string> = {
  "erpnext-pos": "e-pos",
  "erpnext": "erpnext",
  "pos": "pos",
  "manual": "manual",
  "web": "web",
};

function SourceBadge({ sourceName }: { sourceName: string }) {
  const label = SOURCE_LABEL[sourceName] ?? sourceName;
  const cls =
    sourceName === "pos" || sourceName === "erpnext-pos"
      ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
      : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
  return (
    <span className={`inline-flex whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

const PAYMENT_BADGE_CLASSES: Record<string, string> = {
  cod:   "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  bank:  "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  card:  "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  cash:  "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  paid:  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  other: "bg-secondary text-secondary-foreground",
};

function PaymentBadge({
  paymentGatewayPrimary,
  paymentGatewayNames,
  financialStatus,
}: {
  paymentGatewayPrimary?: string | null;
  paymentGatewayNames?: string[] | null;
  financialStatus?: string | null;
}) {
  const info = getPaymentMethodInfo({ paymentGatewayPrimary, paymentGatewayNames, financialStatus });
  if (info.label === "—") return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span className={`inline-flex whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${PAYMENT_BADGE_CLASSES[info.variant] ?? PAYMENT_BADGE_CLASSES.other}`}>
      {info.label}
    </span>
  );
}

const FINANCIAL_STATUS_MAP: Record<string, { label: string; cls: string }> = {
  pending:        { label: "Pending",     cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  paid:           { label: "Paid",        cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
  partially_paid: { label: "Part. Paid",  cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  refunded:       { label: "Refunded",    cls: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300" },
  voided:         { label: "Voided",      cls: "bg-secondary text-secondary-foreground" },
  authorized:     { label: "Authorized",  cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
};

function FinancialStatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const entry = FINANCIAL_STATUS_MAP[status.toLowerCase()];
  const label = entry?.label ?? status;
  const cls   = entry?.cls   ?? "bg-secondary text-secondary-foreground";
  return (
    <span className={`inline-flex whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

const FULFILLMENT_STATUS_MAP: Record<string, { label: string; cls: string }> = {
  fulfilled:   { label: "Fulfilled",  cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
  unfulfilled: { label: "Unfulfilled",cls: "bg-secondary text-secondary-foreground" },
  partial:     { label: "Partial",    cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
};

function FulfillmentStatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const entry = FULFILLMENT_STATUS_MAP[status.toLowerCase()];
  if (!entry) return null;
  return (
    <span className={`inline-flex whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${entry.cls}`}>
      {entry.label}
    </span>
  );
}

type OrderDetail = {
  id: string;
  shopifyOrderId: string;
  orderNumber: string | null;
  name: string | null;
  erpnextInvoiceId?: string | null;
  sourceName: string;
  totalPrice: string;
  subtotalPrice: string | null;
  totalDiscounts: string | null;
  totalTax: string | null;
  totalShipping: string | null;
  shippingRuleLabel?: string | null;
  currency: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  paymentGatewayNames?: string[];
  paymentGatewayPrimary?: string | null;
  pendingPaymentApproval?: boolean;
  pendingDeliveryPaymentApproval?: boolean;
  erpOutOfStockBlocked?: boolean;
  customerEmail: string | null;
  customerPhone: string | null;
  shippingAddress: unknown;
  billingAddress: unknown;
  discountCodes: unknown;
  merchantCouponCode: string | null;
  discountCouponCode?: string | null;
  createdAt: string;
  companyLocation: { id: string; name: string } | null;
  assignedMerchant: { id: string; name: string | null; email: string | null } | null;
  lineItems: Array<{
    id: string;
    productTitle: string;
    variantTitle: string | null;
    sku: string | null;
    quantity: number;
    price: string;
    total: string;
  }>;
  shopifyAdminOrderUrl: string | null;
  erpAdminInvoiceUrl?: string | null;
  fulfillmentStage?: string;
  printCount?: number;
  packageReadyAt?: string | null;
  packageReadyBy?: { id: string; name: string | null; email: string | null } | null;
  packageOnHoldAt?: string | null;
  packageHoldReason?: { id: string; name: string } | null;
  dispatchedAt?: string | null;
  dispatchedBy?: { id: string; name: string | null; email: string | null } | null;
  dispatchedByRider?: { id: string; name: string | null; mobile: string | null } | null;
  dispatchedByCourierService?: { id: string; name: string } | null;
  invoiceCompleteAt?: string | null;
  invoiceCompleteBy?: { id: string; name: string | null; email: string | null } | null;
  deliveryCompleteAt?: string | null;
  deliveryCompleteBy?: { id: string; name: string | null; email: string | null } | null;
  lastPrintedAt?: string | null;
  lastPrintedBy?: { id: string; name: string | null; email: string | null } | null;
  sampleFreeIssueCompleteAt?: string | null;
  sampleFreeIssueCompleteBy?: { id: string; name: string | null; email: string | null } | null;
  sampleFreeIssues?: Array<{
    id: string;
    sampleFreeIssueItem: { id: string; name: string; type: string };
    quantity: number;
    createdAt?: string;
    addedBy?: { id: string; name: string | null; email: string | null } | null;
  }>;
  remarks?: Array<{
    id: string;
    stage: string;
    type: string;
    content: string;
    createdAt: string;
    showOnInvoice?: boolean;
    addedBy?: { id: string; name: string | null; email: string | null } | null;
  }>;
};

export type OrdersPanelInitialData = {
  orders: Order[];
  total: number;
  page: number;
  limit: number;
  locations: Array<{ id: string; name: string }>;
  merchants: Array<{ id: string; name: string | null; email: string | null }>;
  paymentGatewayOptions: string[];
};

interface OrdersPanelProps {
  canPrint?: boolean;
  canResendRiderSms?: boolean;
  revertPermissionKeys?: string[];
  canManageFinanceApprovals?: boolean;
  canRevertPaid?: boolean;
  initialData?: OrdersPanelInitialData | null;
}

export function OrdersPanel({
  canPrint = false,
  canResendRiderSms = false,
  revertPermissionKeys = [],
  canManageFinanceApprovals = false,
  canRevertPaid = false,
  initialData,
}: OrdersPanelProps = {}) {
  const hasInitialData = Boolean(initialData);
  const canRevertToStage = useMemo(
    () => createCanRevertToStageFromKeys(revertPermissionKeys),
    [revertPermissionKeys]
  );
  const [orders, setOrders] = useState<Order[]>(initialData?.orders ?? []);
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>(
    initialData?.locations ?? []
  );
  const [merchants, setMerchants] = useState<Array<{ id: string; name: string | null; email: string | null }>>(
    initialData?.merchants ?? []
  );
  const [paymentGatewayOptions, setPaymentGatewayOptions] = useState<string[]>(
    initialData?.paymentGatewayOptions ?? []
  );
  const [loading, setLoading] = useState(!initialData);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [merchantFilter, setMerchantFilter] = useState<string>("");
  const [paymentGatewayFilter, setPaymentGatewayFilter] = useState<string>("");
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("");
  const [page, setPage] = useState(initialData?.page ?? 1);
  const [limit, setLimit] = useState(initialData?.limit ?? 10);
  const [total, setTotal] = useState(initialData?.total ?? 0);
  const [sortBy, setSortBy] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [viewingOrderId, setViewingOrderId] = useState<string | null>(null);
  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  const effectiveSearch = useMemo(() => debouncedSearch.trim(), [debouncedSearch]);

  useEffect(() => {
    setPage(1);
  }, [effectiveSearch, locationFilter, sourceFilter, merchantFilter, paymentGatewayFilter, orderStatusFilter, sortBy, sortOrder]);

  const fetchPageData = useCallback(async () => {
    const perf = createClientPerfLogger("orders.panel.fetch", {
      hasInitialData,
      page,
      limit,
    });
    const params = new URLSearchParams();
    if (effectiveSearch) params.set("search", effectiveSearch);
    if (locationFilter) params.set("location_id", locationFilter);
    if (sourceFilter) params.set("source", sourceFilter);
    if (merchantFilter) params.set("merchant_id", merchantFilter);
    if (paymentGatewayFilter) params.set("payment_gateway", paymentGatewayFilter);
    if (orderStatusFilter) params.set("order_status", orderStatusFilter);
    params.set("page", String(page));
    params.set("limit", String(limit));
    if (sortBy) {
      params.set("sort_by", sortBy);
      params.set("sort_order", sortOrder);
    }
    const res = await fetch(`/api/admin/orders/page-data?${params}`);
    perf.mark("response");
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      notify.error(data.error ?? "Failed to load orders");
      perf.end({ ok: false });
      return;
    }
    const data = (await res.json()) as {
      orders: Order[];
      total: number;
      page: number;
      limit: number;
      locations: Array<{ id: string; name: string }>;
      merchants: Array<{ id: string; name: string | null; email: string | null }>;
      paymentGatewayOptions: string[];
    };
    setOrders(data.orders);
    setTotal(data.total);
    setLocations(data.locations ?? []);
    setMerchants(data.merchants ?? []);
    setPaymentGatewayOptions(data.paymentGatewayOptions ?? []);
    perf.end({ ok: true, total: data.total });
  }, [effectiveSearch, hasInitialData, locationFilter, sourceFilter, merchantFilter, paymentGatewayFilter, orderStatusFilter, page, limit, sortBy, sortOrder]);

  useEffect(() => {
    let cancelled = false;
    fetchPageData()
      .then(() => {
        if (!cancelled) setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
          notify.error("Failed to load data");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPageData]);

  function handlePageChange(newPage: number) {
    setPage(newPage);
  }

  function handleLimitChange(newLimit: number) {
    setLimit(newLimit);
    setPage(1);
  }

  function handleSort(key: string, order: "asc" | "desc") {
    setSortBy(key);
    setSortOrder(order);
    setPage(1);
  }

  function formatPrice(val: string, currency?: string | null): string {
    const n = parseFloat(val);
    if (Number.isNaN(n)) return val;
    const formatted = n.toLocaleString("en-LK", { minimumFractionDigits: 2 });
    return currency ? `${formatted} ${currency}` : formatted;
  }

  function formatDate(val: string): string {
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-LK");
  }

  async function handleViewOrder(id: string) {
    setViewingOrderId(id);
    setDetailLoading(true);
    setOrderDetail(null);
    try {
      const res = await fetch(`/api/admin/orders/${id}`);
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        notify.error(data.error ?? "Failed to load order");
        setViewingOrderId(null);
        return;
      }
      const data = (await res.json()) as OrderDetail;
      setOrderDetail(data);
    } catch {
      notify.error("Failed to load order");
      setViewingOrderId(null);
    } finally {
      setDetailLoading(false);
    }
  }

  function handleOrderRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, orderId: string) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    void handleViewOrder(orderId);
  }

  function formatAddress(addr: unknown): string {
    if (!addr || typeof addr !== "object") return "—";
    const a = addr as Record<string, unknown>;
    const parts = [
      a.address1,
      a.address2,
      [a.city, a.province_code].filter(Boolean).join(", "),
      a.country,
      a.zip,
    ].filter(Boolean) as string[];
    return parts.join(", ") || "—";
  }

  function getAddressPhone(addr: unknown): string | null {
    if (!addr || typeof addr !== "object") return null;
    const a = addr as Record<string, unknown>;
    const phone = a.phone ?? a.phone_number;
    return typeof phone === "string" && phone.trim() ? phone : null;
  }

  function getCustomerName(addr: unknown): string | null {
    if (!addr || typeof addr !== "object") return null;
    const a = addr as Record<string, unknown>;
    const name = a.name ?? [a.first_name, a.last_name].filter(Boolean).join(" ").trim();
    return typeof name === "string" && name ? name : null;
  }

  return (
    <div className="min-w-0 max-w-full overflow-x-hidden space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-5 shadow-[0_18px_40px_-28px_var(--primary)] sm:p-6">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.4),transparent_65%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent_65%)]" />
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
          Sales
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          <ShoppingCart className="size-5 text-muted-foreground" />
          Orders
        </h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm sm:text-base">
          Monitor Shopify web and POS orders with fast filters for branch, merchant, payment gateway, and source.
        </p>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_95%,white),color-mix(in_srgb,var(--secondary)_8%,transparent))] p-4 shadow-xs">
          <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">
            Results
          </p>
          <p className="mt-2 text-sm font-semibold">{total.toLocaleString("en-LK")} orders</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Live count based on your current filters and search.
          </p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_95%,white),color-mix(in_srgb,var(--primary)_8%,transparent))] p-4 shadow-xs">
          <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">
            Channels
          </p>
          <p className="mt-2 text-sm font-semibold">Web and POS in one table</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Compare source, payment, fulfillment stage, and assignment without leaving the page.
          </p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_95%,white),color-mix(in_srgb,var(--secondary)_10%,transparent),color-mix(in_srgb,var(--primary)_6%,transparent))] p-4 shadow-xs">
          <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">
            Workflow
          </p>
          <p className="mt-2 text-sm font-semibold">Review before fulfillment</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Open any order to inspect invoice, customer, stage, and dispatch details.
          </p>
        </div>
      </div>

      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent),color-mix(in_srgb,var(--primary)_8%,transparent))]">
          <CardTitle className="flex items-center gap-2 text-xl">
            <ShoppingCart className="size-5 text-muted-foreground" />
            Orders Explorer
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            Search and filter orders by location, source, merchant, payment, and status.
          </p>
        </CardHeader>
        <CardContent className="min-w-0 max-w-full overflow-x-hidden space-y-4">
          <div className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_96%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))] p-4 shadow-xs">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))] lg:items-center">
            <div className="relative min-w-0">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                placeholder="Search by order name (e.g. 6008699), #, or customer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border-border/70 bg-background/90 pl-9"
              />
            </div>
            <Select
              value={locationFilter || ALL_FILTER_VALUE}
              onValueChange={(value) => setLocationFilter(value === ALL_FILTER_VALUE ? "" : value)}
            >
              <SelectTrigger className="w-full min-w-0 border-border/70 bg-background/90">
                <SelectValue placeholder="All locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_FILTER_VALUE}>All locations</SelectItem>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={sourceFilter || ALL_FILTER_VALUE}
              onValueChange={(value) => setSourceFilter(value === ALL_FILTER_VALUE ? "" : value)}
            >
              <SelectTrigger className="w-full min-w-0 border-border/70 bg-background/90">
                <SelectValue placeholder="All sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_FILTER_VALUE}>All sources</SelectItem>
                <SelectItem value="web">Web</SelectItem>
                <SelectItem value="pos">POS</SelectItem>
                <SelectItem value="erpnext-pos">ERPNext POS</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={merchantFilter || ALL_FILTER_VALUE}
              onValueChange={(value) => setMerchantFilter(value === ALL_FILTER_VALUE ? "" : value)}
            >
              <SelectTrigger className="w-full min-w-0 border-border/70 bg-background/90">
                <SelectValue placeholder="All merchants" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_FILTER_VALUE}>All merchants</SelectItem>
                {merchants.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name || m.email || m.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={paymentGatewayFilter || ALL_FILTER_VALUE}
              onValueChange={(value) => setPaymentGatewayFilter(value === ALL_FILTER_VALUE ? "" : value)}
            >
              <SelectTrigger className="w-full min-w-0 border-border/70 bg-background/90">
                <SelectValue placeholder="All gateways" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_FILTER_VALUE}>All gateways</SelectItem>
                {paymentGatewayOptions.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={orderStatusFilter || ALL_FILTER_VALUE}
              onValueChange={(value) => setOrderStatusFilter(value === ALL_FILTER_VALUE ? "" : value)}
            >
              <SelectTrigger className="w-full min-w-0 border-border/70 bg-background/90">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_FILTER_VALUE}>All statuses</SelectItem>
                <SelectItem value="pending">Pending payment</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="voided">Voided</SelectItem>
                <SelectItem value="returned">Returned (ERP)</SelectItem>
                <SelectItem value="returned_to_store">Returned to Store</SelectItem>
              </SelectContent>
            </Select>
          </div>
          </div>

          {loading && orders.length === 0 ? (
            <TableSkeleton columns={10} rows={6} />
          ) : orders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_97%,white),color-mix(in_srgb,var(--secondary)_8%,transparent))] px-6 py-10 text-center">
              <p className="text-muted-foreground text-sm">
                No orders yet. Orders will appear here when received from Shopify webhooks.
              </p>
            </div>
          ) : (
            <>
              <div className="max-w-full rounded-2xl border border-border/70 bg-background/90 shadow-xs">
                <table className="w-full table-fixed text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_94%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))]">
                      <SortableColumnHeader
                        className="w-[18%]"
                        label="Order"
                        sortKey="name"
                        currentSort={sortBy || undefined}
                        currentOrder={sortOrder}
                        onSort={handleSort}
                      />
                      <th className="w-[20%] px-4 py-2 text-left font-medium">Customer</th>
                      <th className="hidden md:table-cell w-[13%] px-4 py-2 text-left font-medium">Status</th>
                      <th className="hidden lg:table-cell w-[12%] px-4 py-2 text-left font-medium">Fulfillment Stage</th>
                      <SortableColumnHeader
                        className="hidden xl:table-cell w-[12%]"
                        label="Location"
                        sortKey="location"
                        currentSort={sortBy || undefined}
                        currentOrder={sortOrder}
                        onSort={handleSort}
                      />
                      <SortableColumnHeader
                        className="hidden md:table-cell w-[10%]"
                        label="Date"
                        sortKey="created"
                        currentSort={sortBy || undefined}
                        currentOrder={sortOrder}
                        onSort={handleSort}
                      />
                      <th className="w-[11%] px-3 py-2 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => {
                      const erpRef = resolveErpOrderRef(order);
                      const orderLabel = order.name ?? order.orderNumber ?? "—";
                      return (
                      <tr
                        key={order.id}
                        className="cursor-pointer border-b border-border/50 transition-colors hover:bg-secondary/10 focus-visible:bg-secondary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 last:border-0"
                        tabIndex={0}
                        aria-label={`View order ${order.name ?? order.orderNumber ?? order.shopifyOrderId}`}
                        onClick={() => void handleViewOrder(order.id)}
                        onKeyDown={(event) => handleOrderRowKeyDown(event, order.id)}
                      >
                        <td className="px-4 py-2">
                          <div className="truncate font-medium" title={order.name ?? order.orderNumber ?? undefined}>
                            {orderLabel}
                          </div>
                          {erpRef && erpRef !== orderLabel && (
                            <div className="truncate text-xs text-muted-foreground" title={erpRef}>
                              {erpRef}
                            </div>
                          )}
                          <div className="mt-1 flex flex-wrap gap-1">
                            <SourceBadge sourceName={order.sourceName} />
                            <PaymentBadge
                              paymentGatewayPrimary={order.paymentGatewayPrimary}
                              paymentGatewayNames={order.paymentGatewayNames}
                              financialStatus={order.financialStatus}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <div className="truncate" title={order.customerName ?? undefined}>
                            {order.customerName ?? "—"}
                          </div>
                          {(order.customerPhone || order.customerEmail) && (
                            <div
                              className="truncate text-xs text-muted-foreground"
                              title={order.customerPhone ?? order.customerEmail ?? undefined}
                            >
                              {order.customerPhone ?? order.customerEmail}
                            </div>
                          )}
                          {(() => {
                            const display =
                              order.assignedMerchant?.name ??
                              order.assignedMerchant?.email ??
                              order.merchantCouponCode ??
                              null;
                            if (!display) return null;
                            return (
                              <div className="truncate text-xs text-muted-foreground" title={display}>
                                {display}
                              </div>
                            );
                          })()}
                          <div className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatPrice(order.totalPrice)}
                          </div>
                        </td>
                        <td className="hidden md:table-cell px-4 py-2">
                          <div className="flex flex-wrap gap-1">
                            {order.pendingPaymentApproval && (
                              <span
                                title="Awaiting order payment approval (KOKO / bank transfer)"
                                className="inline-flex whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                              >
                                RA
                              </span>
                            )}
                            {order.pendingDeliveryPaymentApproval && (
                              <span
                                title="Awaiting delivery payment confirmation (COD / card on delivery)"
                                className="inline-flex whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300"
                              >
                                DP
                              </span>
                            )}
                            {order.erpOutOfStockBlocked && (
                              <span
                                title="ERP sync failed — item out of stock in ERP warehouse. Restock and retry sync before fulfillment."
                                className="inline-flex whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                              >
                                Out of stock
                              </span>
                            )}
                            <FinancialStatusBadge status={order.financialStatus} />
                            <FulfillmentStatusBadge status={order.fulfillmentStatus} />
                          </div>
                        </td>
                        <td className="hidden lg:table-cell px-4 py-2">
                          <div className="flex flex-col gap-1">
                            {getOrderListFulfillmentStageBadges({
                              fulfillmentStage: order.fulfillmentStage,
                              pendingPaymentApproval: order.pendingPaymentApproval,
                              totalPrice: order.totalPrice,
                              printCount: order.printCount,
                              packageReadyAt: order.packageReadyAt,
                              lastPrintedAt: order.lastPrintedAt,
                              dispatchedAt: order.dispatchedAt,
                            }).map((badge) => (
                              <span
                                key={badge.key}
                                className={`inline-flex whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${badge.className}`}
                              >
                                {badge.label}
                              </span>
                            ))}
                            {(() => {
                              const badge = order.merchantCouponCode ?? null;
                              if (!badge) return null;
                              return (
                                <span className="inline-flex whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                                  {badge}
                                </span>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          {order.companyLocation?.name ? (
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="truncate cursor-default">
                                    {order.companyLocation.name}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs break-words">
                                  {order.companyLocation.name}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <span>—</span>
                          )}
                        </td>
                        <td className="hidden md:table-cell px-4 py-2 text-muted-foreground">
                          <div className="leading-5">{formatDate(order.createdAt)}</div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="inline-flex h-9 max-w-full whitespace-nowrap border-border/70 bg-background/80 px-3 hover:bg-secondary/10"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleViewOrder(order.id);
                            }}
                          >
                            <Eye className="size-4" />
                            View
                          </Button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {total > 0 && (
                <Pagination
                  page={page}
                  limit={limit}
                  total={total}
                  onPageChange={handlePageChange}
                  onLimitChange={handleLimitChange}
                  limitOptions={[10, 25, 50, 100]}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <OrderInvoiceViewModal
        orderId={viewingOrderId}
        orderDetail={orderDetail}
        loading={detailLoading}
        onClose={() => setViewingOrderId(null)}
        onRefresh={() => {
          if (viewingOrderId) handleViewOrder(viewingOrderId);
        }}
        formatPrice={formatPrice}
        formatDate={formatDate}
        formatAddress={formatAddress}
        getCustomerName={getCustomerName}
        getAddressPhone={getAddressPhone}
        canPrint={canPrint}
        canResendRiderSms={canResendRiderSms}
        canRevertToStage={canRevertToStage}
        canManageFinanceApprovals={canManageFinanceApprovals}
        canRevertPaid={canRevertPaid}
      />
    </div>
  );
}
