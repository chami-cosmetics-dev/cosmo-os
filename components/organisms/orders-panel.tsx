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
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      notify.error(data.error ?? "Failed to load orders");
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
  }, [debouncedSearch, locationFilter, sourceFilter, merchantFilter, paymentGatewayFilter, page, limit, sortBy, sortOrder]);

  const skippedInitialFetch = useRef(false);
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
    <div className="space-y-6">
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
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-4">
            <div className="relative flex-1">
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
              <SelectTrigger className="w-full sm:w-48">
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
              <SelectTrigger className="w-full sm:w-40">
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
              <SelectTrigger className="w-full sm:w-52">
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
              <SelectTrigger className="w-full min-w-0 sm:max-w-[14rem] sm:flex-1">
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
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <SortableColumnHeader
                        label="Order"
                        sortKey="name"
                        currentSort={sortBy || undefined}
                        currentOrder={sortOrder}
                        onSort={handleSort}
                      />
                      <SortableColumnHeader
                        label="Source"
                        sortKey="source"
                        currentSort={sortBy || undefined}
                        currentOrder={sortOrder}
                        onSort={handleSort}
                      />
                      <th className="px-4 py-2 text-left font-medium">Payment</th>
                      <th className="px-4 py-2 text-left font-medium">Customer</th>
                      <SortableColumnHeader
                        label="Total (LKR)"
                        sortKey="total"
                        currentSort={sortBy || undefined}
                        currentOrder={sortOrder}
                        onSort={handleSort}
                        align="right"
                      />
                      <th className="px-4 py-2 text-left font-medium">Shopify Status</th>
                      <th className="px-4 py-2 text-left font-medium">Fulfillment Stage</th>
                      <SortableColumnHeader
                        label="Location"
                        sortKey="location"
                        currentSort={sortBy || undefined}
                        currentOrder={sortOrder}
                        onSort={handleSort}
                      />
                      <SortableColumnHeader
                        label="Merchant"
                        sortKey="merchant"
                        currentSort={sortBy || undefined}
                        currentOrder={sortOrder}
                        onSort={handleSort}
                      />
                      <SortableColumnHeader
                        label="Date"
                        sortKey="created"
                        currentSort={sortBy || undefined}
                        currentOrder={sortOrder}
                        onSort={handleSort}
                      />
                      <th className="px-4 py-2 text-left font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id} className="border-b last:border-0">
                        <td className="px-4 py-2 font-medium">{order.name ?? order.orderNumber ?? "—"}</td>
                        <td className="px-4 py-2">
                          <span
                            className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                              order.sourceName === "pos"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                                : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                            }`}
                          >
                            {order.sourceName}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className="text-muted-foreground max-w-[160px] truncate text-xs"
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
                          <div className="max-w-[180px] truncate" title={order.customerEmail ?? order.customerPhone ?? undefined}>
                            {order.customerEmail ?? order.customerPhone ?? "—"}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right">{formatPrice(order.totalPrice)}</td>
                        <td className="px-4 py-2">
                          <span className="text-muted-foreground text-xs">
                            {order.financialStatus ?? "—"} / {order.fulfillmentStatus ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <span className="text-muted-foreground text-xs">
                            {order.fulfillmentStage
                              ? FULFILLMENT_STAGE_LABELS[order.fulfillmentStage] ?? order.fulfillmentStage
                              : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-2">{order.companyLocation?.name ?? "—"}</td>
                        <td className="px-4 py-2">{order.assignedMerchant?.name ?? order.assignedMerchant?.email ?? "—"}</td>
                        <td className="px-4 py-2 text-muted-foreground">{formatDate(order.createdAt)}</td>
                        <td className="px-4 py-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex items-center gap-1.5"
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
