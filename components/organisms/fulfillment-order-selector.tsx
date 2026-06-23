"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarClock, Check, ChevronsUpDown, Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FulfillmentOrderInvoiceDetails } from "@/components/organisms/fulfillment-order-invoice-details";
import { FulfillmentOrderReference } from "@/components/molecules/fulfillment-order-reference";
import { fulfillmentOrderSearchTokens } from "@/lib/fulfillment-order-reference";
import {
  isDeliveryFulfillmentStages,
  isDispatchFulfillmentStages,
} from "@/lib/fulfillment-queue-filters";
import { useFulfillmentOrderDeepLink } from "@/hooks/use-fulfillment-order-deep-link";
import { notify } from "@/lib/notify";
import { TASK_REMINDER_ORDER_ID_PARAM } from "@/lib/task-reminder-links";

export type FulfillmentOrder = {
  id: string;
  orderNumber: string | null;
  name: string | null;
  shopifyOrderId?: string | null;
  erpnextInvoiceId?: string | null;
  sourceName: string;
  totalPrice: string;
  currency: string | null;
  paymentGatewayNames?: string[];
  paymentGatewayPrimary?: string | null;
  createdAt: string;
  companyLocation: { id: string; name: string } | null;
  assignedMerchant: { id: string; name: string | null; email: string | null } | null;
  discountCodes?: unknown;
  customerEmail: string | null;
  customerPhone: string | null;
  printCount?: number;
  packageOnHoldAt?: string | null;
  packageHoldReason?: { id: string; name: string } | null;
  sampleFreeIssueSendLaterDate?: string | null;
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
  currentStage?: string;
  showPrintStatus?: boolean;
  showHoldStatus?: boolean;
  showInvoiceDetails?: boolean;
  worksheetMode?: boolean;
  bulkPrintUnprinted?: boolean;
  showEmptyWorksheet?: boolean;
  allowFutureSendLater?: boolean;
  returnFilter?: "normal" | "rearrange";
  unprintedOnly?: boolean;
  printMode?: boolean;
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
  currentStage,
  showPrintStatus = false,
  showHoldStatus = false,
  showInvoiceDetails = true,
  worksheetMode = false,
  bulkPrintUnprinted = false,
  showEmptyWorksheet = false,
  allowFutureSendLater = false,
  returnFilter,
  unprintedOnly = false,
  printMode = false,
  children,
}: FulfillmentOrderSelectorProps) {
  const [orders, setOrders] = useState<FulfillmentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const stageList = useMemo(
    () => stages.split(",").map((stage) => stage.trim()).filter(Boolean),
    [stages],
  );
  const isDispatchQueue = useMemo(
    () => isDispatchFulfillmentStages(stageList),
    [stageList],
  );
  const isDeliveryQueue = useMemo(
    () => isDeliveryFulfillmentStages(stageList),
    [stageList],
  );
  const isDispatchOrDeliveryQueue = isDispatchQueue || isDeliveryQueue;
  const fulfillmentSortBy = printMode
    ? "updated"
    : isDeliveryQueue
      ? "dispatched"
      : isDispatchQueue
        ? "last_printed"
        : "created";
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(
    bulkPrintUnprinted ? 100 : isDispatchOrDeliveryQueue ? 50 : 5,
  );
  const [total, setTotal] = useState(0);
  const [orderOpen, setOrderOpen] = useState(false);
  const [selectionLoading, setSelectionLoading] = useState(false);
  const [showFutureSendLater, setShowFutureSendLater] = useState(false);
  const [pinnedOrder, setPinnedOrder] = useState<FulfillmentOrder | null>(null);
  const searchParams = useSearchParams();

  useFulfillmentOrderDeepLink(selectedOrderId, onSelectOrder, setPinnedOrder);

  useEffect(() => {
    if (!selectedOrderId) setPinnedOrder(null);
  }, [selectedOrderId]);

  const resolveSelectedOrder = useCallback(
    (orderId: string | null) => {
      if (!orderId) return null;
      return (
        orders.find((order) => order.id === orderId) ??
        (pinnedOrder?.id === orderId ? pinnedOrder : null)
      );
    },
    [orders, pinnedOrder],
  );

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  const effectiveSearch = useMemo(() => debouncedSearch.trim(), [debouncedSearch]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("fulfillment_stages", stages);
    params.set("page", String(page));
    params.set("limit", String(limit));
    params.set("sort_by", fulfillmentSortBy);
    params.set("sort_order", "desc");
    if (allowFutureSendLater) {
      params.set("sample_send_later", showFutureSendLater ? "future" : "available");
    }
    if (returnFilter) {
      params.set("return_filter", returnFilter);
    }
    if (printMode) {
      params.set("print_mode", "true");
    } else if (unprintedOnly) {
      params.set("unprinted_only", "true");
    }
    if (effectiveSearch) params.set("search", effectiveSearch);
    const res = await fetch(`/api/admin/orders/page-data?${params}`);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      notify.error(data.error ?? "Failed to load orders");
      setLoading(false);
      return;
    }
    const data = (await res.json()) as {
      orders: FulfillmentOrder[];
      total: number;
    };
    setOrders(data.orders ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [
    allowFutureSendLater,
    effectiveSearch,
    isDispatchOrDeliveryQueue,
    fulfillmentSortBy,
    returnFilter,
    unprintedOnly,
    printMode,
    showFutureSendLater,
    stages,
    page,
    limit,
  ]);

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      fetchOrders().catch(() => {
        if (!cancelled) setLoading(false);
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [fetchOrders, refreshTrigger]);

  function formatPrice(val: string, currency?: string | null): string {
    const n = parseFloat(val);
    if (Number.isNaN(n)) return val;
    return n.toLocaleString("en-LK", { minimumFractionDigits: 2 }) + (currency ? ` ${currency}` : "");
  }

  function formatDate(val: string): string {
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-LK");
  }

  function merchantLabel(order: FulfillmentOrder) {
    const merchant = order.assignedMerchant?.name ?? order.assignedMerchant?.email ?? null;
    if (merchant) return merchant;
    const codes = Array.isArray(order.discountCodes) ? order.discountCodes as Array<{ code?: string }> : [];
    const joined = codes.map((d) => d?.code?.trim()).filter((c): c is string => !!c && c.toLowerCase() !== "shopify").join(", ");
    return joined || "No merchant";
  }

  if (worksheetMode) {
    const selectedOrder = resolveSelectedOrder(selectedOrderId);
    const deepLinkOrderId = searchParams.get(TASK_REMINDER_ORDER_ID_PARAM)?.trim() ?? null;
    const deepLinkPending = Boolean(deepLinkOrderId && selectedOrderId !== deepLinkOrderId);
    const unprintedOrders = bulkPrintUnprinted
      ? orders.filter((order) => (order.printCount ?? 0) === 0)
      : [];

    const handleWorksheetSelect = (order: FulfillmentOrder) => {
      setSelectionLoading(true);
      setPinnedOrder(order);
      onSelectOrder(order);
      setOrderOpen(false);
      window.setTimeout(() => setSelectionLoading(false), 450);
    };

    function getUnprintedOrderIds() {
      if (unprintedOrders.length === 0) {
        notify.info("No unprinted orders found in the loaded print queue.");
        return null;
      }

      return unprintedOrders.map((order) => order.id).join(",");
    }

    const handleBulkPrintUnprinted = () => {
      const ids = getUnprintedOrderIds();
      if (!ids) return;
      window.open(`/api/admin/orders/bulk-print?ids=${encodeURIComponent(ids)}`, "_blank", "noopener");
      window.open(
        `/api/admin/orders/location-pick-list?download=1&ids=${encodeURIComponent(ids)}`,
        "_blank",
        "noopener"
      );
      notify.success(`Opened invoices and downloading location files for ${unprintedOrders.length} order(s).`);
      window.setTimeout(() => {
        void fetchOrders();
      }, 1500);
    };

    return (
      <Card className="border-border/70 bg-background shadow-xs">
        <CardContent className="space-y-4 p-4">
          <div>
            <div className="grid gap-2 sm:grid-cols-[130px_minmax(260px,520px)_auto] sm:items-center">
              <label className="text-sm font-medium">Order number</label>
              <Popover open={orderOpen} onOpenChange={setOrderOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={orderOpen}
                    className="h-10 justify-between border-border/70 bg-background text-left font-normal"
                  >
                    {selectedOrder ? (
                      <FulfillmentOrderReference order={selectedOrder} variant="inline" />
                    ) : deepLinkPending ? (
                      "Loading order..."
                    ) : (
                      "Please Select an Option"
                    )}
                    <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-130 border-border/70 p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search by invoice, order number…"
                      value={search}
                      onValueChange={(value) => {
                        setSearch(value);
                        setPage(1);
                      }}
                    />
                    <CommandList>
                      <CommandEmpty>
                        {loading
                          ? "Loading orders..."
                          : search.trim()
                            ? `No order found for "${search.trim()}".`
                            : showFutureSendLater
                              ? "No future order found."
                              : "No order found."}
                      </CommandEmpty>
                      <CommandGroup>
                        {orders.map((order) => {
                          return (
                            <CommandItem
                              key={order.id}
                              value={fulfillmentOrderSearchTokens(order)}
                              onSelect={() => handleWorksheetSelect(order)}
                              className="flex items-center justify-between gap-3"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block truncate">
                                  <FulfillmentOrderReference order={order} />
                                  <span className="text-muted-foreground ml-2 text-xs">
                                    {merchantLabel(order)}
                                  </span>
                                </span>
                                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                  {order.companyLocation?.name ?? "No location"}
                                </span>
                                {showFutureSendLater && order.sampleFreeIssueSendLaterDate && (
                                  <span className="mt-0.5 block text-xs text-muted-foreground">
                                    Send {new Date(order.sampleFreeIssueSendLaterDate).toISOString().slice(0, 10)}
                                  </span>
                                )}
                              </span>
                              {selectedOrderId === order.id && <Check className="size-4" aria-hidden />}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {allowFutureSendLater && (
                <Button
                  type="button"
                  variant={showFutureSendLater ? "default" : "outline"}
                  onClick={() => {
                    onSelectOrder(null);
                    setOrderOpen(false);
                    setPage(1);
                    setShowFutureSendLater((current) => !current);
                  }}
                  className="gap-2"
                >
                  <CalendarClock className="size-4" aria-hidden />
                  {showFutureSendLater ? "Today Queue" : "Future Orders"}
                </Button>
              )}
              {bulkPrintUnprinted && (
                <Button
                  type="button"
                  onClick={handleBulkPrintUnprinted}
                  disabled={loading || unprintedOrders.length === 0}
                  className="bg-amber-500 text-white hover:bg-amber-600"
                >
                  Print all unprinted ({unprintedOrders.length})
                </Button>
              )}
            </div>
          </div>

          {selectedOrderId ? (
            <div className="border-t border-border/70 pt-4">
              {selectionLoading || deepLinkPending ? (
                <div className="flex items-center justify-center gap-2 rounded-md border border-dashed border-border/70 py-12 text-sm text-muted-foreground">
                  <Loader2 className="size-5 animate-spin" aria-hidden />
                  Loading selected order...
                </div>
              ) : (
                <>
                  {showInvoiceDetails && (
                    <FulfillmentOrderInvoiceDetails
                      orderId={selectedOrderId}
                      refreshTrigger={invoiceRefreshTrigger}
                      currentStage={currentStage}
                    />
                  )}
                  {children}
                </>
              )}
            </div>
          ) : showEmptyWorksheet ? (
            <div className="border-t border-border/70 pt-4">
              {children}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border/70 py-10 text-center text-sm text-muted-foreground">
              Select an order number to add samples or free issues.
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent),color-mix(in_srgb,var(--primary)_8%,transparent))]">
          <CardTitle>{title}</CardTitle>
          <p className="text-muted-foreground text-sm">{description}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_96%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))] p-4 shadow-xs">
            <div className="relative">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                placeholder="Search by invoice, order number, phone…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="border-border/70 bg-background/90 pl-9"
              />
            </div>
          </div>
          {loading && orders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_97%,white),color-mix(in_srgb,var(--secondary)_8%,transparent))] px-6 py-8 text-center">
              <p className="text-muted-foreground text-sm">Loading orders...</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_97%,white),color-mix(in_srgb,var(--secondary)_8%,transparent))] px-6 py-8 text-center">
              <p className="text-muted-foreground text-sm">
                {search.trim()
                  ? `No order found for "${search.trim()}".`
                  : "No orders at this stage."}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="max-h-70 overflow-y-auto rounded-2xl border border-border/70 bg-background/90 shadow-xs">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_94%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))] backdrop-blur">
                    <tr className="border-b border-border/60">
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
                          selectedOrderId === order.id ? "bg-primary/10" : "hover:bg-secondary/10"
                        }`}
                      >
                        <td className="px-4 py-2">
                          <FulfillmentOrderReference order={order} />
                        </td>
                        <td className="px-4 py-2">{order.companyLocation?.name ?? "—"}</td>
                        <td className="px-4 py-2">{order.assignedMerchant?.name ?? order.assignedMerchant?.email ?? "—"}</td>
                        <td className="px-4 py-2 max-w-35 truncate" title={order.customerEmail ?? order.customerPhone ?? undefined}>
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
                            className={selectedOrderId === order.id ? "shadow-[0_10px_24px_-18px_var(--primary)]" : "border-border/70 bg-background/80 hover:bg-secondary/10"}
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
          {showInvoiceDetails && (
            <FulfillmentOrderInvoiceDetails
              orderId={selectedOrderId}
              refreshTrigger={invoiceRefreshTrigger}
              currentStage={currentStage}
            />
          )}
          {children}
        </>
      )}
    </div>
  );
}
