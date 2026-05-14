"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Search, X } from "lucide-react";

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

type BulkReturnRow = {
  input: string;
  status:
    | "valid"
    | "not_found"
    | "duplicate_input"
    | "not_dispatched"
    | "missing_dispatch_date"
    | "ambiguous_match"
    | "processed"
    | "failed";
  message: string;
  orderId: string | null;
  invoiceNo: string | null;
  merchant: string | null;
  customer: string | null;
  shippingService: string | null;
  dispatchedAt: string | null;
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

function formatDateTime(value?: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString("en-LK");
}

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

export function ReturnedOrdersPanel({ initialData }: { initialData: ReturnsTrackingData }) {
  const [items, setItems] = useState(initialData.returns);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"__all" | ReturnTrackingItem["actionStatus"]>("pending");
  const [selectedId, setSelectedId] = useState(initialData.returns[0]?.id ?? "");
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const [remark, setRemark] = useState(selected?.actionRemark ?? "");
  const [saving, setSaving] = useState(false);
  const [returnDate, setReturnDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [bulkOrderOpen, setBulkOrderOpen] = useState(false);
  const [bulkOrderSearch, setBulkOrderSearch] = useState("");
  const [bulkOrderOptions, setBulkOrderOptions] = useState<BulkOrderOption[]>([]);
  const [selectedBulkOrders, setSelectedBulkOrders] = useState<BulkOrderOption[]>([]);
  const [bulkOrderLoading, setBulkOrderLoading] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkReturnRow[]>([]);
  const [bulkCounts, setBulkCounts] = useState<BulkReturnResponse["counts"] | null>(null);
  const [bulkBusyKey, setBulkBusyKey] = useState<"preview" | "confirm" | null>(null);

  const selectedBulkReferences = useMemo(
    () =>
      selectedBulkOrders
        .map((order) => order.name ?? order.orderNumber ?? "")
        .filter(Boolean),
    [selectedBulkOrders]
  );

  const combinedBulkReferences = useMemo(() => selectedBulkReferences.join("\n"), [selectedBulkReferences]);

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
        item.merchant?.name,
        item.merchant?.email,
        item.shippingService,
        item.actionRemark,
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
    setRemark(item.actionRemark ?? "");
  }

  function resetBulkPreview() {
    setBulkRows([]);
    setBulkCounts(null);
  }

  function addBulkOrder(order: BulkOrderOption) {
    setSelectedBulkOrders((current) =>
      current.some((item) => item.id === order.id) ? current : [...current, order]
    );
    resetBulkPreview();
    setBulkOrderOpen(false);
    setBulkOrderSearch("");
  }

  function removeBulkOrder(orderId: string) {
    setSelectedBulkOrders((current) => current.filter((order) => order.id !== orderId));
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

  async function saveAction(actionType: "save" | "rearrange" | "request_finance_approval" = "save") {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/returns/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionStatus: "solved",
          actionRemark: remark.trim() || null,
          actionType,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        returnedOrder?: Pick<ReturnTrackingItem, "id" | "actionStatus" | "actionRemark" | "actionDate" | "actionType">;
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
      setItems((current) =>
        current.map((item) =>
          item.id === selected.id && data.returnedOrder
            ? {
                ...item,
                ...data.returnedOrder,
                financialStatus: data.order?.financialStatus ?? item.financialStatus,
                paymentGatewayPrimary: data.order?.paymentGatewayPrimary ?? item.paymentGatewayPrimary,
                paymentGatewayNames: data.order?.paymentGatewayPrimary
                  ? [data.order.paymentGatewayPrimary]
                  : item.paymentGatewayNames,
              }
            : item
        )
      );
      if (actionType === "request_finance_approval") {
        notify.success("Finance approval requested.");
      } else if (data.order?.requiresBankTransferBeforeRearrange) {
        notify.success("Bank transfer required before rearrange. Order kept out of dispatch.");
      } else if (actionType === "rearrange") {
        notify.success("Rearrange action saved.");
      } else {
        notify.success("Return action saved");
      }
    } catch {
      notify.error("Failed to save return action");
    } finally {
      setSaving(false);
    }
  }

  async function runBulkReturn(action: "preview" | "confirm") {
    if (!combinedBulkReferences.trim()) {
      notify.error("Add at least one invoice/order number");
      return;
    }
    if (!returnDate) {
      notify.error("Select return date");
      return;
    }

    setBulkBusyKey(action);
    try {
      const res = await fetch("/api/admin/orders/bulk-return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, references: combinedBulkReferences, returnDate }),
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
            <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)_auto_auto] lg:items-end">
              <div className="space-y-2">
                <label className="text-sm font-medium">Return date</label>
                <Input
                  type="date"
                  value={returnDate}
                  onChange={(event) => setReturnDate(event.target.value)}
                  disabled={bulkBusyKey !== null}
                />
              </div>
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
                {selectedBulkOrders.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedBulkOrders([]);
                        resetBulkPreview();
                      }}
                      disabled={bulkBusyKey !== null}
                      className="h-8"
                    >
                      Clear All
                    </Button>
                    {selectedBulkOrders.map((order) => (
                      <span
                        key={order.id}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-border/70 bg-muted/50 px-2 text-xs"
                      >
                        {bulkOrderLabel(order)}
                        <button
                          type="button"
                          onClick={() => removeBulkOrder(order.id)}
                          className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                          disabled={bulkBusyKey !== null}
                          aria-label={`Remove ${bulkOrderLabel(order)}`}
                        >
                          <X className="size-3" aria-hidden />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void runBulkReturn("preview")}
                disabled={bulkBusyKey !== null || !combinedBulkReferences.trim() || !returnDate}
                className="gap-2"
              >
                {bulkBusyKey === "preview" ? "Previewing..." : "Preview"}
              </Button>
              <Button
                type="button"
                onClick={() => void runBulkReturn("confirm")}
                disabled={
                  bulkBusyKey !== null ||
                  !returnDate ||
                  !bulkRows.some((row) => row.status === "valid" && row.orderId)
                }
              >
                {bulkBusyKey === "confirm" ? "Confirming..." : "Confirm Valid"}
              </Button>
            </div>

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
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-muted/40">
                    <tr className="border-b border-border/70">
                      <th className="px-3 py-2 text-left font-medium">Input</th>
                      <th className="px-3 py-2 text-left font-medium">Invoice</th>
                      <th className="px-3 py-2 text-left font-medium">Merchant</th>
                      <th className="px-3 py-2 text-left font-medium">Customer</th>
                      <th className="px-3 py-2 text-left font-medium">Service</th>
                      <th className="px-3 py-2 text-left font-medium">Dispatch Date</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkRows.map((row, index) => (
                      <tr key={`${row.input}-${index}`} className="border-b border-border/50 last:border-0">
                        <td className="px-3 py-2 font-medium">{row.input}</td>
                        <td className="px-3 py-2">{row.invoiceNo ?? "-"}</td>
                        <td className="px-3 py-2">{row.merchant ?? "-"}</td>
                        <td className="px-3 py-2">{row.customer ?? "-"}</td>
                        <td className="px-3 py-2">{row.shippingService ?? "-"}</td>
                        <td className="px-3 py-2">{formatDateOnly(row.dispatchedAt)}</td>
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
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search invoice, merchant, customer, phone..." className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
              <SelectTrigger className="w-full lg:w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="solved">Solved</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="overflow-x-auto rounded-md border border-border/70">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-muted/30">
                  <tr className="border-b">
                    <th className="px-3 py-3 text-left">Invoice No</th>
                    <th className="px-3 py-3 text-left">Merchant</th>
                    <th className="px-3 py-3 text-left">Shipping Service</th>
                    <th className="px-3 py-3 text-left">Dispatch Date</th>
                    <th className="px-3 py-3 text-left">Return Date</th>
                    <th className="px-3 py-3 text-right">Day Count</th>
                    <th className="px-3 py-3 text-left">Action Date</th>
                    <th className="px-3 py-3 text-left">Remark</th>
                    <th className="px-3 py-3 text-left">Type</th>
                    <th className="px-3 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.id} onClick={() => selectItem(item)} className={`cursor-pointer border-b last:border-0 hover:bg-secondary/10 ${selectedId === item.id ? "bg-primary/8" : ""}`}>
                      <td className="px-3 py-3 font-medium">{item.invoiceNo}</td>
                      <td className="px-3 py-3">{item.merchant?.name ?? item.merchant?.email ?? "Unassigned"}</td>
                      <td className="px-3 py-3">{item.shippingService}</td>
                      <td className="px-3 py-3">{formatDateOnly(item.dispatchedAt)}</td>
                      <td className="px-3 py-3">{formatDateOnly(item.returnDate)}</td>
                      <td className="px-3 py-3 text-right">{item.dayCount}</td>
                      <td className="px-3 py-3">{formatDateTime(item.actionDate)}</td>
                      <td className="max-w-[220px] truncate px-3 py-3">{item.actionRemark ?? "-"}</td>
                      <td className="px-3 py-3">
                        {item.actionType === "rearrange" ? (
                          <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${
                            isBankTransferRearrangePending(item)
                              ? "border-amber-500/30 bg-amber-500/10 text-amber-700"
                              : "border-sky-500/30 bg-sky-500/10 text-sky-700"
                          }`}>
                            {isBankTransferRearrangePending(item) ? "Awaiting Bank Transfer" : "Rearranged"}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-3 py-3">{item.actionStatus === "solved" ? "Solved" : "Pending"}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={10} className="px-3 py-10 text-center text-muted-foreground">No returned orders found.</td></tr>
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
                      <div className="mt-1 text-muted-foreground">
                        Payment: {paymentLabel(selected)}
                      </div>
                    </div>
                    {isBankTransferRearrangePending(selected) && (
                      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                        This returned COD order is waiting for bank transfer. Do not dispatch until payment is confirmed.
                      </div>
                    )}
                    <Textarea value={remark} onChange={(event) => setRemark(event.target.value)} placeholder="Cancel order, customer wants callback, no response, wrong number..." className="min-h-32" />
                    <div className="grid gap-2">
                      <Button onClick={() => void saveAction()} disabled={saving} className="w-full">{saving ? "Saving..." : "Save Return Action"}</Button>
                      {isBankTransferRearrangePending(selected) && (
                        <Button
                          type="button"
                          onClick={() => void saveAction("request_finance_approval")}
                          disabled={saving}
                          className="w-full"
                        >
                          Request Finance Approval
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void saveAction("rearrange")}
                        disabled={saving}
                        className="w-full"
                      >
                        Mark as Rearrange
                      </Button>
                    </div>
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
