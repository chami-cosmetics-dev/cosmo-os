"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, Search, ShoppingCart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createCanRevertToStageFromKeys } from "@/lib/fulfillment-permissions";
import { Pagination } from "@/components/ui/pagination";
import { SortableColumnHeader } from "@/components/ui/sortable-column-header";
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
  sourceName: string;
  totalPrice: string;
  currency: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  fulfillmentStage?: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  createdAt: string;
  companyLocation: { id: string; name: string } | null;
  assignedMerchant: { id: string; name: string | null; email: string | null } | null;
  lineItemCount: number;
  paymentGatewayNames: string[];
  paymentGatewayPrimary: string | null;
};

const FULFILLMENT_STAGE_LABELS: Record<string, string> = {
  order_received: "Order Received",
  sample_free_issue: "Sample/Free Issue",
  print: "Print",
  ready_to_dispatch: "Ready to Dispatch",
  dispatched: "Dispatched",
  invoice_complete: "Invoice Complete",
  delivery_complete: "Delivery Complete",
};

const ALL_FILTER_VALUE = "__all";

type OrderDetail = {
  id: string;
  shopifyOrderId: string;
  orderNumber: string | null;
  name: string | null;
  sourceName: string;
  totalPrice: string;
  subtotalPrice: string | null;
  totalDiscounts: string | null;
  totalTax: string | null;
  totalShipping: string | null;
  currency: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  paymentGatewayNames?: string[];
  paymentGatewayPrimary?: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  shippingAddress: unknown;
  billingAddress: unknown;
  discountCodes: unknown;
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
  initialData?: OrdersPanelInitialData | null;
}

export function OrdersPanel({
  canPrint = false,
  canResendRiderSms = false,
  revertPermissionKeys = [],
  initialData,
}: OrdersPanelProps = {}) {
  const hasInitialData = Boolean(initialData);
  const pagePerfRef = useRef(
    createClientPerfLogger("orders.panel.mount", { hasInitialData }),
  );
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
  const [page, setPage] = useState(initialData?.page ?? 1);
  const [limit, setLimit] = useState(initialData?.limit ?? 10);
  const [total, setTotal] = useState(initialData?.total ?? 0);
  const [sortBy, setSortBy] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [viewingOrderId, setViewingOrderId] = useState<string | null>(null);
  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, locationFilter, sourceFilter, merchantFilter, paymentGatewayFilter, sortBy, sortOrder]);

  const fetchPageData = useCallback(async () => {
    const perf = createClientPerfLogger("orders.panel.fetch", {
      hasInitialData,
      page,
      limit,
    });
    const params = new URLSearchParams();
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (locationFilter) params.set("location_id", locationFilter);
    if (sourceFilter) params.set("source", sourceFilter);
    if (merchantFilter) params.set("merchant_id", merchantFilter);
    if (paymentGatewayFilter) params.set("payment_gateway", paymentGatewayFilter);
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
  }, [debouncedSearch, hasInitialData, locationFilter, sourceFilter, merchantFilter, paymentGatewayFilter, page, limit, sortBy, sortOrder]);

  const skippedInitialFetch = useRef(false);
  useEffect(() => {
    pagePerfRef.current.end({ initialOrderCount: initialData?.orders.length ?? 0 });
  }, [initialData]);

  useEffect(() => {
    if (initialData && !skippedInitialFetch.current) {
      skippedInitialFetch.current = true;
      return;
    }
    skippedInitialFetch.current = true;
    let cancelled = false;
    setLoading(true);
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
  }, [fetchPageData, initialData]);

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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="size-5" />
            Orders
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            Orders received from Shopify (web and POS). Filter by location, source, merchant, or payment
            gateway.
          </p>
        </CardHeader>
        <CardContent className="min-w-0 max-w-full overflow-x-hidden space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))] lg:items-center">
            <div className="relative min-w-0">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                placeholder="Search by order name (e.g. 6008699), #, or customer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={locationFilter || ALL_FILTER_VALUE}
              onValueChange={(value) => setLocationFilter(value === ALL_FILTER_VALUE ? "" : value)}
            >
              <SelectTrigger className="w-full min-w-0">
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
              <SelectTrigger className="w-full min-w-0">
                <SelectValue placeholder="All sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_FILTER_VALUE}>All sources</SelectItem>
                <SelectItem value="web">Web</SelectItem>
                <SelectItem value="pos">POS</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={merchantFilter || ALL_FILTER_VALUE}
              onValueChange={(value) => setMerchantFilter(value === ALL_FILTER_VALUE ? "" : value)}
            >
              <SelectTrigger className="w-full min-w-0">
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
              <SelectTrigger className="w-full min-w-0">
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
          </div>

          {loading ? (
            <TableSkeleton columns={10} rows={6} />
          ) : orders.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground text-sm">
              No orders yet. Orders will appear here when received from Shopify webhooks.
            </p>
          ) : (
            <>
              <div className="max-w-full rounded-md border">
                <table className="w-full table-fixed text-sm [&_th:nth-child(2)]:hidden [&_td:nth-child(2)]:hidden [&_th:nth-child(3)]:hidden [&_td:nth-child(3)]:hidden [&_th:nth-child(6)]:hidden [&_td:nth-child(6)]:hidden [&_th:nth-child(7)]:hidden [&_td:nth-child(7)]:hidden [&_th:nth-child(8)]:hidden [&_td:nth-child(8)]:hidden [&_th:nth-child(9)]:hidden [&_td:nth-child(9)]:hidden [&_th:nth-child(10)]:hidden [&_td:nth-child(10)]:hidden md:[&_th:nth-child(6)]:table-cell md:[&_td:nth-child(6)]:table-cell md:[&_th:nth-child(10)]:table-cell md:[&_td:nth-child(10)]:table-cell lg:[&_th:nth-child(2)]:table-cell lg:[&_td:nth-child(2)]:table-cell lg:[&_th:nth-child(7)]:table-cell lg:[&_td:nth-child(7)]:table-cell xl:[&_th:nth-child(3)]:table-cell xl:[&_td:nth-child(3)]:table-cell xl:[&_th:nth-child(8)]:table-cell xl:[&_td:nth-child(8)]:table-cell xl:[&_th:nth-child(9)]:table-cell xl:[&_td:nth-child(9)]:table-cell">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <SortableColumnHeader
                        className="w-[10%]"
                        label="Order"
                        sortKey="name"
                        currentSort={sortBy || undefined}
                        currentOrder={sortOrder}
                        onSort={handleSort}
                      />
                      <SortableColumnHeader
                        className="hidden lg:table-cell w-[6%]"
                        label="Source"
                        sortKey="source"
                        currentSort={sortBy || undefined}
                        currentOrder={sortOrder}
                        onSort={handleSort}
                      />
                      <th className="hidden xl:table-cell w-[6%] px-4 py-2 text-left font-medium">Payment</th>
                      <th className="w-[15%] px-4 py-2 text-left font-medium">Customer</th>
                      <SortableColumnHeader
                        className="w-[9%]"
                        label="Total (LKR)"
                        sortKey="total"
                        currentSort={sortBy || undefined}
                        currentOrder={sortOrder}
                        onSort={handleSort}
                        align="right"
                      />
                      <th className="hidden md:table-cell w-[13%] px-4 py-2 text-left font-medium">Shopify Status</th>
                      <th className="hidden lg:table-cell w-[9%] px-4 py-2 text-left font-medium">Fulfillment Stage</th>
                      <SortableColumnHeader
                        className="hidden xl:table-cell w-[11%]"
                        label="Location"
                        sortKey="location"
                        currentSort={sortBy || undefined}
                        currentOrder={sortOrder}
                        onSort={handleSort}
                      />
                      <SortableColumnHeader
                        className="hidden xl:table-cell w-[10%]"
                        label="Merchant"
                        sortKey="merchant"
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
                    {orders.map((order) => (
                      <tr key={order.id} className="border-b last:border-0">
                        <td className="px-4 py-2 font-medium">
                          <div className="truncate" title={order.name ?? order.orderNumber ?? undefined}>
                            {order.name ?? order.orderNumber ?? "—"}
                          </div>
                        </td>
                        <td className="hidden lg:table-cell px-4 py-2">
                          <span
                            className={`inline-flex whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${
                              order.sourceName === "pos"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                                : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                            }`}
                          >
                            {order.sourceName}
                          </span>
                        </td>
                        <td className="hidden xl:table-cell px-4 py-2">
                          <span
                            className="text-muted-foreground block truncate text-xs"
                            title={
                              order.paymentGatewayNames?.length
                                ? order.paymentGatewayNames.join(", ")
                                : undefined
                            }
                          >
                            {order.paymentGatewayPrimary ??
                              (order.paymentGatewayNames?.length
                                ? order.paymentGatewayNames.join(", ")
                                : "—")}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <div className="truncate" title={order.customerEmail ?? order.customerPhone ?? undefined}>
                            {order.customerEmail ?? order.customerPhone ?? "—"}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">{formatPrice(order.totalPrice)}</td>
                        <td className="hidden md:table-cell px-4 py-2">
                          <span className="text-muted-foreground block text-xs leading-5">
                            {order.financialStatus ?? "—"} / {order.fulfillmentStatus ?? "—"}
                          </span>
                        </td>
                        <td className="hidden lg:table-cell px-4 py-2">
                          <span className="text-muted-foreground block text-xs leading-5">
                            {order.fulfillmentStage
                              ? FULFILLMENT_STAGE_LABELS[order.fulfillmentStage] ?? order.fulfillmentStage
                              : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <div className="truncate" title={order.companyLocation?.name ?? undefined}>
                            {order.companyLocation?.name ?? "—"}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <div className="truncate" title={order.assignedMerchant?.name ?? order.assignedMerchant?.email ?? undefined}>
                            {order.assignedMerchant?.name ?? order.assignedMerchant?.email ?? "—"}
                          </div>
                        </td>
                        <td className="hidden md:table-cell px-4 py-2 text-muted-foreground">
                          <div className="leading-5">{formatDate(order.createdAt)}</div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="inline-flex h-9 max-w-full whitespace-nowrap px-3"
                            onClick={() => handleViewOrder(order.id)}
                          >
                            <Eye className="size-4" />
                            View
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
      />
    </div>
  );
}
