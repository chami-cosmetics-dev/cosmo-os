"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronsUpDown, Loader2, Plus, Trash2 } from "lucide-react";

import { useFulfillmentPermissions } from "@/components/contexts/fulfillment-permissions-context";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { notify } from "@/lib/notify";
import type { FulfillmentOrder } from "./fulfillment-order-selector";

interface FulfillmentSampleFreeIssuePanelProps {
  orderId: string | null;
  order: FulfillmentOrder | null;
  onRefresh: (clearSelection?: boolean) => void;
}

type LookupItem = { id: string; name: string; type: string };

type SampleOrderDetail = {
  id: string;
  name: string | null;
  orderNumber: string | null;
  totalPrice: string;
  currency: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  shippingAddress: unknown;
  lineItems: Array<{
    id: string;
    productTitle: string;
    variantTitle: string | null;
    sku: string | null;
    quantity: number;
    price: string;
    total: string;
  }>;
  sampleFreeIssues?: Array<{
    id: string;
    sampleFreeIssueItem: { id: string; name: string; type: string };
    quantity: number;
  }>;
};

function formatPrice(value?: string | null, currency?: string | null) {
  if (value == null) return "-";
  const amount = Number.parseFloat(value);
  if (Number.isNaN(amount)) return value;
  return amount.toLocaleString("en-LK", { minimumFractionDigits: 2 }) + (currency ? ` ${currency}` : "");
}

function formatAddress(addr: unknown) {
  if (!addr || typeof addr !== "object") return "-";
  const a = addr as Record<string, unknown>;
  const parts = [
    a.address1,
    a.address2,
    [a.city, a.province_code].filter(Boolean).join(", "),
    a.country,
    a.zip,
  ].filter(Boolean) as string[];
  return parts.join(", ") || "-";
}

export function FulfillmentSampleFreeIssuePanel({
  orderId,
  order,
  onRefresh,
}: FulfillmentSampleFreeIssuePanelProps) {
  const perms = useFulfillmentPermissions();
  const [lookups, setLookups] = useState<{ samplesFreeIssues: LookupItem[] } | null>(null);
  const [selectedSamples, setSelectedSamples] = useState<Array<{ id: string; qty: number }>>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [detail, setDetail] = useState<SampleOrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const isBusy = busyKey !== null;

  useEffect(() => {
    fetch("/api/admin/orders/fulfillment-lookups")
      .then((response) => response.json())
      .then((data) => setLookups(data))
      .catch(() => setLookups(null));
  }, []);

  useEffect(() => {
    if (!orderId) {
      setDetail(null);
      setSelectedSamples([]);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    fetch(`/api/admin/orders/${orderId}`)
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  async function reloadDetail() {
    if (!orderId) return;
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}`);
      setDetail(await response.json());
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function doAction(action: string, body?: Record<string, unknown>) {
    if (!orderId) return;
    setBusyKey(action);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/fulfillment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? { action }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        notify.error(data.error ?? "Action failed");
        return;
      }

      notify.success("Updated.");
      setSelectedSamples([]);
      if (action === "add_samples") {
        await reloadDetail();
      }
      onRefresh(action === "add_samples" ? false : true);
    } catch {
      notify.error("Action failed");
    } finally {
      setBusyKey(null);
    }
  }

  const selectedSampleRows = useMemo(
    () =>
      selectedSamples.map((sample) => ({
        ...sample,
        item: lookups?.samplesFreeIssues.find((item) => item.id === sample.id) ?? null,
      })),
    [lookups?.samplesFreeIssues, selectedSamples]
  );

  const orderLabel = order ? (order.name ?? order.orderNumber ?? order.id) : "-";
  const currency = detail?.currency ?? order?.currency;
  const isDetailPending = detailLoading && !detail;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Sample / Free Issue</h2>
          <p className="text-muted-foreground text-sm">
            {order ? `Order ${orderLabel}` : "Select an order to fill details"}
          </p>
        </div>
        <div className="rounded-md border border-border/70 px-3 py-2 text-right">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="font-semibold">{formatPrice(detail?.totalPrice ?? order?.totalPrice, currency)}</p>
        </div>
      </div>
        <>
            <div className="relative grid gap-3 rounded-md border border-border/70 p-3 text-sm lg:grid-cols-2">
              {isDetailPending && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                  <div className="flex items-center gap-2 rounded-md border border-border/70 bg-background px-3 py-2 text-xs text-muted-foreground shadow-sm">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Loading order details...
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <p><span className="font-medium">Invoice:</span> {orderLabel}</p>
                <p><span className="font-medium">Email:</span> {detail?.customerEmail ?? order?.customerEmail ?? "-"}</p>
                <p><span className="font-medium">Phone:</span> {detail?.customerPhone ?? order?.customerPhone ?? "-"}</p>
              </div>
              <div className="space-y-1">
                <p><span className="font-medium">Order date:</span> {order ? new Date(order.createdAt).toLocaleString("en-LK") : "-"}</p>
                <p><span className="font-medium">Total:</span> {formatPrice(detail?.totalPrice ?? order?.totalPrice, currency)}</p>
                <p><span className="font-medium">Address:</span> {formatAddress(detail?.shippingAddress)}</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-md border border-border/70">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="border-b border-border/70">
                    <th className="px-3 py-2 text-left font-medium">Item</th>
                    <th className="px-3 py-2 text-left font-medium">SKU</th>
                    <th className="px-3 py-2 text-right font-medium">Qty</th>
                    <th className="px-3 py-2 text-right font-medium">Price</th>
                    <th className="px-3 py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail?.lineItems ?? []).map((item) => (
                    <tr key={item.id} className="border-b border-border/50 last:border-0">
                      <td className="px-3 py-2 font-medium">
                        {item.productTitle}
                        {item.variantTitle && <span className="text-muted-foreground"> / {item.variantTitle}</span>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{item.sku ?? "-"}</td>
                      <td className="px-3 py-2 text-right">{item.quantity}</td>
                      <td className="px-3 py-2 text-right">{formatPrice(item.price, currency)}</td>
                      <td className="px-3 py-2 text-right">{formatPrice(item.total, currency)}</td>
                    </tr>
                  ))}
                  {(!detail || detail.lineItems.length === 0) && (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                      {order ? "No invoice items loaded." : "Select an order to view items."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>

        {lookups && perms.canManageSampleFreeIssue && (
          <>
            <div className="grid gap-3 rounded-md border border-border/70 p-3 lg:grid-cols-[minmax(260px,1fr)_110px_auto]">
              <div>
                <label className="mb-2 block text-sm font-medium">Sample / Free issue</label>
                <Popover open={addOpen} onOpenChange={setAddOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={addOpen}
                      disabled={!orderId}
                      className="w-full justify-between border-border/70 bg-background/90"
                    >
                      {orderId ? "Select item" : "Select order first"}
                      <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] border-border/70 p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search samples..." />
                      <CommandList>
                        <CommandEmpty>No item found.</CommandEmpty>
                        <CommandGroup>
                          {lookups.samplesFreeIssues.map((item) => (
                            <CommandItem
                              key={item.id}
                              value={`${item.name} ${item.type}`}
                              disabled={selectedSamples.some((sample) => sample.id === item.id)}
                              onSelect={() => {
                                if (!selectedSamples.some((sample) => sample.id === item.id)) {
                                  setSelectedSamples((prev) => [...prev, { id: item.id, qty: 1 }]);
                                }
                                setAddOpen(false);
                              }}
                            >
                              {item.name} ({item.type})
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Qty</label>
                <Input
                  type="number"
                  value={selectedSamples.at(-1)?.qty ?? 1}
                  min={1}
                  max={99}
                  disabled={!orderId || selectedSamples.length === 0}
                  onChange={(event) => {
                    const qty = parseInt(event.target.value, 10) || 1;
                    setSelectedSamples((prev) =>
                      prev.map((sample, index) => (index === prev.length - 1 ? { ...sample, qty } : sample))
                    );
                  }}
                  className="border-border/70 bg-background/90"
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!orderId || selectedSamples.length === 0 || isBusy}
                  onClick={() =>
                    doAction("add_samples", {
                      action: "add_samples",
                      samples: selectedSamples.map((sample) => ({
                        sampleFreeIssueItemId: sample.id,
                        quantity: sample.qty,
                      })),
                    })
                  }
                  className="w-full gap-2 border-border/70 bg-background/90"
                >
                  {busyKey === "add_samples" ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Plus className="size-4" aria-hidden />
                  )}
                  Add
                </Button>
              </div>
            </div>

            {(detail?.sampleFreeIssues?.length || selectedSampleRows.length > 0) && (
              <div className="overflow-hidden rounded-md border border-border/70">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr className="border-b border-border/70">
                      <th className="px-3 py-2 text-left font-medium">Sample / Extra</th>
                      <th className="px-3 py-2 text-left font-medium">Type</th>
                      <th className="px-3 py-2 text-right font-medium">Qty</th>
                      <th className="px-3 py-2 text-right font-medium">Remove</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail?.sampleFreeIssues?.map((sample) => (
                      <tr key={sample.id} className="border-b border-border/50 last:border-0">
                        <td className="px-3 py-2 font-medium">{sample.sampleFreeIssueItem.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{sample.sampleFreeIssueItem.type}</td>
                        <td className="px-3 py-2 text-right">{sample.quantity}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">Saved</td>
                      </tr>
                    ))}
                    {selectedSampleRows.map((sample) => (
                      <tr key={sample.id} className="border-b border-border/50 last:border-0">
                        <td className="px-3 py-2 font-medium">{sample.item?.name ?? "Selected item"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{sample.item?.type ?? "-"}</td>
                        <td className="px-3 py-2 text-right">
                          <Input
                            type="number"
                            min={1}
                            max={99}
                            value={sample.qty}
                            onChange={(event) =>
                              setSelectedSamples((prev) =>
                                prev.map((item) =>
                                  item.id === sample.id ? { ...item, qty: parseInt(event.target.value, 10) || 1 } : item
                                )
                              )
                            }
                            className="ml-auto h-8 w-20 border-border/70 bg-background/90 text-right"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground"
                            onClick={() => setSelectedSamples((prev) => prev.filter((item) => item.id !== sample.id))}
                            aria-label="Remove selected sample"
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                onClick={() => doAction("advance_to_print")}
                disabled={!orderId || isBusy}
                className="h-11 bg-green-600 px-8 text-white hover:bg-green-700"
              >
                {busyKey === "advance_to_print" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <CheckCircle2 className="size-4" aria-hidden />
                )}
                Confirm Sample
              </Button>
            </div>
          </>
        )}

        {lookups && !perms.canManageSampleFreeIssue && (
          <p className="text-muted-foreground text-sm">
            You do not have permission to add samples or advance orders.
          </p>
        )}
    </div>
  );
}
