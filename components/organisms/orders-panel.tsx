"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Eye, Search, ShoppingCart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { SortableColumnHeader } from "@/components/ui/sortable-column-header";
import { TableSkeleton } from "@/components/skeletons/table-skeleton";
import { notify } from "@/lib/notify";

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
  customerEmail: string | null;
  customerPhone: string | null;
  createdAt: string;
  companyLocation: { id: string; name: string } | null;
  assignedMerchant: { id: string; name: string | null; email: string | null } | null;
  lineItemCount: number;
};

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
};

export function OrdersPanel() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([]);
  const [merchants, setMerchants] = useState<Array<{ id: string; name: string | null; email: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [merchantFilter, setMerchantFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
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
  }, [debouncedSearch, locationFilter, sourceFilter, merchantFilter, sortBy, sortOrder]);

  const fetchPageData = useCallback(async () => {
    const params = new URLSearchParams();
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (locationFilter) params.set("location_id", locationFilter);
    if (sourceFilter) params.set("source", sourceFilter);
    if (merchantFilter) params.set("merchant_id", merchantFilter);
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
    };
    setOrders(data.orders);
    setTotal(data.total);
    setLocations(data.locations ?? []);
    setMerchants(data.merchants ?? []);
  }, [debouncedSearch, locationFilter, sourceFilter, merchantFilter, page, limit, sortBy, sortOrder]);

  useEffect(() => {
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

  function addressesEqual(ship: unknown, bill: unknown): boolean {
    const s = formatAddress(ship);
    const b = formatAddress(bill);
    return s !== "—" && b !== "—" && s === b;
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
            Orders received from Shopify (web and POS). Filter by location, source, or assigned merchant.
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
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
            >
              <option value="">All locations</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
            >
              <option value="">All sources</option>
              <option value="web">Web</option>
              <option value="pos">POS</option>
            </select>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={merchantFilter}
              onChange={(e) => setMerchantFilter(e.target.value)}
            >
              <option value="">All merchants</option>
              {merchants.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.email || m.id}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <TableSkeleton columns={9} rows={6} />
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
                      <th className="px-4 py-2 text-left font-medium">Customer</th>
                      <SortableColumnHeader
                        label="Total"
                        sortKey="total"
                        currentSort={sortBy || undefined}
                        currentOrder={sortOrder}
                        onSort={handleSort}
                        align="right"
                      />
                      <th className="px-4 py-2 text-left font-medium">Status</th>
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
                          <div className="max-w-[180px] truncate" title={order.customerEmail ?? order.customerPhone ?? undefined}>
                            {order.customerEmail ?? order.customerPhone ?? "—"}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right">{formatPrice(order.totalPrice, order.currency)}</td>
                        <td className="px-4 py-2">
                          <span className="text-muted-foreground text-xs">
                            {order.financialStatus ?? "—"} / {order.fulfillmentStatus ?? "—"}
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

      <Dialog open={!!viewingOrderId} onOpenChange={(open) => !open && setViewingOrderId(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Order {orderDetail?.name ?? orderDetail?.orderNumber ?? orderDetail?.shopifyOrderId ?? "Details"}
            </DialogTitle>
            <DialogDescription>
              {orderDetail && formatDate(orderDetail.createdAt)}
            </DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <p className="py-8 text-center text-muted-foreground text-sm">Loading...</p>
          ) : orderDetail ? (
            <div className="space-y-6">
              {orderDetail.shopifyAdminOrderUrl && (
                <a
                  href={orderDetail.shopifyAdminOrderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="size-4" />
                  Open in Shopify Admin
                </a>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h4 className="mb-1 text-sm font-medium text-muted-foreground">Source</h4>
                  <span
                    className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                      orderDetail.sourceName === "pos"
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                        : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                    }`}
                  >
                    {orderDetail.sourceName}
                  </span>
                </div>
                <div>
                  <h4 className="mb-1 text-sm font-medium text-muted-foreground">Location</h4>
                  <p>{orderDetail.companyLocation?.name ?? "—"}</p>
                </div>
                <div>
                  <h4 className="mb-1 text-sm font-medium text-muted-foreground">Assigned Merchant</h4>
                  <p>{orderDetail.assignedMerchant?.name ?? orderDetail.assignedMerchant?.email ?? "—"}</p>
                </div>
                <div>
                  <h4 className="mb-1 text-sm font-medium text-muted-foreground">Payment / Fulfillment</h4>
                  <p className="text-sm">
                    {orderDetail.financialStatus ?? "—"} / {orderDetail.fulfillmentStatus ?? "—"}
                  </p>
                </div>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-medium">Customer</h4>
                <div className="space-y-1 text-sm">
                  {(getCustomerName(orderDetail.shippingAddress) ?? getCustomerName(orderDetail.billingAddress)) && (
                    <p className="font-medium">
                      {getCustomerName(orderDetail.shippingAddress) ?? getCustomerName(orderDetail.billingAddress)}
                    </p>
                  )}
                  {orderDetail.customerEmail && (
                    <p>
                      <a href={`mailto:${orderDetail.customerEmail}`} className="text-primary hover:underline">
                        {orderDetail.customerEmail}
                      </a>
                    </p>
                  )}
                  {(orderDetail.customerPhone ?? getAddressPhone(orderDetail.shippingAddress)) && (
                    <p>{orderDetail.customerPhone ?? getAddressPhone(orderDetail.shippingAddress)}</p>
                  )}
                  {!orderDetail.customerEmail && !orderDetail.customerPhone && !getCustomerName(orderDetail.shippingAddress) && (
                    <p className="text-muted-foreground">—</p>
                  )}
                </div>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-medium">Shipping Address</h4>
                <p className="text-sm">{formatAddress(orderDetail.shippingAddress)}</p>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-medium">Billing Address</h4>
                <p className="text-sm text-muted-foreground">
                  {formatAddress(orderDetail.billingAddress) === "—" ||
                  addressesEqual(orderDetail.shippingAddress, orderDetail.billingAddress)
                    ? "Same as shipping address"
                    : formatAddress(orderDetail.billingAddress)}
                </p>
              </div>
              <div>
                <h4 className="mb-2 text-sm font-medium">Line Items</h4>
                <div className="rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-3 py-2 text-left font-medium">Product</th>
                        <th className="px-3 py-2 text-right font-medium">Qty</th>
                        <th className="px-3 py-2 text-right font-medium">Price</th>
                        <th className="px-3 py-2 text-right font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderDetail.lineItems.map((li) => (
                        <tr key={li.id} className="border-b last:border-0">
                          <td className="px-3 py-2">
                            <div>{li.productTitle}</div>
                            {(li.variantTitle || li.sku) && (
                              <div className="text-muted-foreground text-xs">
                                {[li.variantTitle, li.sku].filter(Boolean).join(" · ")}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">{li.quantity}</td>
                          <td className="px-3 py-2 text-right">
                            {formatPrice(li.price, orderDetail.currency)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {formatPrice(li.total, orderDetail.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="space-y-1 border-t pt-4 text-right text-sm">
                {orderDetail.subtotalPrice && (
                  <p className="text-muted-foreground">
                    Subtotal ({orderDetail.lineItems.length} item{orderDetail.lineItems.length !== 1 ? "s" : ""}):{" "}
                    {formatPrice(orderDetail.subtotalPrice, orderDetail.currency)}
                  </p>
                )}
                {orderDetail.totalDiscounts && Number(orderDetail.totalDiscounts) !== 0 && (
                  <p className="text-muted-foreground">
                    Discounts: -{formatPrice(orderDetail.totalDiscounts, orderDetail.currency)}
                  </p>
                )}
                {orderDetail.totalShipping && Number(orderDetail.totalShipping) !== 0 && (
                  <p className="text-muted-foreground">
                    Shipping: {formatPrice(orderDetail.totalShipping, orderDetail.currency)}
                  </p>
                )}
                {orderDetail.totalTax && Number(orderDetail.totalTax) !== 0 && (
                  <p className="text-muted-foreground">
                    Tax: {formatPrice(orderDetail.totalTax, orderDetail.currency)}
                  </p>
                )}
                <p className="pt-2 font-medium">
                  Total: {formatPrice(orderDetail.totalPrice, orderDetail.currency)}
                </p>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
