"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, ChevronsUpDown, Download, Loader2, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notify";
import type { ReturnsTrackingData, ReturnTrackingItem } from "@/lib/page-data/order-returns";
import {
  RETURN_REMARK_TEMPLATES,
  type ReturnRemarkTemplateCode,
} from "@/lib/return-remark-templates";
import { TASK_REMINDER_ORDER_ID_PARAM } from "@/lib/task-reminder-links";

type BulkReturnRow = {
  input: string;
  status:
    | "valid"
    | "not_found"
    | "duplicate_input"
    | "not_dispatched"
    | "missing_dispatch_date"
    | "ambiguous_match"
    | "missing_remark"
    | "processed"
    | "failed";
  message: string;
  orderId: string | null;
  invoiceNo: string | null;
  merchant: string | null;
  customer: string | null;
  shippingService: string | null;
  dispatchedAt: string | null;
  returnRemark?: string | null;
};

type BulkReturnResponse = {
  rows: BulkReturnRow[];
  counts: {
    total: number;
    valid?: number;
    invalid?: number;
    processed?: number;
    failed?: number;
  };
  error?: string;
};

type BulkOrderOption = {
  id: string;
  orderNumber: string | null;
  name: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  assignedMerchant: { id: string; name: string | null; email: string | null } | null;
  companyLocation: { id: string; name: string } | null;
};

type BulkRemarkDraft = {
  remarkTemplate: ReturnRemarkTemplateCode;
  customRemark: string;
};

function formatDateOnly(value?: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return new Intl.DateTimeFormat("en-LK", {
    timeZone: "UTC",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function actionTypeBadge(item: ReturnTrackingItem) {
  if (item.remarkTemplate === "invoice_revert") {
    if (item.actionStatus === "solved" && item.actionType === "void") {
      return { label: "Finance Reverted — Voided", className: "border-purple-500/30 bg-purple-500/10 text-purple-700" };
    }
    return { label: "Finance Reverted", className: "border-orange-500/30 bg-orange-500/10 text-orange-700" };
  }
  if (item.actionType === "cancel") {
    return item.actionStatus === "pending"
      ? { label: "Cancel Pending", className: "border-rose-500/30 bg-rose-500/10 text-rose-700" }
      : { label: "Cancelled", className: "border-rose-500/30 bg-rose-500/10 text-rose-700" };
  }
  if (item.actionType === "rearrange") {
    const awaitingBank =
      item.actionStatus === "pending" &&
      (item.paymentGatewayPrimary === "bank_transfer" || item.paymentGatewayNames.includes("bank_transfer"));
    return awaitingBank
      ? { label: "Awaiting Bank Transfer", className: "border-amber-500/30 bg-amber-500/10 text-amber-700" }
      : { label: "Rearranged", className: "border-sky-500/30 bg-sky-500/10 text-sky-700" };
  }
  return null;
}

function financeRevertSubStatus(item: ReturnTrackingItem) {
  if (item.actionStatus === "solved" && item.actionType === "void") return "Voided";
  if (item.orderFulfillmentStage === "returned_to_store") {
    return "Refunded — item returned, awaiting void approval";
  }
  return "Refunded — item not yet returned to store";
}

export function ReturnedOrdersPanel({ initialData }: { initialData: ReturnsTrackingData }) {
  const searchParams = useSearchParams();
  const appliedDeepLinkRef = useRef<string | null>(null);
  const [items, setItems] = useState(initialData.returns);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"__all" | ReturnTrackingItem["actionStatus"]>("pending");
  const [selectedId, setSelectedId] = useState(initialData.returns[0]?.id ?? "");
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const [remark, setRemark] = useState(selected?.returnRemark ?? selected?.actionRemark ?? "");
  const [cancelRemark, setCancelRemark] = useState("");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [bulkOrderOpen, setBulkOrderOpen] = useState(false);
  const [bulkOrderSearch, setBulkOrderSearch] = useState("");
  const [bulkOrderOptions, setBulkOrderOptions] = useState<BulkOrderOption[]>([]);
  const [selectedBulkOrders, setSelectedBulkOrders] = useState<BulkOrderOption[]>([]);
  const [bulkRemarkDrafts, setBulkRemarkDrafts] = useState<Record<string, BulkRemarkDraft>>({});
  const [bulkOrderLoading, setBulkOrderLoading] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkReturnRow[]>([]);
  const [bulkCounts, setBulkCounts] = useState<BulkReturnResponse["counts"] | null>(null);
  const [bulkBusyKey, setBulkBusyKey] = useState<"preview" | "confirm" | null>(null);

  useEffect(() => {
    const orderId = searchParams.get(TASK_REMINDER_ORDER_ID_PARAM)?.trim();
    if (!orderId || appliedDeepLinkRef.current === orderId) return;
    const match = items.find((item) => item.orderId === orderId);
    if (!match) return;
    setStatusFilter("__all");
    setSelectedId(match.id);
    appliedDeepLinkRef.current = orderId;
  }, [items, searchParams]);

  const bulkEntries = useMemo(
    () =>
      selectedBulkOrders
        .map((order) => {
          const reference = order.name ?? order.orderNumber ?? "";
          if (!reference) return null;
          const draft = bulkRemarkDrafts[order.id] ?? { remarkTemplate: "UTC" as const, customRemark: "" };
          return {
            reference,
            remarkTemplate: draft.remarkTemplate,
            customRemark: draft.customRemark.trim() || null,
          };
        })
        .filter(Boolean),
    [selectedBulkOrders, bulkRemarkDrafts]
  );

  const counts = useMemo(
    () =>
      items.reduce(
        (acc, item) => {
          acc.all += 1;
          if (item.actionStatus === "solved") acc.solved += 1;
          else acc.pending += 1;
          return acc;
        },
        { all: 0, pending: 0, solved: 0 }
      ),
    [items]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter !== "__all" && item.actionStatus !== statusFilter) return false;
      if (!query) return true;
      return [
        item.invoiceNo,
        item.customerName,
        item.customerEmail,
        item.customerPhone,
        item.merchant,
        item.shippingService,
        item.riderName,
        item.returnRemark,
        item.actionRemark,
        item.cancelRemark,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query));
    });
  }, [items, search, statusFilter]);

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setBulkOrderLoading(true);
      try {
        const params = new URLSearchParams({
          fulfillment_stages: "dispatched",
          page: "1",
          limit: "20",
        });
        if (bulkOrderSearch.trim()) {
          params.set("search", bulkOrderSearch.trim());
        }
        const res = await fetch(`/api/admin/orders/page-data?${params}`);
        if (!res.ok) {
          if (!cancelled) setBulkOrderOptions([]);
          return;
        }
        const data = (await res.json()) as { orders?: BulkOrderOption[] };
        if (!cancelled) setBulkOrderOptions(data.orders ?? []);
      } catch {
        if (!cancelled) setBulkOrderOptions([]);
      } finally {
        if (!cancelled) setBulkOrderLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [bulkOrderSearch]);

  function selectItem(item: ReturnTrackingItem) {
    setSelectedId(item.id);
    setRemark(item.returnRemark ?? item.actionRemark ?? "");
    setCancelRemark(item.cancelRemark ?? "");
  }

  function resetBulkPreview() {
    setBulkRows([]);
    setBulkCounts(null);
  }

  function addBulkOrder(order: BulkOrderOption) {
    setSelectedBulkOrders((current) =>
      current.some((item) => item.id === order.id) ? current : [...current, order]
    );
    setBulkRemarkDrafts((current) =>
      current[order.id]
        ? current
        : { ...current, [order.id]: { remarkTemplate: "UTC", customRemark: "" } }
    );
    resetBulkPreview();
    setBulkOrderOpen(false);
    setBulkOrderSearch("");
  }

  function removeBulkOrder(orderId: string) {
    setSelectedBulkOrders((current) => current.filter((order) => order.id !== orderId));
    setBulkRemarkDrafts((current) => {
      const next = { ...current };
      delete next[orderId];
      return next;
    });
    resetBulkPreview();
  }

  function updateBulkRemarkDraft(orderId: string, patch: Partial<BulkRemarkDraft>) {
    setBulkRemarkDrafts((current) => {
      const existing = current[orderId] ?? { remarkTemplate: "UTC" as const, customRemark: "" };
      return {
        ...current,
        [orderId]: { ...existing, ...patch },
      };
    });
    resetBulkPreview();
  }

  function bulkOrderLabel(order: BulkOrderOption) {
    return order.name ?? order.orderNumber ?? order.id;
  }

  function paymentLabel(item: ReturnTrackingItem) {
    return item.paymentGatewayPrimary ?? item.paymentGatewayNames[0] ?? item.financialStatus ?? "-";
  }

  function isBankTransferRearrangePending(item: ReturnTrackingItem | null) {
    return Boolean(
      item &&
        item.actionType === "rearrange" &&
        item.actionStatus === "pending" &&
        (item.paymentGatewayPrimary === "bank_transfer" ||
          item.paymentGatewayNames.includes("bank_transfer"))
    );
  }

  function canTakeAction(item: ReturnTrackingItem | null) {
    if (!item || item.actionStatus !== "pending") return false;
    if (item.remarkTemplate === "invoice_revert") return false;
    if (item.actionType === "cancel") return false;
    if (!item.actionType) return true;
    return isBankTransferRearrangePending(item);
  }

  async function saveAction(
    actionType: "save" | "rearrange" | "request_finance_approval" | "request_cancel" = "save"
  ) {
    if (!selected) return;
    if (actionType === "request_cancel" && !cancelRemark.trim()) {
      notify.error("Cancel remark is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/returns/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionStatus: actionType === "save" ? selected.actionStatus : "solved",
          actionRemark: remark.trim() || null,
          cancelRemark: actionType === "request_cancel" ? cancelRemark.trim() : undefined,
          actionType,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        returnedOrder?: Partial<ReturnTrackingItem>;
        order?: {
          financialStatus?: string | null;
          paymentGatewayPrimary?: string | null;
          requiresBankTransferBeforeRearrange?: boolean;
        };
      };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to save return action");
        return;
      }
      if (data.returnedOrder) {
        setItems((current) =>
          current.map((item) =>
            item.id === selected.id
              ? {
                  ...item,
                  ...data.returnedOrder,
                  returnRemark: data.returnedOrder?.returnRemark ?? item.returnRemark,
                  financialStatus: data.order?.financialStatus ?? item.financialStatus,
                  paymentGatewayPrimary: data.order?.paymentGatewayPrimary ?? item.paymentGatewayPrimary,
                  paymentGatewayNames: data.order?.paymentGatewayPrimary
                    ? [data.order.paymentGatewayPrimary]
                    : item.paymentGatewayNames,
                }
              : item
          )
        );
      }
      if (actionType === "request_cancel") {
        notify.success("Cancel request sent to finance. Finance will process cancellation in ERPNext.");
      } else if (actionType === "request_finance_approval") {
        notify.success("Finance approval requested.");
      } else if (data.order?.requiresBankTransferBeforeRearrange) {
        notify.success("Bank transfer required before rearrange. Order kept out of dispatch.");
      } else if (actionType === "rearrange") {
        notify.success("Rearrange action saved.");
      } else {
        notify.success("Return remark saved");
      }
    } catch {
      notify.error("Failed to save return action");
    } finally {
      setSaving(false);
    }
  }

  async function runBulkReturn(action: "preview" | "confirm") {
    if (bulkEntries.length === 0) {
      notify.error("Add at least one dispatched order");
      return;
    }

    setBulkBusyKey(action);
    try {
      const res = await fetch("/api/admin/orders/bulk-return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, entries: bulkEntries }),
      });
      const data = (await res.json()) as BulkReturnResponse;
      if (!res.ok) {
        notify.error(data.error ?? "Bulk return failed");
        return;
      }
      setBulkRows(data.rows ?? []);
      setBulkCounts(data.counts ?? null);
      if (action === "preview") {
        notify.success(`Preview ready: ${data.counts.valid ?? 0} valid, ${data.counts.invalid ?? 0} invalid`);
      } else {
        notify.success(`Bulk return complete: ${data.counts.processed ?? 0} processed`);
        if ((data.counts.processed ?? 0) > 0) {
          window.location.reload();
        }
      }
    } catch {
      notify.error("Bulk return failed");
    } finally {
      setBulkBusyKey(null);
    }
  }

  async function downloadCsv() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "__all") params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/admin/returns/export?${params}`);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        notify.error(data.error ?? "Failed to export CSV");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "return-orders.csv";
      link.click();
      URL.revokeObjectURL(url);
      notify.success("CSV downloaded");
    } catch {
      notify.error("Failed to export CSV");
    } finally {
      setExporting(false);
    }
  }

  function rowStatusClass(status: BulkReturnRow["status"]) {
    if (status === "valid") return "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300";
    if (status === "processed") return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    if (status === "failed") return "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300";
    return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-muted-foreground text-xs uppercase">Returned</p><p className="text-2xl font-semibold">{counts.all}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-muted-foreground text-xs uppercase">Pending</p><p className="text-2xl font-semibold">{counts.pending}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-muted-foreground text-xs uppercase">Solved</p><p className="text-2xl font-semibold">{counts.solved}</p></CardContent></Card>
      </div>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Returned Orders</CardTitle>
          <CardDescription>Track returned rider and courier orders, sales remarks, and pending/solved status.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 rounded-md border border-border/70 p-3">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end">
              <div className="space-y-2">
                <label className="text-sm font-medium">Bulk returned invoices</label>
                <Popover open={bulkOrderOpen} onOpenChange={setBulkOrderOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={bulkOrderOpen}
                      className="h-10 w-full justify-between border-border/70 bg-background text-left font-normal"
                      disabled={bulkBusyKey !== null}
                    >
                      Search dispatched order and add
                      <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[min(720px,calc(100vw-2rem))] border-border/70 p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Search invoice, customer, phone..."
                        value={bulkOrderSearch}
                        onValueChange={setBulkOrderSearch}
                      />
                      <CommandList>
                        <CommandEmpty>
                          {bulkOrderLoading ? "Loading dispatched orders..." : "No dispatched order found."}
                        </CommandEmpty>
                        <CommandGroup>
                          {bulkOrderLoading && (
                            <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                              <Loader2 className="size-4 animate-spin" aria-hidden />
                              Loading...
                            </div>
                          )}
                          {bulkOrderOptions.map((order) => {
                            const alreadySelected = selectedBulkOrders.some((item) => item.id === order.id);
                            return (
                              <CommandItem
                                key={order.id}
                                value={`${order.name ?? ""} ${order.orderNumber ?? ""}`}
                                onSelect={() => addBulkOrder(order)}
                                className="flex items-center justify-between gap-3"
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate font-medium">{bulkOrderLabel(order)}</span>
                                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                    {order.assignedMerchant?.name ?? order.assignedMerchant?.email ?? "No merchant"}
                                    {" | "}
                                    {order.customerPhone ?? order.customerEmail ?? "No customer contact"}
                                  </span>
                                </span>
                                {alreadySelected && <Check className="size-4" aria-hidden />}
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void runBulkReturn("preview")}
                disabled={bulkBusyKey !== null || bulkEntries.length === 0}
                className="gap-2"
              >
                {bulkBusyKey === "preview" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Previewing...
                  </>
                ) : (
                  "Preview"
                )}
              </Button>
              <Button
                type="button"
                onClick={() => void runBulkReturn("confirm")}
                disabled={
                  bulkBusyKey !== null ||
                  !bulkRows.some((row) => row.status === "valid" && row.orderId)
                }
              >
                {bulkBusyKey === "confirm" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Confirming...
                  </>
                ) : (
                  "Confirm Valid"
                )}
              </Button>
            </div>

            {selectedBulkOrders.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedBulkOrders([]);
                      setBulkRemarkDrafts({});
                      resetBulkPreview();
                    }}
                    disabled={bulkBusyKey !== null}
                    className="h-8"
                  >
                    Clear All
                  </Button>
                </div>
                <div className="overflow-x-auto rounded-md border border-border/70">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="bg-muted/40">
                      <tr className="border-b">
                        <th className="px-3 py-2 text-left font-medium">Invoice</th>
                        <th className="px-3 py-2 text-left font-medium">Remark Template</th>
                        <th className="px-3 py-2 text-left font-medium">Custom Remark</th>
                        <th className="px-3 py-2 text-left font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {selectedBulkOrders.map((order) => {
                        const draft = bulkRemarkDrafts[order.id] ?? { remarkTemplate: "UTC", customRemark: "" };
                        return (
                          <tr key={order.id} className="border-b last:border-0">
                            <td className="px-3 py-2 font-medium">{bulkOrderLabel(order)}</td>
                            <td className="px-3 py-2">
                              <Select
                                value={draft.remarkTemplate}
                                onValueChange={(value) =>
                                  updateBulkRemarkDraft(order.id, { remarkTemplate: value as ReturnRemarkTemplateCode })
                                }
                                disabled={bulkBusyKey !== null}
                              >
                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {RETURN_REMARK_TEMPLATES.map((template) => (
                                    <SelectItem key={template.code} value={template.code}>{template.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                value={draft.customRemark}
                                onChange={(event) => updateBulkRemarkDraft(order.id, { customRemark: event.target.value })}
                                placeholder={draft.remarkTemplate === "CUSTOM" ? "Required for custom" : "Optional"}
                                disabled={bulkBusyKey !== null}
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Button type="button" variant="ghost" size="sm" onClick={() => removeBulkOrder(order.id)} disabled={bulkBusyKey !== null}>
                                <X className="size-4" aria-hidden />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {bulkCounts && (
              <p className="text-muted-foreground text-sm">
                Total {bulkCounts.total}
                {bulkCounts.valid != null ? ` | Valid ${bulkCounts.valid}` : ""}
                {bulkCounts.invalid != null ? ` | Invalid ${bulkCounts.invalid}` : ""}
                {bulkCounts.processed != null ? ` | Processed ${bulkCounts.processed}` : ""}
                {bulkCounts.failed != null ? ` | Failed ${bulkCounts.failed}` : ""}
              </p>
            )}

            {bulkRows.length > 0 && (
              <div className="max-h-[360px] overflow-auto rounded-md border border-border/70">
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="bg-muted/40">
                    <tr className="border-b border-border/70">
                      <th className="px-3 py-2 text-left font-medium">Input</th>
                      <th className="px-3 py-2 text-left font-medium">Invoice</th>
                      <th className="px-3 py-2 text-left font-medium">Remark</th>
                      <th className="px-3 py-2 text-left font-medium">Merchant</th>
                      <th className="px-3 py-2 text-left font-medium">Service</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkRows.map((row, index) => (
                      <tr key={`${row.input}-${index}`} className="border-b border-border/50 last:border-0">
                        <td className="px-3 py-2 font-medium">{row.input}</td>
                        <td className="px-3 py-2">{row.invoiceNo ?? "-"}</td>
                        <td className="px-3 py-2">{row.returnRemark ?? "-"}</td>
                        <td className="px-3 py-2">{row.merchant ?? "-"}</td>
                        <td className="px-3 py-2">{row.shippingService ?? "-"}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${rowStatusClass(row.status)}`}>
                            {row.message}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search invoice, merchant, customer, phone, remark..." className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
              <SelectTrigger className="w-full lg:w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="solved">Solved</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" onClick={() => void downloadCsv()} disabled={exporting} className="gap-2">
              {exporting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
              Download CSV
            </Button>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="overflow-x-auto rounded-md border border-border/70">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-muted/30">
                  <tr className="border-b">
                    <th className="px-3 py-3 text-left">Invoice No</th>
                    <th className="px-3 py-3 text-left">Merchant</th>
                    <th className="px-3 py-3 text-left">Rider / Courier</th>
                    <th className="px-3 py-3 text-left">Return Date</th>
                    <th className="px-3 py-3 text-left">Remark</th>
                    <th className="px-3 py-3 text-left">Type</th>
                    <th className="px-3 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const badge = actionTypeBadge(item);
                    return (
                      <tr key={item.id} onClick={() => selectItem(item)} className={`cursor-pointer border-b last:border-0 hover:bg-secondary/10 ${selectedId === item.id ? "bg-primary/8" : ""}`}>
                        <td className="px-3 py-3 font-medium">{item.invoiceNo}</td>
                        <td className="px-3 py-3">{item.merchant ?? "-"}</td>
                        <td className="px-3 py-3">{item.riderName ?? item.shippingService}</td>
                        <td className="px-3 py-3">{formatDateOnly(item.returnDate)}</td>
                        <td className="max-w-[220px] truncate px-3 py-3">{item.returnRemark ?? item.actionRemark ?? "-"}</td>
                        <td className="px-3 py-3">
                          {badge ? (
                            <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${badge.className}`}>
                              {badge.label}
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-3 py-3">{item.actionStatus === "solved" ? "Solved" : "Pending"}</td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">No returned orders found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <Card className="border-border/70">
              <CardHeader>
                <CardTitle>Return Action</CardTitle>
                <CardDescription>{selected ? `${selected.invoiceNo} | ${selected.customerPhone ?? "No phone"}` : "Select a returned order"}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {selected ? (
                  <>
                    <div className="rounded-md border border-border/70 px-3 py-2 text-sm">
                      Status: {selected.actionStatus === "solved" ? "Solved" : "Pending"}
                      {selected.merchant && (
                        <div className="mt-1 text-muted-foreground">Merchant: {selected.merchant}</div>
                      )}
                      <div className="mt-1 text-muted-foreground">Payment: {paymentLabel(selected)}</div>
                      <div className="mt-1 text-muted-foreground">Service: {selected.riderName ?? selected.shippingService}</div>
                      {selected.returnRemark && (
                        <div className="mt-1 text-muted-foreground">Return remark: {selected.returnRemark}</div>
                      )}
                    </div>
                    {selected.remarkTemplate === "invoice_revert" && (
                      <div className="rounded-md border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-sm text-orange-800 dark:text-orange-300">
                        <p className="font-medium">Finance Reverted</p>
                        <p className="mt-0.5">{financeRevertSubStatus(selected)}</p>
                        {selected.revertedFromInvoiceCompleteAt && (
                          <p className="mt-1 text-xs opacity-75">
                            Reverted on {formatDateOnly(selected.revertedFromInvoiceCompleteAt)}
                          </p>
                        )}
                      </div>
                    )}
                    {isBankTransferRearrangePending(selected) && (
                      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                        This returned courier order is waiting for bank transfer. Request finance approval before dispatch.
                      </div>
                    )}
                    {canTakeAction(selected) ? (
                      <>
                        <Textarea
                          value={remark}
                          onChange={(event) => setRemark(event.target.value)}
                          placeholder="Update return remark if needed..."
                          className="min-h-24"
                          disabled={saving}
                        />
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Cancel remark (required for cancel request)</label>
                          <Textarea
                            value={cancelRemark}
                            onChange={(event) => setCancelRemark(event.target.value)}
                            placeholder="Why is this return being cancelled?"
                            className="min-h-24"
                            disabled={saving}
                          />
                        </div>
                        <div className="grid gap-2">
                          {!selected.actionType && (
                            <Button onClick={() => void saveAction("rearrange")} disabled={saving} className="w-full">
                              {saving ? (
                                <>
                                  <Loader2 className="size-4 animate-spin" aria-hidden />
                                  Processing...
                                </>
                              ) : (
                                "Rearrange"
                              )}
                            </Button>
                          )}
                          {isBankTransferRearrangePending(selected) && (
                            <Button type="button" onClick={() => void saveAction("request_finance_approval")} disabled={saving} className="w-full">
                              Request Finance Approval
                            </Button>
                          )}
                          {!selected.actionType && (
                            <Button type="button" variant="destructive" onClick={() => void saveAction("request_cancel")} disabled={saving} className="w-full">
                              Request Cancel
                            </Button>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="text-muted-foreground text-sm">
                        {selected.remarkTemplate === "invoice_revert"
                          ? selected.actionStatus === "solved"
                            ? "Order has been fully voided. Credit note remains in ERP."
                            : "Finance-reverted order — use the bulk return form above to mark item returned to store and trigger void approval."
                          : selected.actionType === "cancel"
                            ? selected.actionStatus === "pending"
                              ? "Cancel request is awaiting finance. Finance will process cancellation in ERPNext."
                              : "Cancel request processed. Order voids in Cosmo OS when ERPNext posts the credit note."
                            : selected.actionType === "rearrange"
                              ? selected.actionStatus === "pending"
                                ? "Rearrange is awaiting finance approval."
                                : "This return has been rearranged."
                              : "This return is already solved."}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">No returned order selected.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
