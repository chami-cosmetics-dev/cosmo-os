"use client";

import { useMemo, useRef, useState } from "react";
import { CalendarDays, Download, Printer } from "lucide-react";

import { TableSkeleton } from "@/components/skeletons/table-skeleton";
import { StaffManagementPanel, type StaffManagementPanelInitialData } from "@/components/organisms/staff-management-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { notify } from "@/lib/notify";
import { formatAppDateTime } from "@/lib/format-datetime";

type RiderRosterItem = {
  id: string;
  name: string | null;
  knownName: string | null;
  email: string | null;
  mobile: string | null;
  status: string | null;
  locationName: string | null;
};

type RiderOrdersData = {
  rider: RiderRosterItem | null;
  rows: Array<{
    taskId: string;
    orderId: string;
    orderLabel: string;
    orderNumber: string | null;
    shopifyOrderId: string;
    status: string;
    customerName: string | null;
    customerPhone: string | null;
    locationName: string | null;
    assignedAt: string;
    acceptedAt: string | null;
    arrivedAt: string | null;
    completedAt: string | null;
    failedAt: string | null;
    expectedAmount: string;
    collectedAmount: string | null;
    paymentMethod: string | null;
    collectionStatus: string | null;
  }>;
  statusSummary: {
    total: number;
    assigned: number;
    inProgress: number;
    completed: number;
    failed: number;
  };
  locationSummary: Array<{
    locationName: string;
    orderCount: number;
    cashTotal: string;
    bankTransferTotal: string;
    cardTotal: string;
    alreadyPaidTotal: string;
    collectedTotal: string;
  }>;
};

const APP_TIME_ZONE = "Asia/Colombo";

function getTodayDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getRelativeDateLabel(value: string | null | undefined) {
  if (!value) return "Select date";

  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  const todayKey = getTodayDateKey();
  const todayStart = new Date(`${todayKey}T00:00:00`);
  const targetStart = new Date(`${value}T00:00:00`);
  const diffDays = Math.round((todayStart.getTime() - targetStart.getTime()) / 86400000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: APP_TIME_ZONE,
  });
}

interface RiderOperationsPanelProps {
  canManageStaff: boolean;
  initialDirectoryData: StaffManagementPanelInitialData;
  riderRoster: RiderRosterItem[];
  initialOrdersData: RiderOrdersData | null;
}

function formatMoney(value: string | null | undefined) {
  const amount = Number.parseFloat(value ?? "0");
  const formatted = Number.isFinite(amount)
    ? amount.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0.00";
  return `Rs. ${formatted}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) return "--";

  const dateKey = `${year}-${month}-${day}`;
  const todayKey = getTodayDateKey();
  const todayStart = new Date(`${todayKey}T00:00:00`);
  const targetStart = new Date(`${dateKey}T00:00:00`);
  const diffDays = Math.round((todayStart.getTime() - targetStart.getTime()) / 86400000);

  const timeLabel = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: APP_TIME_ZONE,
  });

  if (diffDays === 0) return `Today, ${timeLabel}`;

  const shortDate = date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    timeZone: APP_TIME_ZONE,
  });

  if (diffDays === 1) return `Yesterday, ${shortDate}, ${timeLabel}`;

  return `${shortDate}, ${timeLabel}`;
}

function getOrderDateKey(row: RiderOrdersData["rows"][number]) {
  const value = row.completedAt ?? row.failedAt ?? row.assignedAt;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-CA", { timeZone: APP_TIME_ZONE });
}

function toAmount(value: string | null | undefined) {
  const parsed = Number.parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function riderLabel(rider: RiderRosterItem) {
  return rider.knownName?.trim() || rider.name?.trim() || rider.email || rider.mobile || "Rider";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function csvEscape(value: string | null | undefined) {
  const safe = value ?? "";
  return `"${safe.replaceAll('"', '""')}"`;
}

export function RiderOperationsPanel({
  canManageStaff,
  initialDirectoryData,
  riderRoster,
  initialOrdersData,
}: RiderOperationsPanelProps) {
  const defaultDateKey = getTodayDateKey();
  const fromDateInputRef = useRef<HTMLInputElement | null>(null);
  const toDateInputRef = useRef<HTMLInputElement | null>(null);
  const [activeTab, setActiveTab] = useState<"directory" | "orders">("orders");
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(initialOrdersData?.rider?.id ?? riderRoster[0]?.id ?? null);
  const [ordersData, setOrdersData] = useState<RiderOrdersData | null>(initialOrdersData);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [fromDate, setFromDate] = useState(defaultDateKey);
  const [toDate, setToDate] = useState(defaultDateKey);
  const [locationFilter, setLocationFilter] = useState("all");

  function openDatePicker(input: HTMLInputElement | null) {
    if (!input) return;
    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
    if (typeof pickerInput.showPicker === "function") {
      pickerInput.showPicker();
      return;
    }
    pickerInput.focus();
    pickerInput.click();
  }

  async function loadRiderOrders(riderId: string) {
    setSelectedRiderId(riderId);
    setFromDate(defaultDateKey);
    setToDate(defaultDateKey);
    setLocationFilter("all");
    setLoadingOrders(true);
    try {
      const response = await fetch(`/api/admin/riders/${riderId}/orders`);
      const data = (await response.json()) as RiderOrdersData & { error?: string };
      if (!response.ok) {
        notify.error(data.error ?? "Failed to load rider orders");
        return;
      }
      setOrdersData(data);
    } catch {
      notify.error("Failed to load rider orders");
    } finally {
      setLoadingOrders(false);
    }
  }

  const selectedRider = useMemo(
    () => riderRoster.find((rider) => rider.id === selectedRiderId) ?? null,
    [riderRoster, selectedRiderId]
  );

  const locationOptions = useMemo(() => {
    const options = new Set<string>();
    for (const row of ordersData?.rows ?? []) {
      options.add(row.locationName ?? "Unknown location");
    }
    return [...options].sort((a, b) => a.localeCompare(b));
  }, [ordersData]);

  const filteredRows = useMemo(() => {
    return (ordersData?.rows ?? []).filter((row) => {
      const rowLocation = row.locationName ?? "Unknown location";
      if (locationFilter !== "all" && rowLocation !== locationFilter) return false;

      const dateKey = getOrderDateKey(row);
      if (fromDate && (!dateKey || dateKey < fromDate)) return false;
      if (toDate && (!dateKey || dateKey > toDate)) return false;
      return true;
    });
  }, [fromDate, locationFilter, ordersData, toDate]);

  const filteredStatusSummary = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        const status = row.status.toLowerCase();
        acc.total += 1;
        if (status === "assigned") acc.assigned += 1;
        if (status === "completed") acc.completed += 1;
        if (status === "failed") acc.failed += 1;
        if (status === "accepted" || status === "arrived") acc.inProgress += 1;
        return acc;
      },
      { total: 0, assigned: 0, inProgress: 0, completed: 0, failed: 0 }
    );
  }, [filteredRows]);

  const filteredLocationSummary = useMemo(() => {
    const totals = new Map<
      string,
      {
        locationName: string;
        orderCount: number;
        cashTotal: number;
        bankTransferTotal: number;
        cardTotal: number;
        alreadyPaidTotal: number;
        collectedTotal: number;
      }
    >();

    for (const row of filteredRows) {
      const locationName = row.locationName ?? "Unknown location";
      const paymentMethod = (row.paymentMethod ?? "").toLowerCase();
      const amount = toAmount(row.collectedAmount ?? row.expectedAmount);
      const current = totals.get(locationName) ?? {
        locationName,
        orderCount: 0,
        cashTotal: 0,
        bankTransferTotal: 0,
        cardTotal: 0,
        alreadyPaidTotal: 0,
        collectedTotal: 0,
      };

      current.orderCount += 1;
      current.collectedTotal += amount;
      if (paymentMethod === "cod") current.cashTotal += amount;
      if (paymentMethod === "bank_transfer") current.bankTransferTotal += amount;
      if (paymentMethod === "card") current.cardTotal += amount;
      if (paymentMethod === "already_paid") current.alreadyPaidTotal += amount;

      totals.set(locationName, current);
    }

    return [...totals.values()].sort((a, b) => a.locationName.localeCompare(b.locationName));
  }, [filteredRows]);

  function exportCsv() {
    if (!ordersData?.rider) {
      notify.error("Select a rider first");
      return;
    }
    if (filteredRows.length === 0) {
      notify.error("No rows match the selected filters");
      return;
    }

    const header = [
      "Order Label",
      "Order Number",
      "Status",
      "Customer",
      "Phone",
      "Location",
      "Assigned At",
      "Completed At",
      "Expected Amount",
      "Collected Amount",
      "Payment Method",
      "Collection Status",
    ];

    const lines = [
      header.map((item) => csvEscape(item)).join(","),
      ...filteredRows.map((row) =>
        [
          row.orderLabel,
          row.orderNumber ?? row.shopifyOrderId,
          row.status,
          row.customerName,
          row.customerPhone,
          row.locationName,
          row.assignedAt,
          row.completedAt,
          row.expectedAmount,
          row.collectedAmount,
          row.paymentMethod,
          row.collectionStatus,
        ]
          .map((item) => csvEscape(item))
          .join(",")
      ),
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${riderLabel(ordersData.rider).replaceAll(/\s+/g, "-").toLowerCase()}-orders.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function printSummary() {
    if (!ordersData?.rider) {
      notify.error("Select a rider first");
      return;
    }
    if (filteredRows.length === 0) {
      notify.error("No rows match the selected filters");
      return;
    }

    const riderName = riderLabel(ordersData.rider);
    const totalCashToHandover = filteredLocationSummary.reduce((sum, item) => {
      return sum + item.cashTotal;
    }, 0);
    const locationRows = filteredLocationSummary
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.locationName)}</td>
            <td>${item.orderCount}</td>
            <td>${escapeHtml(formatMoney(String(item.cashTotal)))}</td>
            <td>${escapeHtml(formatMoney(String(item.bankTransferTotal)))}</td>
            <td>${escapeHtml(formatMoney(String(item.cardTotal)))}</td>
            <td>${escapeHtml(formatMoney(String(item.alreadyPaidTotal)))}</td>
            <td>${escapeHtml(formatMoney(String(item.collectedTotal)))}</td>
          </tr>
        `
      )
      .join("");

    const orderRows = filteredRows
      .map(
        (row) => `
          <tr>
            <td>${escapeHtml(row.orderLabel)}</td>
            <td>${escapeHtml(row.locationName ?? "--")}</td>
            <td>${escapeHtml(row.status)}</td>
            <td>${escapeHtml(formatMoney(row.collectedAmount ?? row.expectedAmount))}</td>
            <td>${escapeHtml(row.paymentMethod ?? "--")}</td>
          </tr>
        `
      )
      .join("");

    const printHtml = `
      <html>
        <head>
          <title>Rider Settlement - ${escapeHtml(riderName)}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #1f2937; }
            h1, h2 { margin: 0 0 12px; }
            .meta { margin-bottom: 18px; color: #4b5563; }
            table { width: 100%; border-collapse: collapse; margin-top: 14px; }
            th, td { border: 1px solid #d1d5db; padding: 8px 10px; text-align: left; vertical-align: top; }
            th { background: #f3f4f6; }
            .totals { margin-top: 24px; padding: 14px 16px; border: 1px solid #d1d5db; border-radius: 12px; background: #f9fafb; }
            .totals strong { font-size: 24px; }
            .signatures { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 32px; margin-top: 36px; }
            .sig { padding-top: 36px; border-top: 1px solid #9ca3af; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <h1>Rider Settlement Summary</h1>
          <div class="meta">
            <div><strong>Rider:</strong> ${escapeHtml(riderName)}</div>
            <div><strong>Email:</strong> ${escapeHtml(ordersData.rider.email ?? "--")}</div>
            <div><strong>Mobile:</strong> ${escapeHtml(ordersData.rider.mobile ?? "--")}</div>
            <div><strong>Printed on:</strong> ${escapeHtml(formatAppDateTime(new Date()))}</div>
          </div>

          <h2>Location Summary</h2>
          <table>
            <thead>
              <tr>
                <th>Location</th>
                <th>Orders</th>
                <th>Cash</th>
                <th>Bank Transfer</th>
                <th>Card</th>
                <th>Already Paid</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>${locationRows || '<tr><td colspan="7">No completed orders yet.</td></tr>'}</tbody>
          </table>

          <h2>Orders</h2>
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Location</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Payment</th>
              </tr>
            </thead>
            <tbody>${orderRows || '<tr><td colspan="5">No orders assigned.</td></tr>'}</tbody>
          </table>

          <div class="totals">
            <div><strong>Total Cash To Handover: ${escapeHtml(formatMoney(String(totalCashToHandover)))}</strong></div>
          </div>

          <div class="signatures">
            <div class="sig">Rider Signature</div>
            <div class="sig">Finance / Receiver Signature</div>
          </div>
          <script>window.onload = function () { window.print(); };</script>
        </body>
      </html>
    `;

    const blob = new Blob([printHtml], { type: "text/html;charset=utf-8" });
    const printUrl = URL.createObjectURL(blob);
    const popup = window.open(printUrl, "_blank", "width=1100,height=800");
    if (!popup) {
      notify.error("Allow popups to print rider summary");
      return;
    }
    popup.addEventListener?.("beforeunload", () => URL.revokeObjectURL(printUrl));
  }

  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-2xl border border-border/70 bg-background/80 p-1 shadow-xs">
        {([
          ["orders", "Rider Orders"],
          ["directory", "Rider Directory"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setActiveTab(value)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              activeTab === value
                ? "bg-primary text-primary-foreground shadow-[0_10px_22px_-18px_var(--primary)]"
                : "text-muted-foreground hover:bg-secondary/10 hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "directory" ? (
        <StaffManagementPanel
          canManageStaff={canManageStaff}
          initialData={initialDirectoryData}
          mode="riders"
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <Card className="overflow-hidden border-border/70 shadow-xs">
            <CardHeader className="border-b border-border/50">
              <CardTitle className="text-xl tracking-tight">Riders</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-3">
              {riderRoster.map((rider) => {
                const active = rider.id === selectedRiderId;
                return (
                  <button
                    key={rider.id}
                    type="button"
                    onClick={() => void loadRiderOrders(rider.id)}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                      active
                        ? "border-primary/40 bg-primary/10"
                        : "border-border/70 bg-background/70 hover:bg-secondary/10"
                    }`}
                  >
                    <div className="font-medium">{riderLabel(rider)}</div>
                    <div className="text-muted-foreground mt-1 text-xs">{rider.email ?? rider.mobile ?? "--"}</div>
                    <div className="text-muted-foreground mt-1 text-xs">
                      {rider.locationName ?? "No location"} | {rider.status ?? "unknown"}
                    </div>
                  </button>
                );
              })}
              {riderRoster.length === 0 ? (
                <p className="text-muted-foreground px-2 py-6 text-sm">No riders found.</p>
              ) : null}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  {ordersData?.rider ? riderLabel(ordersData.rider) : riderLabel(selectedRider ?? {
                    id: "",
                    name: "Rider",
                    knownName: null,
                    email: null,
                    mobile: null,
                    status: null,
                    locationName: null,
                  })}
                </h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  View assigned orders, rider progress, and finance handover totals.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={exportCsv} disabled={!ordersData?.rider || loadingOrders}>
                  <Download className="mr-2 size-4" />
                  Export CSV
                </Button>
                <Button onClick={printSummary} disabled={!ordersData?.rider || loadingOrders}>
                  <Printer className="mr-2 size-4" />
                  Print Summary
                </Button>
              </div>
            </div>

            <Card className="border-border/70 shadow-xs">
              <CardContent className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto]">
                <label className="space-y-1">
                  <span className="text-muted-foreground text-xs font-medium">From date</span>
                  <div className="relative">
                    <input
                      ref={fromDateInputRef}
                      type="date"
                      value={fromDate}
                      onChange={(event) => setFromDate(event.target.value)}
                      className="pointer-events-none absolute inset-0 opacity-0"
                      tabIndex={-1}
                      aria-hidden="true"
                    />
                    <button
                      type="button"
                      onClick={() => openDatePicker(fromDateInputRef.current)}
                      className="flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-primary/40"
                    >
                      <span>{getRelativeDateLabel(fromDate)}</span>
                      <CalendarDays className="size-4 text-muted-foreground" />
                    </button>
                  </div>
                </label>
                <label className="space-y-1">
                  <span className="text-muted-foreground text-xs font-medium">To date</span>
                  <div className="relative">
                    <input
                      ref={toDateInputRef}
                      type="date"
                      value={toDate}
                      onChange={(event) => setToDate(event.target.value)}
                      className="pointer-events-none absolute inset-0 opacity-0"
                      tabIndex={-1}
                      aria-hidden="true"
                    />
                    <button
                      type="button"
                      onClick={() => openDatePicker(toDateInputRef.current)}
                      className="flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-primary/40"
                    >
                      <span>{getRelativeDateLabel(toDate)}</span>
                      <CalendarDays className="size-4 text-muted-foreground" />
                    </button>
                  </div>
                </label>
                <label className="space-y-1">
                  <span className="text-muted-foreground text-xs font-medium">Location</span>
                  <select
                    value={locationFilter}
                    onChange={(event) => setLocationFilter(event.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    <option value="all">All locations</option>
                    {locationOptions.map((location) => (
                      <option key={location} value={location}>
                        {location}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => {
                      setFromDate("");
                      setToDate("");
                      setLocationFilter("all");
                    }}
                  >
                    Clear Filters
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {loadingOrders ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <Card key={index} className="border-border/70 shadow-xs">
                    <CardContent className="space-y-3 p-4">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-8 w-16" />
                    </CardContent>
                  </Card>
                ))
              ) : (
                <>
                  <Card className="border-border/70 shadow-xs"><CardContent className="p-4"><p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">Total</p><p className="mt-1 text-2xl font-semibold">{filteredStatusSummary.total}</p></CardContent></Card>
                  <Card className="border-border/70 shadow-xs"><CardContent className="p-4"><p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">Assigned</p><p className="mt-1 text-2xl font-semibold">{filteredStatusSummary.assigned}</p></CardContent></Card>
                  <Card className="border-border/70 shadow-xs"><CardContent className="p-4"><p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">In Progress</p><p className="mt-1 text-2xl font-semibold">{filteredStatusSummary.inProgress}</p></CardContent></Card>
                  <Card className="border-border/70 shadow-xs"><CardContent className="p-4"><p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">Completed</p><p className="mt-1 text-2xl font-semibold">{filteredStatusSummary.completed}</p></CardContent></Card>
                </>
              )}
            </div>

            <Card className="overflow-hidden border-border/70 shadow-xs">
              <CardHeader className="border-b border-border/50">
                <CardTitle className="text-xl tracking-tight">Location Totals</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                {loadingOrders ? (
                  <TableSkeleton columns={7} rows={4} />
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-[linear-gradient(180deg,color-mix(in_srgb,var(--secondary)_14%,transparent),transparent)]">
                        <th className="p-3 text-left font-medium">Location</th>
                        <th className="p-3 text-left font-medium">Orders</th>
                        <th className="p-3 text-left font-medium">Cash</th>
                        <th className="p-3 text-left font-medium">Bank</th>
                        <th className="p-3 text-left font-medium">Card</th>
                        <th className="p-3 text-left font-medium">Already Paid</th>
                        <th className="p-3 text-left font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLocationSummary.map((item) => (
                        <tr key={item.locationName} className="border-b last:border-0">
                          <td className="p-3">{item.locationName}</td>
                          <td className="p-3">{item.orderCount}</td>
                          <td className="p-3">{formatMoney(String(item.cashTotal))}</td>
                          <td className="p-3">{formatMoney(String(item.bankTransferTotal))}</td>
                          <td className="p-3">{formatMoney(String(item.cardTotal))}</td>
                          <td className="p-3">{formatMoney(String(item.alreadyPaidTotal))}</td>
                          <td className="p-3 font-medium">{formatMoney(String(item.collectedTotal))}</td>
                        </tr>
                      ))}
                      {filteredLocationSummary.length === 0 ? (
                        <tr>
                          <td className="text-muted-foreground p-6 text-center" colSpan={7}>
                            No location totals for the selected filters.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-border/70 shadow-xs">
              <CardHeader className="border-b border-border/50">
                <CardTitle className="text-xl tracking-tight">Assigned Orders</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                {loadingOrders ? (
                  <TableSkeleton columns={8} rows={6} />
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-[linear-gradient(180deg,color-mix(in_srgb,var(--secondary)_14%,transparent),transparent)]">
                        <th className="p-3 text-left font-medium">Order</th>
                        <th className="p-3 text-left font-medium">Customer</th>
                        <th className="p-3 text-left font-medium">Location</th>
                        <th className="p-3 text-left font-medium">Status</th>
                        <th className="p-3 text-left font-medium">Assigned</th>
                        <th className="p-3 text-left font-medium">Completed</th>
                        <th className="p-3 text-left font-medium">Amount</th>
                        <th className="p-3 text-left font-medium">Payment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row) => (
                        <tr key={row.taskId} className="border-b last:border-0">
                          <td className="p-3">
                            <div className="font-medium">{row.orderLabel}</div>
                            <div className="text-muted-foreground text-xs">{row.orderNumber ?? row.shopifyOrderId}</div>
                          </td>
                          <td className="p-3">
                            <div>{row.customerName ?? "--"}</div>
                            <div className="text-muted-foreground text-xs">{row.customerPhone ?? "--"}</div>
                          </td>
                          <td className="p-3">{row.locationName ?? "--"}</td>
                          <td className="p-3">
                            <span className="rounded-full border border-border/70 bg-background/70 px-2 py-1 text-xs font-medium capitalize">
                              {row.status}
                            </span>
                          </td>
                          <td className="p-3">{formatDate(row.assignedAt)}</td>
                          <td className="p-3">{formatDate(row.completedAt ?? row.failedAt)}</td>
                          <td className="p-3">{formatMoney(row.collectedAmount ?? row.expectedAmount)}</td>
                          <td className="p-3">
                            <div>{row.paymentMethod ?? "--"}</div>
                            <div className="text-muted-foreground text-xs">{row.collectionStatus ?? "--"}</div>
                          </td>
                        </tr>
                      ))}
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td className="text-muted-foreground p-6 text-center" colSpan={8}>
                            No rider orders match the selected filters.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
