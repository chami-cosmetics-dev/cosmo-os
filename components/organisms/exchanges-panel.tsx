"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Search } from "lucide-react";

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
import type { ExchangeReason, ExchangesTrackingData, ExchangeStatus, ExchangeTrackingItem } from "@/lib/page-data/order-exchanges";

type ExchangeRefStatus = {
  status: "empty" | "found" | "not_found" | "ambiguous";
  reference: string;
  order: {
    id: string;
    invoiceNo: string;
    customer: string | null;
    merchant: string | null;
  } | null;
};

type OrderOption = {
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

function reasonLabel(reason: ExchangeReason) {
  if (reason === "damaged_item") return "Damaged item";
  if (reason === "wrong_item") return "Wrong item";
  return "Other";
}

function collectionLabel(item: ExchangeTrackingItem) {
  if (!item.requiresOldItemCollection) return "Not required";
  if (item.oldItemCollectionStatus === "collected") return "Old order collected";
  if (item.oldItemCollectionStatus === "not_collected") return "Not collected";
  return "Pending collection";
}

function paymentDifferenceLabel(value: string | null) {
  if (!value) return "Not calculated";
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount === 0) return "No difference";
  return amount > 0
    ? `Collect extra Rs. ${amount.toFixed(2)}`
    : `Give change/refund Rs. ${Math.abs(amount).toFixed(2)}`;
}

export function ExchangesPanel({ initialData }: { initialData: ExchangesTrackingData }) {
  const [items, setItems] = useState(initialData.exchanges);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"__all" | ExchangeStatus>("__all");
  const [selectedId, setSelectedId] = useState(initialData.exchanges[0]?.id ?? "");
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const [status, setStatus] = useState<ExchangeStatus>(selected?.status ?? "pending");
  const [remark, setRemark] = useState(selected?.remark ?? "");
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    originalReference: "",
    replacementReference: "",
    reason: "damaged_item" as ExchangeReason,
    remark: "",
  });
  const [refCheck, setRefCheck] = useState<{
    original: ExchangeRefStatus;
    replacement: ExchangeRefStatus;
  } | null>(null);
  const [checkingRefs, setCheckingRefs] = useState(false);
  const [originalOpen, setOriginalOpen] = useState(false);
  const [replacementOpen, setReplacementOpen] = useState(false);
  const [originalSearch, setOriginalSearch] = useState("");
  const [replacementSearch, setReplacementSearch] = useState("");
  const [originalOptions, setOriginalOptions] = useState<OrderOption[]>([]);
  const [replacementOptions, setReplacementOptions] = useState<OrderOption[]>([]);
  const [originalLoading, setOriginalLoading] = useState(false);
  const [replacementLoading, setReplacementLoading] = useState(false);

  const counts = useMemo(
    () =>
      items.reduce(
        (acc, item) => {
          acc.all += 1;
          if (item.status === "solved") acc.solved += 1;
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
      if (statusFilter !== "__all" && item.status !== statusFilter) return false;
      if (!query) return true;
      return [
        item.originalReference,
        item.replacementReference,
        item.customerName,
        item.customerEmail,
        item.customerPhone,
        item.merchant?.name,
        item.merchant?.email,
        item.remark,
        reasonLabel(item.reason),
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query));
    });
  }, [items, search, statusFilter]);

  useEffect(() => {
    const originalReference = form.originalReference.trim();
    const replacementReference = form.replacementReference.trim();
    if (!originalReference && !replacementReference) {
      setRefCheck(null);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setCheckingRefs(true);
      try {
        const params = new URLSearchParams();
        params.set("originalReference", originalReference);
        params.set("replacementReference", replacementReference);
        const res = await fetch(`/api/admin/exchanges?${params}`);
        if (!res.ok) {
          if (!cancelled) setRefCheck(null);
          return;
        }
        const data = (await res.json()) as {
          original: ExchangeRefStatus;
          replacement: ExchangeRefStatus;
        };
        if (!cancelled) setRefCheck(data);
      } catch {
        if (!cancelled) setRefCheck(null);
      } finally {
        if (!cancelled) setCheckingRefs(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [form.originalReference, form.replacementReference]);

  const originalIsValid = refCheck?.original.status === "found";
  const replacementIsAmbiguous = refCheck?.replacement.status === "ambiguous";

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setOriginalLoading(true);
      try {
        const orders = await fetchOrderOptions(originalSearch);
        if (!cancelled) setOriginalOptions(orders);
      } finally {
        if (!cancelled) setOriginalLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [originalSearch]);

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setReplacementLoading(true);
      try {
        const orders = await fetchOrderOptions(replacementSearch);
        if (!cancelled) setReplacementOptions(orders);
      } finally {
        if (!cancelled) setReplacementLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [replacementSearch]);

  function selectItem(item: ExchangeTrackingItem) {
    setSelectedId(item.id);
    setStatus(item.status);
    setRemark(item.remark ?? "");
  }

  async function fetchOrderOptions(query: string) {
    try {
      const params = new URLSearchParams({
        page: "1",
        limit: "20",
      });
      if (query.trim()) params.set("search", query.trim());
      const res = await fetch(`/api/admin/orders/page-data?${params}`);
      if (!res.ok) return [];
      const data = (await res.json()) as { orders?: OrderOption[] };
      return data.orders ?? [];
    } catch {
      return [];
    }
  }

  function orderLabel(order: OrderOption) {
    return order.name ?? order.orderNumber ?? order.id;
  }

  function selectOriginalOrder(order: OrderOption) {
    setForm((current) => ({ ...current, originalReference: orderLabel(order) }));
    setOriginalOpen(false);
    setOriginalSearch("");
  }

  function selectReplacementOrder(order: OrderOption) {
    setForm((current) => ({ ...current, replacementReference: orderLabel(order) }));
    setReplacementOpen(false);
    setReplacementSearch("");
  }

  async function createExchange() {
    if (!form.originalReference.trim() || !form.replacementReference.trim()) {
      notify.error("Original and replacement references are required");
      return;
    }
    if (!originalIsValid) {
      notify.error("Original invoice/order must exist in the system");
      return;
    }
    if (replacementIsAmbiguous) {
      notify.error("Replacement invoice/order matched more than one order");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/exchanges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalReference: form.originalReference,
          replacementReference: form.replacementReference,
          reason: form.reason,
          remark: form.remark.trim() || null,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to create exchange");
        return;
      }
      notify.success("Exchange created. Refreshing page data...");
      window.location.reload();
    } catch {
      notify.error("Failed to create exchange");
    } finally {
      setCreating(false);
    }
  }

  function refStatusText(status?: ExchangeRefStatus, kind?: "original" | "replacement") {
    if (!status || status.status === "empty") return null;
    if (status.status === "found") {
      return `Found: ${status.order?.invoiceNo ?? status.reference}${status.order?.customer ? ` | ${status.order.customer}` : ""}`;
    }
    if (status.status === "ambiguous") return "More than one order matched. Use the full invoice/order number.";
    return kind === "replacement"
      ? "Not found. It will be saved as a plain replacement reference."
      : "Not found. Original order must exist.";
  }

  function refStatusClass(status?: ExchangeRefStatus) {
    if (!status || status.status === "empty") return "text-muted-foreground";
    if (status.status === "found") return "text-emerald-600";
    if (status.status === "not_found") return "text-amber-600";
    return "text-rose-600";
  }

  async function saveExchange() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/exchanges/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, remark: remark.trim() || null }),
      });
      const data = (await res.json()) as {
        error?: string;
        exchange?: Pick<ExchangeTrackingItem, "id" | "status" | "remark" | "actionDate">;
      };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to save exchange");
        return;
      }
      setItems((current) =>
        current.map((item) =>
          item.id === selected.id && data.exchange ? { ...item, ...data.exchange } : item
        )
      );
      notify.success("Exchange saved");
    } catch {
      notify.error("Failed to save exchange");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-muted-foreground text-xs uppercase">Exchanges</p><p className="text-2xl font-semibold">{counts.all}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-muted-foreground text-xs uppercase">Pending</p><p className="text-2xl font-semibold">{counts.pending}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-muted-foreground text-xs uppercase">Solved</p><p className="text-2xl font-semibold">{counts.solved}</p></CardContent></Card>
      </div>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Create Exchange</CardTitle>
          <CardDescription>Track replacement orders without creating a new order automatically.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-[1fr_1fr_180px]">
          <div className="space-y-1">
            <Popover open={originalOpen} onOpenChange={setOriginalOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" role="combobox" className="h-11 w-full justify-between border-border/70 bg-background text-left font-normal">
                  {form.originalReference || "Select original invoice/order"}
                  <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[min(640px,calc(100vw-2rem))] border-border/70 p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput placeholder="Search original invoice..." value={originalSearch} onValueChange={setOriginalSearch} />
                  <CommandList>
                    <CommandEmpty>{originalLoading ? "Loading orders..." : "No order found."}</CommandEmpty>
                    <CommandGroup>
                      {originalLoading && (
                        <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                          Loading...
                        </div>
                      )}
                      {originalOptions.map((order) => (
                        <CommandItem key={order.id} value={orderLabel(order)} onSelect={() => selectOriginalOrder(order)} className="flex items-center justify-between gap-3">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{orderLabel(order)}</span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {order.assignedMerchant?.name ?? order.assignedMerchant?.email ?? "No merchant"}
                              {" | "}
                              {order.customerPhone ?? order.customerEmail ?? "No customer contact"}
                            </span>
                          </span>
                          {form.originalReference === orderLabel(order) && <Check className="size-4" aria-hidden />}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {refStatusText(refCheck?.original, "original") && (
              <p className={`text-xs ${refStatusClass(refCheck?.original)}`}>
                {refStatusText(refCheck?.original, "original")}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Popover open={replacementOpen} onOpenChange={setReplacementOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" role="combobox" className="h-11 w-full justify-between border-border/70 bg-background text-left font-normal">
                  {form.replacementReference || "Select replacement invoice/order"}
                  <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[min(640px,calc(100vw-2rem))] border-border/70 p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput placeholder="Search replacement invoice..." value={replacementSearch} onValueChange={setReplacementSearch} />
                  <CommandList>
                    <CommandEmpty>{replacementLoading ? "Loading orders..." : "No order found."}</CommandEmpty>
                    <CommandGroup>
                      {replacementLoading && (
                        <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                          Loading...
                        </div>
                      )}
                      {replacementOptions.map((order) => (
                        <CommandItem key={order.id} value={orderLabel(order)} onSelect={() => selectReplacementOrder(order)} className="flex items-center justify-between gap-3">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{orderLabel(order)}</span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {order.assignedMerchant?.name ?? order.assignedMerchant?.email ?? "No merchant"}
                              {" | "}
                              {order.customerPhone ?? order.customerEmail ?? "No customer contact"}
                            </span>
                          </span>
                          {form.replacementReference === orderLabel(order) && <Check className="size-4" aria-hidden />}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Input value={form.replacementReference} onChange={(event) => setForm((current) => ({ ...current, replacementReference: event.target.value }))} placeholder="Or enter replacement ref not in system yet" />
            {refStatusText(refCheck?.replacement, "replacement") && (
              <p className={`text-xs ${refStatusClass(refCheck?.replacement)}`}>
                {refStatusText(refCheck?.replacement, "replacement")}
              </p>
            )}
          </div>
          <Select value={form.reason} onValueChange={(value) => setForm((current) => ({ ...current, reason: value as ExchangeReason }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="damaged_item">Damaged item</SelectItem>
              <SelectItem value="wrong_item">Wrong item</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          <Textarea value={form.remark} onChange={(event) => setForm((current) => ({ ...current, remark: event.target.value }))} placeholder="Initial remark" className="lg:col-span-2" />
          <Button onClick={() => void createExchange()} disabled={creating || checkingRefs || !originalIsValid || replacementIsAmbiguous}>
            {creating ? "Creating..." : checkingRefs ? "Checking..." : "Create Exchange"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Exchanges</CardTitle>
          <CardDescription>Original and replacement order tracking for damaged or wrong-item cases.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search original, replacement, merchant, customer..." className="pl-9" />
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
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-muted/30">
                  <tr className="border-b">
                    <th className="px-3 py-3 text-left">Original</th>
                    <th className="px-3 py-3 text-left">Replacement</th>
                    <th className="px-3 py-3 text-left">Reason</th>
                    <th className="px-3 py-3 text-left">Merchant</th>
                    <th className="px-3 py-3 text-left">Customer</th>
                    <th className="px-3 py-3 text-left">Old Order</th>
                    <th className="px-3 py-3 text-left">Payment Diff.</th>
                    <th className="px-3 py-3 text-left">Created</th>
                    <th className="px-3 py-3 text-left">Action Date</th>
                    <th className="px-3 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.id} onClick={() => selectItem(item)} className={`cursor-pointer border-b last:border-0 hover:bg-secondary/10 ${selectedId === item.id ? "bg-primary/8" : ""}`}>
                      <td className="px-3 py-3 font-medium">{item.originalReference}</td>
                      <td className="px-3 py-3">{item.replacementReference}</td>
                      <td className="px-3 py-3">{reasonLabel(item.reason)}</td>
                      <td className="px-3 py-3">{item.merchant?.name ?? item.merchant?.email ?? "Unassigned"}</td>
                      <td className="px-3 py-3">{item.customerName ?? item.customerPhone ?? "-"}</td>
                      <td className="px-3 py-3">
                        <span className={item.requiresOldItemCollection ? "font-medium text-amber-700" : "text-muted-foreground"}>
                          {collectionLabel(item)}
                        </span>
                        {item.oldItemCollectionRemark && (
                          <div className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground">
                            {item.oldItemCollectionRemark}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">{paymentDifferenceLabel(item.exchangePaymentDifference)}</td>
                      <td className="px-3 py-3">{formatDateTime(item.createdAt)}</td>
                      <td className="px-3 py-3">{formatDateTime(item.actionDate)}</td>
                      <td className="px-3 py-3">{item.status === "solved" ? "Solved" : "Pending"}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={10} className="px-3 py-10 text-center text-muted-foreground">No exchanges found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <Card className="border-border/70">
              <CardHeader>
                <CardTitle>Exchange Action</CardTitle>
                <CardDescription>{selected ? `${selected.originalReference} -> ${selected.replacementReference}` : "Select an exchange"}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {selected ? (
                  <>
                    <Select value={status} onValueChange={(value) => setStatus(value as ExchangeStatus)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="solved">Solved</SelectItem>
                      </SelectContent>
                    </Select>
                    <Textarea value={remark} onChange={(event) => setRemark(event.target.value)} placeholder="Exchange follow-up remark..." className="min-h-32" />
                    <div className="rounded-md border border-border/70 p-3 text-sm">
                      <p className="font-medium">{collectionLabel(selected)}</p>
                      <p className="mt-1 text-muted-foreground">
                        {paymentDifferenceLabel(selected.exchangePaymentDifference)}
                      </p>
                      {selected.oldItemCollectionRemark && (
                        <p className="mt-2 text-xs text-muted-foreground">{selected.oldItemCollectionRemark}</p>
                      )}
                    </div>
                    <Button onClick={() => void saveExchange()} disabled={saving} className="w-full">{saving ? "Saving..." : "Save Exchange"}</Button>
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">No exchange selected.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
