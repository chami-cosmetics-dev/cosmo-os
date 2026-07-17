"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronsUpDown, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { useFulfillmentPermissions } from "@/components/contexts/fulfillment-permissions-context";
import { FulfillmentOrderReference } from "@/components/molecules/fulfillment-order-reference";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { formatAppDateTime } from "@/lib/format-datetime";
import { getPaymentMethodInfo } from "@/lib/payment-method-label";
import { LIMITS } from "@/lib/validation";
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
  paymentGatewayNames?: string[];
  paymentGatewayPrimary?: string | null;
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
  sampleFreeIssueSendLaterDate?: string | null;
  remarks?: Array<{
    id: string;
    content: string;
    createdAt: string;
    stage: string;
    type: string;
    showOnInvoice?: boolean;
    addedBy: { id: string; name: string | null; email: string | null } | null;
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

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function todayDateInputValue() {
  return toDateInputValue(new Date());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
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
  const [remarkContent, setRemarkContent] = useState("");
  const [editingRemarkId, setEditingRemarkId] = useState<string | null>(null);
  const [remarkBusy, setRemarkBusy] = useState(false);
  const [sendLaterDate, setSendLaterDate] = useState("");
  const sendLaterInputRef = useRef<HTMLInputElement | null>(null);
  const [showBankTransferDialog, setShowBankTransferDialog] = useState(false);
  const [bankTransferBusy, setBankTransferBusy] = useState(false);
  const [showKokoDialog, setShowKokoDialog] = useState(false);
  const [kokoBusy, setKokoBusy] = useState(false);
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
      setRemarkContent("");
      setEditingRemarkId(null);
      setSendLaterDate("");
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

  function resetRemarkForm() {
    setRemarkContent("");
    setEditingRemarkId(null);
  }

  async function saveRemark() {
    if (!orderId) return;
    const content = remarkContent.trim();
    if (!content) return;

    setRemarkBusy(true);
    try {
      const response = await fetch(
        editingRemarkId
          ? `/api/admin/orders/${orderId}/remarks/${editingRemarkId}`
          : `/api/admin/orders/${orderId}/remarks`,
        {
          method: editingRemarkId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            editingRemarkId
              ? { content, showOnInvoice: false }
              : {
                  stage: "sample_free_issue",
                  type: "internal",
                  content,
                  showOnInvoice: false,
                }
          ),
        }
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        notify.error(data.error ?? "Failed to save remark");
        return;
      }

      notify.success(editingRemarkId ? "Remark updated." : "Remark added.");
      resetRemarkForm();
      await reloadDetail();
    } catch {
      notify.error("Failed to save remark");
    } finally {
      setRemarkBusy(false);
    }
  }

  async function deleteRemark(remarkId: string) {
    if (!orderId) return;
    setRemarkBusy(true);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/remarks/${remarkId}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        notify.error(data.error ?? "Failed to delete remark");
        return;
      }

      notify.success("Remark deleted.");
      if (editingRemarkId === remarkId) resetRemarkForm();
      await reloadDetail();
    } catch {
      notify.error("Failed to delete remark");
    } finally {
      setRemarkBusy(false);
    }
  }

  function validateSendLaterDate() {
    if (!order || !sendLaterDate) return true;
    const orderDate = new Date(order.createdAt);
    const minDate = toDateInputValue(orderDate);
    const maxDate = toDateInputValue(addDays(orderDate, 3));
    if (sendLaterDate < minDate || sendLaterDate > maxDate) {
      notify.error("Send later date must be within 3 days from the order date.");
      return false;
    }
    return true;
  }

  async function saveSendLaterDate() {
    if (!orderId || !sendLaterDate || !validateSendLaterDate()) return false;

    setRemarkBusy(true);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/fulfillment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_sample_send_later_date",
          sendLaterDate,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        notify.error(data.error ?? "Failed to save send later date");
        return false;
      }

      return true;
    } catch {
      notify.error("Failed to save send later date");
      return false;
    } finally {
      setRemarkBusy(false);
    }
  }

  async function handleScheduledAction(action: "send_sample_now" | "cancel_sample_send_later") {
    if (!orderId) return;

    const actionLabel =
      action === "send_sample_now" ? "Send now" : "Cancel schedule";

    setBusyKey(action);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/fulfillment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        notify.error(data.error ?? `${actionLabel} failed`);
        return;
      }

      notify.success(
        action === "send_sample_now"
          ? "Order moved into today's queue."
          : "Future schedule cancelled."
      );
      setSendLaterDate("");
      onRefresh(true);
    } catch {
      notify.error(`${actionLabel} failed`);
    } finally {
      setBusyKey(null);
    }
  }

  async function confirmSample() {
    if (!orderId) return;

    const savedDate = sendLaterDate;
    if (savedDate) {
      const saved = await saveSendLaterDate();
      if (!saved) return;
      setSendLaterDate("");
      if (savedDate > todayDateInputValue()) {
        notify.success("Send later date saved.");
        onRefresh(true);
        return;
      }
    }

    await doAction("advance_to_print");
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

  const currency = detail?.currency ?? order?.currency;
  const paymentMethodInfo = getPaymentMethodInfo({
    paymentGatewayPrimary: detail?.paymentGatewayPrimary ?? order?.paymentGatewayPrimary,
    paymentGatewayNames: detail?.paymentGatewayNames ?? order?.paymentGatewayNames,
  });
  const paymentMethod = paymentMethodInfo.label;
  const isCodOrder = paymentMethodInfo.variant === "cod";

  const requiresFinanceApproval = useMemo(() => {
    const gateways = [
      detail?.paymentGatewayPrimary ?? order?.paymentGatewayPrimary,
      ...(detail?.paymentGatewayNames ?? order?.paymentGatewayNames ?? []),
    ].map((g) => g?.toLowerCase().trim() ?? "").filter(Boolean);
    return gateways.some((g) => g.includes("koko") || g.includes("bank"));
  }, [detail, order]);

  async function handleConfirmBankTransfer() {
    if (!orderId) return;
    setBankTransferBusy(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/payment-method`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetPaymentMethod: "bank_transfer" }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to update payment method");
        return;
      }
      notify.success("Bank Transfer change request sent to finance for approval.");
      setShowBankTransferDialog(false);
      onRefresh(true);
    } catch {
      notify.error("Failed to update payment method");
    } finally {
      setBankTransferBusy(false);
    }
  }
  async function handleRequestKokoChange() {
    if (!orderId) return;
    setKokoBusy(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/payment-method`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetPaymentMethod: "koko" }),
      });
      const data = (await res.json()) as { error?: string; pendingApproval?: boolean };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to request KOKO payment change");
        return;
      }
      notify.success("KOKO payment change request sent to finance for approval.");
      setShowKokoDialog(false);
      onRefresh(false);
    } catch {
      notify.error("Failed to request KOKO payment change");
    } finally {
      setKokoBusy(false);
    }
  }

  const isDetailPending = detailLoading && !detail;
  const remarks = detail?.remarks ?? [];
  const orderDate = order ? new Date(order.createdAt) : null;
  const sendLaterMin = orderDate ? toDateInputValue(orderDate) : "";
  const sendLaterMax = orderDate ? toDateInputValue(addDays(orderDate, 3)) : "";
  const savedSendLaterDate = detail?.sampleFreeIssueSendLaterDate
    ? toDateInputValue(new Date(detail.sampleFreeIssueSendLaterDate))
    : order?.sampleFreeIssueSendLaterDate
      ? toDateInputValue(new Date(order.sampleFreeIssueSendLaterDate))
      : null;
  const isScheduledForFuture =
    savedSendLaterDate !== null && savedSendLaterDate > todayDateInputValue();

  return (
    <>
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Sample / Free Issue</h2>
          <p className="text-muted-foreground text-sm">
            {order ? (
              <>
                Order <FulfillmentOrderReference order={order} variant="inline" />
              </>
            ) : (
              "Select an order to fill details"
            )}
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
                <FulfillmentOrderReference order={order} variant="labeled" />
                <p><span className="font-medium">Email:</span> {detail?.customerEmail ?? order?.customerEmail ?? "-"}</p>
                <p><span className="font-medium">Phone:</span> {detail?.customerPhone ?? order?.customerPhone ?? (detail?.shippingAddress as Record<string, string> | null)?.phone ?? "-"}</p>
              </div>
              <div className="space-y-1">
                <p><span className="font-medium">Order date:</span> {order ? formatAppDateTime(order.createdAt, "-") : "-"}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">Payment:</span>
                  <span>{paymentMethod}</span>
                  {perms.canChangePaymentMethod && isCodOrder && orderId && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => { setShowBankTransferDialog(true); }}
                        className="h-6 px-2 text-xs border-blue-500 text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-950"
                      >
                        Bank Transfer
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowKokoDialog(true)}
                        className="h-6 px-2 text-xs border-emerald-500 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:border-emerald-400 dark:text-emerald-400 dark:hover:bg-emerald-950"
                      >
                        KOKO
                      </Button>
                    </>
                  )}
                </div>
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

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)]">
        <div className="rounded-md border border-border/70 p-2.5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Remarks</h3>
            <span className="text-muted-foreground text-xs">Visible throughout the order process</span>
          </div>
          {remarks.length > 0 ? (
            <div className="mb-2 max-h-24 space-y-1.5 overflow-y-auto">
              {remarks.map((remark) => (
                <div key={remark.id} className="flex items-start justify-between gap-2 rounded-md border border-border/60 px-2 py-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{remark.content}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {remark.stage.replaceAll("_", " ")}
                      {remark.showOnInvoice ? " - On invoice" : ""}
                    </p>
                  </div>
                  {perms.canManageRemarks && (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        disabled={remarkBusy}
                        onClick={() => {
                          setEditingRemarkId(remark.id);
                          setRemarkContent(remark.content);
                        }}
                        aria-label="Edit remark"
                      >
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive hover:text-destructive"
                        disabled={remarkBusy}
                        onClick={() => void deleteRemark(remark.id)}
                        aria-label="Delete remark"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground mb-2 rounded-md border border-dashed border-border/70 px-2 py-2 text-sm">
              {orderId ? "No remarks yet." : "Select an order to view or add remarks."}
            </p>
          )}
          {perms.canManageRemarks && (
            <div className="space-y-2">
              <textarea
                value={remarkContent}
                onChange={(event) => setRemarkContent(event.target.value)}
                maxLength={LIMITS.orderRemarkContent.max}
                rows={2}
                disabled={!orderId || remarkBusy}
                placeholder="Add remark for this order..."
                className="w-full rounded-md border border-border/70 bg-background px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted-foreground text-xs">
                  Internal process remark only.
                </p>
                <div className="flex gap-2">
                  {editingRemarkId && (
                    <Button type="button" variant="outline" onClick={resetRemarkForm} disabled={remarkBusy}>
                      Cancel
                    </Button>
                  )}
                  <Button
                    type="button"
                    onClick={() => void saveRemark()}
                    disabled={!orderId || remarkBusy || !remarkContent.trim()}
                  >
                    {remarkBusy ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : editingRemarkId ? (
                      "Update Remark"
                    ) : (
                      "Add Remark"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {lookups && perms.canManageSampleFreeIssue && (
          <div className="space-y-2 rounded-md border border-border/70 p-2.5">
            <div className="grid gap-2 lg:grid-cols-[minmax(220px,1fr)_82px_auto]">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Sample / Free issue</label>
                <Popover open={addOpen} onOpenChange={setAddOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={addOpen}
                      disabled={!orderId || !!order?.pendingMethodChangeApproval}
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
                <label className="mb-1.5 block text-sm font-medium">Qty</label>
                <Input
                  type="number"
                  value={selectedSamples.at(-1)?.qty ?? 1}
                  min={1}
                  max={99}
                  disabled={!orderId || selectedSamples.length === 0 || !!order?.pendingMethodChangeApproval}
                  onChange={(event) => {
                    const qty = parseInt(event.target.value, 10) || 1;
                    setSelectedSamples((prev) =>
                      prev.map((sample, index) => (index === prev.length - 1 ? { ...sample, qty } : sample))
                    );
                  }}
                  className="h-10 border-border/70 bg-background/90"
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!orderId || selectedSamples.length === 0 || isBusy || !!order?.pendingMethodChangeApproval}
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
              <div className="max-h-40 overflow-auto rounded-md border border-border/70">
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
            <div className="border-t border-border/70 pt-2">
              <div className="space-y-2">
                <label className="mb-1.5 block text-sm font-medium">Send later date</label>
                <Input
                  ref={sendLaterInputRef}
                  type="date"
                  value={sendLaterDate}
                  min={sendLaterMin}
                  max={sendLaterMax}
                  disabled={!orderId || remarkBusy}
                  onClick={() => sendLaterInputRef.current?.showPicker?.()}
                  onFocus={() => sendLaterInputRef.current?.showPicker?.()}
                  onChange={(event) => setSendLaterDate(event.target.value)}
                  className="h-10 border-border/70 bg-background/90"
                />
                <p className="text-muted-foreground mt-1 text-xs">
                  {order
                    ? `Allowed: ${sendLaterMin} to ${sendLaterMax}${savedSendLaterDate ? ` | Saved: ${savedSendLaterDate}` : ""}. Saves when confirming sample.`
                    : "Select order first"}
                </p>
                {isScheduledForFuture && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">Scheduled for {savedSendLaterDate}</p>
                        <p className="text-muted-foreground text-xs">
                          Use send now to bring it back into today&apos;s queue, or cancel the saved schedule.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void handleScheduledAction("cancel_sample_send_later")}
                          disabled={!orderId || isBusy || remarkBusy}
                        >
                          {busyKey === "cancel_sample_send_later" ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                          ) : null}
                          Cancel Schedule
                        </Button>
                        <Button
                          type="button"
                          onClick={() => void handleScheduledAction("send_sample_now")}
                          disabled={!orderId || isBusy || remarkBusy}
                        >
                          {busyKey === "send_sample_now" ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                          ) : null}
                          Send Now
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        </div>

        {order?.pendingMethodChangeApproval && orderId && (
          <div className="flex items-start gap-3 rounded-md border border-blue-500/40 bg-blue-500/10 px-4 py-3 text-sm">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-blue-600" aria-hidden />
            <div>
              <p className="font-medium text-blue-800 dark:text-blue-400">Payment method change pending finance approval</p>
              <p className="text-blue-700 dark:text-blue-500">
                A payment method change request is awaiting finance approval. Once approved, this order will move to the print queue automatically — no further action is needed here.
              </p>
            </div>
          </div>
        )}

        {requiresFinanceApproval && !order?.pendingMethodChangeApproval && orderId && (
          <div className="flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
            <div>
              <p className="font-medium text-amber-800 dark:text-amber-400">Finance approval required</p>
              <p className="text-amber-700 dark:text-amber-500">
                This order uses {paymentMethod} which requires finance team approval before it can proceed to print.
                An approval request has been sent automatically when samples were added.
              </p>
            </div>
          </div>
        )}

        {lookups && perms.canManageSampleFreeIssue && (
            <div className="flex justify-end">
              <Button
                onClick={() => void confirmSample()}
                disabled={!orderId || isBusy || remarkBusy || !!order?.pendingMethodChangeApproval}
                className="h-11 bg-green-600 px-8 text-white hover:bg-green-700"
              >
                {busyKey === "advance_to_print" || remarkBusy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <CheckCircle2 className="size-4" aria-hidden />
                )}
                Confirm Sample
              </Button>
            </div>
        )}

        {lookups && !perms.canManageSampleFreeIssue && (
          <p className="text-muted-foreground text-sm">
            You do not have permission to add samples or advance orders.
          </p>
        )}

    </div>

    <AlertDialog
      open={showBankTransferDialog}
      onOpenChange={(open) => { if (!open) setShowBankTransferDialog(false); }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Change to Bank Transfer</AlertDialogTitle>
          <AlertDialogDescription>
            This will send a payment method change request to the finance team for approval.
            Once approved, the payment type will be changed from COD to Bank Transfer and the ERP payment entry will be created.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={bankTransferBusy}>Cancel</AlertDialogCancel>
          <Button disabled={bankTransferBusy} onClick={() => void handleConfirmBankTransfer()}>
            {bankTransferBusy ? (
              <><Loader2 className="mr-2 size-4 animate-spin" />Sending...</>
            ) : (
              "Send for Approval"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog
      open={showKokoDialog}
      onOpenChange={(open) => { if (!open) setShowKokoDialog(false); }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Change to KOKO</AlertDialogTitle>
          <AlertDialogDescription>
            This will send a payment method change request to the finance team for approval.
            Once approved, the payment type will be changed from COD to KOKO and the ERP payment entry will be created under KOKO.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={kokoBusy}>Cancel</AlertDialogCancel>
          <Button disabled={kokoBusy} onClick={() => void handleRequestKokoChange()}>
            {kokoBusy ? (
              <><Loader2 className="mr-2 size-4 animate-spin" />Sending...</>
            ) : (
              "Send for Approval"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
