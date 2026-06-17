"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Download, FileSpreadsheet, Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function getFilename(response: Response) {
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  return match?.[1] ?? `falcon-upload-${todayIso()}.xlsx`;
}

export function FalconUploadFulfillmentPage() {
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const [dispatchDate, setDispatchDate] = useState(todayIso());
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [countState, setCountState] = useState<{
    loading: boolean;
    totalRows: number;
    groupCount: number;
    groups: Array<{ prefix: string; rowCount: number }>;
    orders: Array<{
      id: string;
      reference: string;
      receiverName: string;
      receiverCity: string;
      receiverContact: string;
      amount: string;
      orderPrefix: string;
      itemName: string;
      courierName: string;
    }>;
    error: string | null;
  }>({ loading: true, totalRows: 0, groupCount: 0, groups: [], orders: [], error: null });
  const [lastSummary, setLastSummary] = useState<string | null>(null);

  useEffect(() => {
    setLastSummary(null);
    setSelectedOrderIds(new Set());

    if (!dispatchDate) {
      setCountState({ loading: false, totalRows: 0, groupCount: 0, groups: [], orders: [], error: "Select a dispatch date." });
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setCountState((current) => ({ ...current, loading: true, error: null }));
      const params = new URLSearchParams({
        dispatchDate,
      });

      try {
        const response = await fetch(`/api/admin/fulfillment/falcon-upload?${params.toString()}`, {
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => null)) as {
          totalRows?: number;
          groupCount?: number;
          groups?: Array<{ prefix: string; rowCount: number }>;
          orders?: Array<{
            id?: string;
            reference?: string;
            receiverName?: string;
            receiverCity?: string;
            receiverContact?: string;
            amount?: string;
            orderPrefix?: string;
            itemName?: string;
            courierName?: string;
          }>;
          error?: string;
        } | null;

        if (!response.ok) {
          setCountState({
            loading: false,
            totalRows: 0,
            groupCount: 0,
            groups: [],
            orders: [],
            error: data?.error ?? "Could not check matching orders.",
          });
          return;
        }

        setCountState({
          loading: false,
          totalRows: data?.totalRows ?? 0,
          groupCount: data?.groupCount ?? 0,
          groups: data?.groups ?? [],
          orders: (data?.orders ?? [])
            .filter((order) => order.id)
            .map((order) => ({
              id: order.id ?? "",
              reference: order.reference ?? "",
              receiverName: order.receiverName ?? "",
              receiverCity: order.receiverCity ?? "",
              receiverContact: order.receiverContact ?? "",
              amount: order.amount ?? "",
              orderPrefix: order.orderPrefix ?? "unknown",
              itemName: order.itemName ?? "",
              courierName: order.courierName ?? "",
            })),
          error: null,
        });
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setCountState({
          loading: false,
          totalRows: 0,
          groupCount: 0,
          groups: [],
          orders: [],
          error: "Could not check matching orders.",
        });
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [dispatchDate]);

  const canGenerate = useMemo(
    () => Boolean(dispatchDate) && !isGenerating && !countState.loading && selectedOrderIds.size > 0,
    [countState.loading, dispatchDate, isGenerating, selectedOrderIds.size]
  );

  const filteredOrders = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return countState.orders;
    return countState.orders.filter((order) =>
      [
        order.reference,
        order.receiverName,
        order.receiverCity,
        order.receiverContact,
        order.orderPrefix,
        order.itemName,
        order.courierName,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [countState.orders, searchTerm]);

  const selectedGroups = useMemo(() => {
    const groups = new Map<string, number>();
    for (const order of countState.orders) {
      if (!selectedOrderIds.has(order.id)) continue;
      groups.set(order.orderPrefix, (groups.get(order.orderPrefix) ?? 0) + 1);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([prefix, rowCount]) => ({ prefix, rowCount }));
  }, [countState.orders, selectedOrderIds]);

  function toggleOrder(orderId: string, checked: boolean) {
    setSelectedOrderIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(orderId);
      } else {
        next.delete(orderId);
      }
      return next;
    });
  }

  function setVisibleSelected(checked: boolean) {
    setSelectedOrderIds((current) => {
      const next = new Set(current);
      for (const order of filteredOrders) {
        if (checked) {
          next.add(order.id);
        } else {
          next.delete(order.id);
        }
      }
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsGenerating(true);
    setLastSummary(null);

    try {
      const response = await fetch("/api/admin/fulfillment/falcon-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dispatchDate,
          orderIds: Array.from(selectedOrderIds),
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        notify.error(data?.error ?? "Falcon upload file generation failed.");
        return;
      }

      const totalRows = response.headers.get("X-Total-Rows") ?? "0";
      const groupCount = response.headers.get("X-Group-Count") ?? "0";
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = getFilename(response);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      const summary = `${totalRows} WayBill rows exported into ${groupCount} prefix file${groupCount === "1" ? "" : "s"}.`;
      setLastSummary(summary);
      notify.success(summary);
    } catch {
      notify.error("Falcon upload file generation failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <FileSpreadsheet className="size-6 text-muted-foreground" aria-hidden />
          Falcon Upload
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {isVaultOsDeployment()
            ? "Search and select City Pack dispatched orders, then generate one Falcon workbook per company prefix (100, 200, 300)."
            : "Search and select City Pack dispatched orders, then generate one Falcon workbook per order-series prefix (100–900)."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-md border border-border/70 bg-background p-4 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="space-y-2 text-sm">
            <span className="font-medium">Dispatch date</span>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={dateInputRef}
                type="date"
                value={dispatchDate}
                onChange={(event) => setDispatchDate(event.target.value)}
                onClick={() => dateInputRef.current?.showPicker?.()}
                onFocus={() => dateInputRef.current?.showPicker?.()}
                className="h-11 min-w-[240px] pl-9"
              />
            </div>
          </label>

          <Button type="submit" disabled={!canGenerate} className="h-11 w-full gap-2 lg:w-auto">
            {isGenerating ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Download className="size-4" aria-hidden />
            )}
            Generate
          </Button>
        </div>
      </form>

      <div className="space-y-3 rounded-md border border-border/70 bg-background p-4 shadow-xs">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-medium">City Pack dispatched orders</p>
            <p className="text-sm text-muted-foreground">
              {selectedOrderIds.size} selected from {countState.totalRows} orders.
            </p>
          </div>
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search order, name, phone, city..."
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={filteredOrders.length === 0}
            onClick={() => setVisibleSelected(true)}
            className="border-border/70 bg-background/85 hover:bg-secondary/10"
          >
            Select Visible
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={filteredOrders.length === 0}
            onClick={() => setVisibleSelected(false)}
            className="border-border/70 bg-background/85 hover:bg-secondary/10"
          >
            Clear Visible
          </Button>
        </div>

        <div className="overflow-hidden rounded-md border border-border/70">
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/70 backdrop-blur">
                <tr className="border-b border-border/70">
                  <th className="w-12 px-3 py-2 text-left font-medium">Pick</th>
                  <th className="px-3 py-2 text-left font-medium">Order</th>
                  <th className="px-3 py-2 text-left font-medium">Courier</th>
                  <th className="px-3 py-2 text-left font-medium">Prefix</th>
                  <th className="px-3 py-2 text-left font-medium">Receiver</th>
                  <th className="px-3 py-2 text-left font-medium">City</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const isSelected = selectedOrderIds.has(order.id);

                  return (
                  <tr
                    key={order.id}
                    tabIndex={0}
                    role="checkbox"
                    aria-checked={isSelected}
                    className="cursor-pointer border-b border-border/50 outline-none transition-colors last:border-0 hover:bg-muted/40 focus-visible:bg-muted/50"
                    onClick={() => toggleOrder(order.id, !isSelected)}
                    onKeyDown={(event) => {
                      if (event.key === " " || event.key === "Enter") {
                        event.preventDefault();
                        toggleOrder(order.id, !isSelected);
                      }
                    }}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(event) => toggleOrder(order.id, event.target.checked)}
                        onClick={(event) => event.stopPropagation()}
                        className="size-4 rounded border-border"
                        aria-label={`Select order ${order.reference}`}
                      />
                    </td>
                    <td className="px-3 py-2 font-medium">{order.reference}</td>
                    <td className="px-3 py-2 text-muted-foreground">{order.courierName || "-"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{order.orderPrefix}</td>
                    <td className="px-3 py-2">{order.receiverName || "-"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{order.receiverCity || "-"}</td>
                    <td className="px-3 py-2 text-right">{order.amount || "0"}</td>
                  </tr>
                  );
                })}
                {!countState.loading && filteredOrders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                      {countState.totalRows === 0 ? "No courier-dispatched orders found for this date." : "No orders match the search."}
                    </td>
                  </tr>
                )}
                {countState.loading && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                      Loading City Pack orders...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
        {lastSummary ??
          (countState.loading
            ? "Checking City Pack dispatched orders..."
            : countState.error
              ? countState.error
              : selectedOrderIds.size > 0
                ? `${selectedOrderIds.size} selected order${selectedOrderIds.size === 1 ? "" : "s"} will export into ${selectedGroups.length} prefix file${selectedGroups.length === 1 ? "" : "s"}: ${selectedGroups.map((group) => `${group.prefix} (${group.rowCount})`).join(", ")}.`
                : countState.totalRows > 0
                  ? `Select one or more orders to generate. Available groups: ${countState.groups.map((group) => `${group.prefix} (${group.rowCount})`).join(", ")}.`
                : "No City Pack dispatched orders found for this date.")}
      </div>
    </div>
  );
}
