"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Cake, Crown, Download, Loader2, Target } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  callCenterCategoryColor,
} from "@/lib/contact-call-center-categories";
import { formatAppTime } from "@/lib/format-datetime";
import { notify } from "@/lib/notify";
import { loyaltyProfileIncompleteMessage } from "@/lib/customer-insight/loyalty-profile-complete";
import { buildBirthdayWishMessage } from "@/lib/page-data/merchant-birthday-wish-message";
import type { MerchantDashboardPageData } from "@/lib/page-data/merchant-dashboard";
import type { MerchantDailyInvoiceRow } from "@/lib/page-data/merchant-dashboard-sales";

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 0,
  }).format(value);
}

function csvEscape(value: string | number | boolean | null | undefined) {
  const safe = value == null ? "" : String(value);
  return `"${safe.replaceAll('"', '""')}"`;
}

function MerchantChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number; color?: string; name?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      {label ? (
        <p className="mb-1.5 font-semibold text-foreground">{label}</p>
      ) : null}
      {payload.map((entry) => {
        const key = String(entry.dataKey ?? "");
        const isCalls = key === "calls" || key === "callCount";
        const value = Number(entry.value ?? 0);
        return (
          <div key={key || String(entry.name)} className="flex items-center gap-2 py-0.5">
            <span
              className="inline-block size-2 shrink-0 rounded-[2px]"
              style={{ backgroundColor: entry.color ?? "#14b8a6" }}
            />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-medium tabular-nums text-foreground">
              {isCalls ? `${Math.round(value)} calls` : formatMoney(value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function LocationSharePieTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number;
    payload?: { name?: string; value?: number; fill?: string; pct?: number | null };
  }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  const name = row?.name ?? payload[0]?.name ?? "Share";
  const value = Number(row?.value ?? payload[0]?.value ?? 0);
  const pct = row?.pct;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <p className="mb-1 font-semibold text-foreground">{name}</p>
      <p className="tabular-nums text-foreground">
        {formatMoney(value)}
        {pct != null ? ` · ${pct}%` : ""}
      </p>
    </div>
  );
}

const PIE_COLORS = ["#0d9488", "#f59e0b", "#6366f1", "#ef4444", "#14b8a6", "#a855f7", "#64748b"];
const SELF_SHARE_COLOR = "#0d9488";
const OTHERS_SHARE_COLOR = "#64748b";
/** Preview size for ranked customer lists; View more reveals the rest. */
const TOP_CUSTOMERS_PREVIEW = 5;

type Props = {
  initialData: MerchantDashboardPageData;
};

export function MerchantDashboardPanel({ initialData }: Props) {
  const [data, setData] = useState(initialData);
  const [merchantId, setMerchantId] = useState(initialData.selectedMerchantId);
  const [targetInput, setTargetInput] = useState(
    initialData.target.targetAmount > 0
      ? String(Math.round(initialData.target.targetAmount))
      : "",
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [showAllToday, setShowAllToday] = useState(false);
  const [showAllLifetime, setShowAllLifetime] = useState(false);
  const [peerPeriod, setPeerPeriod] = useState<"today" | "mtd">("today");
  const [dailyHistoryChartType, setDailyHistoryChartType] = useState<
    "bar" | "line"
  >("bar");
  const [locationSharePeriod, setLocationSharePeriod] = useState<"today" | "mtd">(
    "mtd",
  );
  const [wishContact, setWishContact] = useState<
    MerchantDashboardPageData["nearestBirthdays"][number] | null
  >(null);
  const [wishDiscount, setWishDiscount] = useState("10");
  const [wishCode, setWishCode] = useState("");
  const [wishMessage, setWishMessage] = useState("");
  const [invoiceDay, setInvoiceDay] = useState(initialData.dailyInvoicesYmd);
  const [dailyInvoices, setDailyInvoices] = useState<MerchantDailyInvoiceRow[]>(
    initialData.dailyInvoices,
  );
  const [dailyInvoicesTotal, setDailyInvoicesTotal] = useState(
    initialData.dailyInvoicesTotal,
  );
  const [dailyInvoicesOrderCount, setDailyInvoicesOrderCount] = useState(
    initialData.dailyInvoicesOrderCount,
  );
  const [showCustomerLists, setShowCustomerLists] = useState(
    initialData.showCustomerLists ?? false,
  );
  const [rangeFrom, setRangeFrom] = useState(
    initialData.rangeFromYmd ?? initialData.fromYmd,
  );
  const [rangeTo, setRangeTo] = useState(
    initialData.rangeToYmd ?? initialData.toYmd,
  );
  const [isPending, startTransition] = useTransition();
  const isBusy = busyKey !== null || isPending;

  useEffect(() => {
    setData(initialData);
    setMerchantId(initialData.selectedMerchantId);
    setTargetInput(
      initialData.target.targetAmount > 0
        ? String(Math.round(initialData.target.targetAmount))
        : "",
    );
    setShowAllToday(false);
    setShowAllLifetime(false);
    setInvoiceDay(initialData.dailyInvoicesYmd);
    setDailyInvoices(initialData.dailyInvoices);
    setDailyInvoicesTotal(initialData.dailyInvoicesTotal);
    setDailyInvoicesOrderCount(initialData.dailyInvoicesOrderCount);
  }, [initialData]);

  async function reload(
    nextMerchantId: string,
    opts?: {
      showCustomerLists?: boolean;
      fromDate?: string;
      toDate?: string;
    },
  ) {
    setBusyKey("reload");
    try {
      const lists = opts?.showCustomerLists ?? showCustomerLists;
      const from = opts?.fromDate ?? rangeFrom;
      const to = opts?.toDate ?? rangeTo;
      const params = new URLSearchParams({
        merchantUserId: nextMerchantId,
        yearMonth: data.yearMonth,
      });
      if (lists) params.set("showCustomerLists", "true");
      if (from) params.set("fromDate", from);
      if (to) params.set("toDate", to);
      const res = await fetch(`/api/admin/merchant-dashboard/page-data?${params}`);
      const json = await res.json();
      if (!res.ok) {
        notify.error(json.error ?? "Failed to load merchant dashboard");
        return;
      }
      startTransition(() => {
        setData(json as MerchantDashboardPageData);
        setMerchantId(json.selectedMerchantId);
        setTargetInput(
          json.target.targetAmount > 0
            ? String(Math.round(json.target.targetAmount))
            : "",
        );
        setShowAllToday(false);
        setShowAllLifetime(false);
        setShowCustomerLists(Boolean(json.showCustomerLists));
        setRangeFrom(json.rangeFromYmd ?? json.fromYmd);
        setRangeTo(json.rangeToYmd ?? json.toYmd);
        setInvoiceDay(json.dailyInvoicesYmd);
        setDailyInvoices(json.dailyInvoices);
        setDailyInvoicesTotal(json.dailyInvoicesTotal);
        setDailyInvoicesOrderCount(json.dailyInvoicesOrderCount);
      });
    } catch {
      notify.error("Failed to load merchant dashboard");
    } finally {
      setBusyKey(null);
    }
  }

  async function loadDailyInvoices(day: string, nextMerchantId = merchantId) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      notify.error("Pick a valid date");
      return;
    }
    setBusyKey("daily-invoices");
    setInvoiceDay(day);
    try {
      const params = new URLSearchParams({
        day,
        merchantUserId: nextMerchantId,
      });
      const res = await fetch(
        `/api/admin/merchant-dashboard/daily-invoices?${params}`,
      );
      const json = await res.json();
      if (!res.ok) {
        notify.error(json.error ?? "Failed to load daily invoices");
        return;
      }
      setDailyInvoices(json.rows ?? []);
      setDailyInvoicesTotal(Number(json.total ?? 0));
      setDailyInvoicesOrderCount(Number(json.orderCount ?? 0));
      setInvoiceDay(json.dayYmd ?? day);
    } catch {
      notify.error("Failed to load daily invoices");
    } finally {
      setBusyKey(null);
    }
  }

  function exportDailyInvoicesCsv() {
    if (dailyInvoices.length === 0) {
      notify.error("No invoices to export for this day");
      return;
    }
    const header = [
      "Time",
      "Invoice",
      "Customer",
      "Phone",
      "Amount",
      "Location",
      "Allocated merchant",
      "Allocation mismatch",
    ];
    const lines = [
      header.map((item) => csvEscape(item)).join(","),
      ...dailyInvoices.map((row) =>
        [
          formatAppTime(row.createdAt),
          row.invoiceLabel,
          row.customerName,
          row.customerPhone,
          row.amount,
          row.locationName,
          row.allocatedMerchant,
          row.allocationMismatch ? "yes" : "no",
        ]
          .map((item) => csvEscape(item))
          .join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `merchant-invoices-${invoiceDay}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function saveTarget() {
    const amount = Number(targetInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      notify.error("Enter a positive target amount");
      return;
    }
    setBusyKey("save-target");
    try {
      const res = await fetch("/api/admin/merchant-dashboard/targets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantUserId: merchantId,
          yearMonth: data.yearMonth,
          targetAmount: amount,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        notify.error(json.error ?? "Failed to save target");
        return;
      }
      notify.success(json.action === "set" ? "Target assigned." : "Target updated.");
      await reload(merchantId);
    } catch {
      notify.error("Failed to save target");
    } finally {
      setBusyKey(null);
    }
  }

  function openWish(
    row: MerchantDashboardPageData["nearestBirthdays"][number],
  ) {
    const discount = Number(wishDiscount) || 10;
    setWishContact(row);
    setWishDiscount(String(discount));
    setWishCode("");
    setWishMessage(
      buildBirthdayWishMessage({
        customerName: row.name,
        merchantName: data.profile.displayName,
        discountPercent: discount,
        code: null,
      }),
    );
  }

  async function sendWish() {
    if (!wishContact) return;
    const discountPercent = Number(wishDiscount);
    if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 50) {
      notify.error("Discount must be between 0 and 50");
      return;
    }
    if (!wishMessage.trim()) {
      notify.error("Message is required");
      return;
    }
    setBusyKey("wish-sms");
    try {
      const res = await fetch("/api/admin/merchant-dashboard/birthday-wish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: wishContact.contactId,
          discountPercent,
          discountCode: wishCode.trim() || null,
          phoneNumber: wishContact.phoneNumber || undefined,
          message: wishMessage.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        notify.error(json.error ?? "Failed to send birthday wish");
        return;
      }
      notify.success("Birthday wish SMS sent.");
      setWishContact(null);
    } catch {
      notify.error("Failed to send birthday wish");
    } finally {
      setBusyKey(null);
    }
  }

  const percent = data.target.percent ?? 0;
  const progressWidth = Math.min(100, Math.max(0, percent));
  const locationPie = data.sales.byLocation.map((row, i) => ({
    name: row.locationName,
    value: row.total,
    fill: PIE_COLORS[i % PIE_COLORS.length],
  }));
  const overviewRows = [...(data.overview ?? [])].sort(
    (a, b) => b.mtdSales - a.mtdSales,
  );
  const maxMtd = Math.max(1, ...overviewRows.map((row) => row.mtdSales));
  const hasAnyTarget = overviewRows.some(
    (row) => row.targetAmount != null && row.targetAmount > 0,
  );
  const overviewChart = overviewRows.map((row) => ({
    name: row.displayName,
    sales: row.mtdSales,
    ...(hasAnyTarget ? { target: row.targetAmount ?? 0 } : {}),
  }));
  const activePeerBoard =
    peerPeriod === "today" ? data.peerBoards.today : data.peerBoards.mtd;
  const peerBarChart = activePeerBoard.entries.map((entry) => ({
    name: entry.isViewed ? `${entry.displayName} (you)` : entry.displayName,
    sales: entry.total,
    orders: entry.orderCount,
    isViewed: entry.isViewed,
    fill: entry.isViewed ? SELF_SHARE_COLOR : "#64748b",
  }));
  const peerCohortTotal = activePeerBoard.entries.reduce((s, e) => s + e.total, 0);
  const peerSharePie = activePeerBoard.entries
    .filter((entry) => entry.total > 0)
    .map((entry, i) => ({
      name: entry.isViewed ? `${entry.displayName} (you)` : entry.displayName,
      value: entry.total,
      pct:
        peerCohortTotal > 0
          ? Math.round((entry.total / peerCohortTotal) * 1000) / 10
          : null,
      fill: entry.isViewed
        ? SELF_SHARE_COLOR
        : PIE_COLORS[(i + 1) % PIE_COLORS.length],
    }));
  const peerPodium = activePeerBoard.entries
    .filter((entry) => !entry.excludeFromRace)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 3);
  const peerBarHeight = Math.max(180, peerBarChart.length * 34);
  const activeLocationShare =
    locationSharePeriod === "today"
      ? data.locationShare.today
      : data.locationShare.mtd;
  const dailyHistoryChart = data.salesHistory.daily.map((row) => ({
    name: row.ymd.slice(8),
    sales: row.total,
    calls: row.callCount,
  }));
  const dailyHistoryHasData = data.salesHistory.daily.some(
    (d) => d.total > 0 || d.callCount > 0,
  );

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(135deg,#0f766e22,#134e4a33,#042f2e11)] p-5 sm:p-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
                Merchant dashboard
              </p>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {data.profile.displayName}
              </h1>
            <p className="text-sm text-foreground/80">
              Today {formatMoney(data.today.total)} · This month (MTD){" "}
              {formatMoney(data.sales.total)} · {data.sales.orderCount} orders
              {data.returns.returnRatePct != null
                ? ` · ${data.returns.returnRatePct}% returns`
                : ""}
            </p>
            {data.sales.hasDmSplit ? (
              <p className="text-muted-foreground text-xs">
                Full {formatMoney(data.sales.total)} · Your MER{" "}
                {formatMoney(data.sales.merTotal)} ({data.sales.merOrderCount}{" "}
                orders) · DM {formatMoney(data.sales.dmTotal)} (
                {data.sales.dmOrderCount} orders, incl. no MER code)
              </p>
            ) : null}
              {data.profile.email && (
                <p className="text-muted-foreground text-xs">{data.profile.email}</p>
              )}
            </div>
            {data.viewerIsAdmin && (
              <div className="w-full max-w-xs space-y-1">
                <label className="text-muted-foreground text-xs font-medium">
                  View merchant
                </label>
                <Select
                  value={merchantId}
                  disabled={isBusy || data.merchants.length === 0}
                  onValueChange={(value) => {
                    setMerchantId(value);
                    void reload(value);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select merchant" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.merchants.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.displayName}
                        {m.roleNames[0] ? ` (${m.roleNames[0]})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {data.canManageTargets && (
            <div className="rounded-xl border border-white/15 bg-black/10 p-3 backdrop-blur-sm dark:bg-white/5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1">
                  <label className="text-muted-foreground text-xs font-medium">
                    Assign monthly target (LKR) — {data.profile.displayName} · {data.yearMonth}
                  </label>
                  <Input
                    type="number"
                    min={1}
                    step={1000}
                    disabled={isBusy}
                    value={targetInput}
                    onChange={(e) => setTargetInput(e.target.value)}
                    placeholder="e.g. 500000"
                    className="bg-background/80"
                  />
                </div>
                <Button disabled={isBusy} onClick={() => void saveTarget()}>
                  {busyKey === "save-target" ? (
                    <>
                      <Loader2 className="animate-spin" aria-hidden />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Target aria-hidden />
                      Save target
                    </>
                  )}
                </Button>
              </div>
              {data.target.assignedByName && (
                <p className="text-muted-foreground mt-2 text-xs">
                  Last assigned by {data.target.assignedByName}
                  {data.target.assignedAt
                    ? ` · ${new Date(data.target.assignedAt).toLocaleString()}`
                    : ""}
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold tabular-nums">
              {formatMoney(data.today.total)}
            </p>
            <p className="text-muted-foreground text-xs">
              {data.today.orderCount} orders · {data.today.ymd}
              {data.today.hasDmSplit
                ? ` · MER ${formatMoney(data.today.merTotal ?? 0)} · DM ${formatMoney(data.today.dmTotal ?? 0)}`
                : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {data.sales.hasDmSplit ? "Full total (MTD)" : "This month (MTD)"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold tabular-nums">
              {formatMoney(data.sales.total)}
            </p>
            <p className="text-muted-foreground text-xs">
              {data.sales.hasDmSplit ? "Full total · " : ""}
              {data.sales.orderCount} orders · {data.yearMonth}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Target progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold tabular-nums">
              {data.target.percent != null ? `${data.target.percent}%` : "—"}
            </p>
            <div className="bg-muted mt-2 h-2 overflow-hidden rounded-full">
              <div
                className="h-full rounded-full bg-teal-600"
                style={{ width: `${progressWidth}%` }}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Peer rank ({peerPeriod === "today" ? "Today" : "MTD"})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold tabular-nums">
              {activePeerBoard.viewedRank != null
                ? `#${activePeerBoard.viewedRank}`
                : "—"}
            </p>
            <p className="text-muted-foreground text-xs">
              {activePeerBoard.gapToLeader > 0
                ? `${formatMoney(activePeerBoard.gapToLeader)} behind leader`
                : activePeerBoard.viewedTotal > 0
                  ? "Leading the board"
                  : "No sales yet"}
            </p>
          </CardContent>
        </Card>
      </div>

      {data.sales.hasDmSplit ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Your MER total (MTD)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-semibold tabular-nums">
                {formatMoney(data.sales.merTotal)}
              </p>
              <p className="text-muted-foreground text-xs">
                {data.sales.merOrderCount} orders on your personal MER codes
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                DM total (MTD)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-semibold tabular-nums">
                {formatMoney(data.sales.dmTotal)}
              </p>
              <p className="text-muted-foreground text-xs">
                {data.sales.dmOrderCount} orders · DM MER + orders with no MER
                code
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">Peer comparison</CardTitle>
            <p className="text-sm text-foreground/90">{activePeerBoard.cheerMessage}</p>
            <p className="text-muted-foreground text-xs">
              Cohort sales race — podium, share donut, and ranked bars
              ({peerPeriod === "today" ? "Today" : "MTD"}).
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={peerPeriod === "today" ? "default" : "outline"}
              disabled={isBusy}
              onClick={() => setPeerPeriod("today")}
            >
              Today
            </Button>
            <Button
              type="button"
              size="sm"
              variant={peerPeriod === "mtd" ? "default" : "outline"}
              disabled={isBusy}
              onClick={() => setPeerPeriod("mtd")}
            >
              MTD
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {activePeerBoard.entries.length === 0 ? (
            <p className="text-muted-foreground text-sm">No merchants in cohort.</p>
          ) : (
            <>
              {peerPodium.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  {peerPodium.map((entry, idx) => {
                    const podiumTone =
                      idx === 0
                        ? "border-amber-500/40 bg-amber-500/10"
                        : idx === 1
                          ? "border-slate-400/40 bg-slate-500/10"
                          : "border-orange-700/40 bg-orange-700/10";
                    return (
                      <div
                        key={`podium-${entry.merchantId}`}
                        className={`rounded-xl border px-3 py-3 ${podiumTone} ${
                          entry.isViewed ? "ring-1 ring-teal-500/50" : ""
                        }`}
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {idx === 0 ? (
                              <Crown className="size-3.5 text-amber-500" aria-hidden />
                            ) : null}
                            #{entry.rank}
                          </span>
                          {entry.isViewed ? (
                            <span className="rounded bg-teal-600/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
                              You
                            </span>
                          ) : null}
                        </div>
                        <p className="truncate font-semibold">{entry.displayName}</p>
                        <p className="mt-1 text-lg font-semibold tabular-nums">
                          {formatMoney(entry.total)}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {entry.orderCount} order{entry.orderCount === 1 ? "" : "s"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="flex flex-col items-center gap-2 rounded-xl border border-border/60 p-3">
                  {peerSharePie.length === 0 ? (
                    <p className="text-muted-foreground py-10 text-center text-sm">
                      No sales in this cohort yet — first sale lights up the board.
                    </p>
                  ) : (
                    <>
                      <p className="text-muted-foreground self-start text-xs font-medium uppercase tracking-wide">
                        Cohort share
                      </p>
                      <div className="h-48 w-full max-w-[240px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={peerSharePie}
                              dataKey="value"
                              nameKey="name"
                              innerRadius={44}
                              outerRadius={74}
                              paddingAngle={2}
                            >
                              {peerSharePie.map((slice) => (
                                <Cell key={slice.name} fill={slice.fill} />
                              ))}
                            </Pie>
                            <Tooltip content={<LocationSharePieTooltip />} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <ul className="flex w-full flex-wrap justify-center gap-x-3 gap-y-1 text-xs">
                        {peerSharePie.map((slice) => (
                          <li
                            key={slice.name}
                            className="inline-flex items-center gap-1.5"
                          >
                            <span
                              className="size-2.5 shrink-0 rounded-[2px]"
                              style={{ backgroundColor: slice.fill }}
                              aria-hidden
                            />
                            <span className="text-muted-foreground max-w-[7rem] truncate">
                              {slice.name}
                            </span>
                            <span className="tabular-nums text-foreground">
                              {slice.pct != null ? `${slice.pct}%` : formatMoney(slice.value)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>

                <div className="rounded-xl border border-border/60 p-3">
                  <p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
                    Ranked sales
                  </p>
                  <div className="w-full" style={{ height: peerBarHeight }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={peerBarChart}
                        layout="vertical"
                        margin={{ top: 4, right: 48, left: 4, bottom: 4 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          className="stroke-border"
                          horizontal={false}
                        />
                        <XAxis
                          type="number"
                          tick={{ fontSize: 10 }}
                          tickFormatter={(v) =>
                            Number(v) >= 1000
                              ? `${Math.round(Number(v) / 1000)}k`
                              : String(Math.round(Number(v)))
                          }
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={96}
                          tick={{ fontSize: 11 }}
                        />
                        <Tooltip content={<MerchantChartTooltip />} />
                        <Bar dataKey="sales" name="Sales" radius={[0, 4, 4, 0]}>
                          {peerBarChart.map((row) => (
                            <Cell key={row.name} fill={row.fill} />
                          ))}
                          <LabelList
                            dataKey="sales"
                            position="right"
                            className="fill-foreground text-[10px]"
                            formatter={(v: number) =>
                              Number(v) > 0
                                ? Number(v) >= 1000
                                  ? `${Math.round(Number(v) / 1000)}k`
                                  : String(Math.round(Number(v)))
                                : ""
                            }
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Monthly target</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-foreground/90">{data.target.cheerMessage}</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>
                  {formatMoney(data.target.achievedAmount)}
                  {data.target.targetAmount > 0
                    ? ` / ${formatMoney(data.target.targetAmount)}`
                    : ""}
                </span>
                <span className="font-medium">
                  {data.target.percent != null ? `${data.target.percent}%` : "No target"}
                </span>
              </div>
              <div className="bg-muted h-3 overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full bg-teal-600 transition-all"
                  style={{ width: `${progressWidth}%` }}
                />
              </div>
            </div>
            {data.target.assignedByName && !data.canManageTargets && (
              <p className="text-muted-foreground text-xs">
                Last assigned by {data.target.assignedByName}
                {data.target.assignedAt
                  ? ` · ${new Date(data.target.assignedAt).toLocaleString()}`
                  : ""}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">Nearest birthdays</CardTitle>
            <p className="text-muted-foreground text-xs">
              Allocated customers with birthdays in the next 45 days. Wish them with
              an SMS (editable) and optional discount.
            </p>
          </CardHeader>
          <CardContent>
            {(data.nearestBirthdays ?? []).length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No upcoming birthdays among allocated customers (need birth month on
                contact + matching assigned merchant name).
              </p>
            ) : (
              <ul className="max-h-72 space-y-2 overflow-y-auto">
                {(data.nearestBirthdays ?? []).map((row) => (
                  <li
                    key={row.contactId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="bg-muted text-muted-foreground inline-flex size-8 shrink-0 items-center justify-center rounded-full">
                        <Cake className="size-4" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{row.name}</p>
                        <p className="text-muted-foreground text-xs">
                          {row.daysUntil === 0
                            ? "Birthday today"
                            : `In ${row.daysUntil} day${row.daysUntil === 1 ? "" : "s"}`}
                          {" · "}
                          {row.birthMonth}/{row.birthDay ?? "—"}
                          {row.phoneNumber ? ` · ${row.phoneNumber}` : ""}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={isBusy || !row.phoneNumber}
                      onClick={() => openWish(row)}
                    >
                      Wish them
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-base">Loyalty eligible</CardTitle>
          <p className="text-muted-foreground text-xs">
            Allocated customers who hit Gold/Platinum spend and still need registration
            — Standard not yet set, or Gold customers now Platinum-eligible. Contact
            them, then assign after they respond.
          </p>
        </CardHeader>
        <CardContent>
          {(data.loyaltyOutreach ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No eligible Gold/Platinum customers right now.
            </p>
          ) : (
            <ul className="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
              {(data.loyaltyOutreach ?? []).map((row) => (
                <li
                  key={row.contactId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatMoney(row.lifetimeTotal)}
                      {" · "}
                      {(row.suggestedTier ?? "gold") === "platinum"
                        ? "Platinum"
                        : "Gold"}{" "}
                      eligible
                      {row.suggestionKind === "upgrade"
                        ? " · currently Gold"
                        : " · still Standard"}{" "}
                      · {row.status}
                      {row.phoneNumber ? ` · ${row.phoneNumber}` : ""}
                    </p>
                    {row.missingProfileFields?.length ? (
                      <p className="text-amber-700 dark:text-amber-400 text-xs">
                        Missing details: {row.missingProfileFields.join(", ")}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isBusy}
                      asChild
                    >
                      <Link
                        href={`/dashboard/customer-insight?contactId=${encodeURIComponent(row.contactId)}&edit=1`}
                      >
                        Edit profile
                      </Link>
                    </Button>
                    {row.status === "responded" ? (
                      <span className="text-muted-foreground self-center text-xs">
                        Requested
                      </span>
                    ) : (
                    <>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={isBusy}
                      onClick={() => {
                        void (async () => {
                          const action =
                            row.status === "contacted"
                              ? "responded"
                              : "loyalty_informed";
                          if (
                            action === "responded" &&
                            row.missingProfileFields?.length
                          ) {
                            notify.error(
                              loyaltyProfileIncompleteMessage(
                                row.missingProfileFields
                              )
                            );
                            return;
                          }
                          setBusyKey("loyalty");
                          try {
                            const res = await fetch(
                              "/api/admin/merchant-dashboard/loyalty-outreach",
                              {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  contactId: row.contactId,
                                  action,
                                }),
                              },
                            );
                            const json = await res.json().catch(() => ({}));
                            if (!res.ok) {
                              notify.error(json.error ?? "Update failed");
                              return;
                            }
                            notify.success("Loyalty outreach updated");
                            await reload(merchantId);
                          } catch {
                            notify.error("Update failed");
                          } finally {
                            setBusyKey(null);
                          }
                        })();
                      }}
                    >
                      {row.status === "contacted" ? "Responded" : "Mark contacted"}
                    </Button>
                    {row.status === "contacted" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isBusy}
                        onClick={() => {
                          void (async () => {
                            setBusyKey("loyalty");
                            try {
                              const res = await fetch(
                                "/api/admin/merchant-dashboard/loyalty-outreach",
                                {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    contactId: row.contactId,
                                    action: "not_responded",
                                  }),
                                },
                              );
                              const json = await res.json().catch(() => ({}));
                              if (!res.ok) {
                                notify.error(json.error ?? "Update failed");
                                return;
                              }
                              notify.success("Marked not responded");
                              await reload(merchantId);
                            } catch {
                              notify.error("Update failed");
                            } finally {
                              setBusyKey(null);
                            }
                          })();
                        }}
                      >
                        Not responded
                      </Button>
                    ) : null}
                    </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-base">Your sales by outlet</CardTitle>
          <p className="text-muted-foreground text-xs">
            This merchant’s MTD total only — not company-wide sales. Split by
            location/outlet.
          </p>
        </CardHeader>
        <CardContent>
          {locationPie.length === 0 ? (
            <p className="text-muted-foreground text-sm">No sales in this month yet.</p>
          ) : (
            <div className="mx-auto h-52 w-full max-w-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={locationPie}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={2}
                  >
                    {locationPie.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={<MerchantChartTooltip />}
                    cursor={{ fill: "rgba(148, 163, 184, 0.12)" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <ul className="mt-2 space-y-1 text-sm">
            {data.sales.byLocation.map((row) => (
              <li key={row.locationId} className="flex justify-between gap-2">
                <span className="truncate">{row.locationName}</span>
                <span className="shrink-0 font-medium">{formatMoney(row.total)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">Location share</CardTitle>
            <p className="text-muted-foreground text-xs">
              How much of each outlet’s sales is yours vs other merchants
              (Today / MTD). Donut = share of location total; bars = amounts.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={locationSharePeriod === "today" ? "default" : "outline"}
              disabled={isBusy}
              onClick={() => setLocationSharePeriod("today")}
            >
              Today
            </Button>
            <Button
              type="button"
              size="sm"
              variant={locationSharePeriod === "mtd" ? "default" : "outline"}
              disabled={isBusy}
              onClick={() => setLocationSharePeriod("mtd")}
            >
              MTD
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeLocationShare.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No location sales for this period yet.
            </p>
          ) : (
            activeLocationShare.map((loc) => {
              const peerShownTotal = loc.peers.reduce((sum, p) => sum + p.total, 0);
              const othersAmount = Math.max(
                0,
                loc.locationTotal - loc.selfAmount - peerShownTotal,
              );
              const sharePie = [
                {
                  name: "You",
                  value: loc.selfAmount,
                  pct: loc.selfSharePct,
                  fill: SELF_SHARE_COLOR,
                },
                ...loc.peers.map((peer, i) => ({
                  name: peer.displayName,
                  value: peer.total,
                  pct: peer.sharePct,
                  fill: PIE_COLORS[(i + 1) % PIE_COLORS.length],
                })),
                ...(othersAmount > 0
                  ? [
                      {
                        name: "Others",
                        value: othersAmount,
                        pct:
                          loc.locationTotal > 0
                            ? Math.round((othersAmount / loc.locationTotal) * 1000) / 10
                            : null,
                        fill: OTHERS_SHARE_COLOR,
                      },
                    ]
                  : []),
              ].filter((row) => row.value > 0);

              const shareBars = [
                {
                  name: "You",
                  sales: loc.selfAmount,
                  fill: SELF_SHARE_COLOR,
                },
                ...loc.peers.map((peer, i) => ({
                  name: peer.displayName,
                  sales: peer.total,
                  fill: PIE_COLORS[(i + 1) % PIE_COLORS.length],
                })),
              ];
              const barHeight = Math.max(140, shareBars.length * 36);

              return (
                <div
                  key={`${locationSharePeriod}-${loc.locationId}`}
                  className="rounded-xl border border-border/60 p-3 sm:p-4"
                >
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="font-medium">{loc.locationName}</p>
                      <p className="text-muted-foreground text-xs">
                        You {loc.selfOrderCount} order
                        {loc.selfOrderCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums text-teal-600 dark:text-teal-400">
                      You {formatMoney(loc.selfAmount)}
                      {loc.selfSharePct != null ? ` · ${loc.selfSharePct}%` : ""}
                    </p>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-44 w-full max-w-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={sharePie}
                              dataKey="value"
                              nameKey="name"
                              innerRadius={42}
                              outerRadius={72}
                              paddingAngle={2}
                            >
                              {sharePie.map((entry) => (
                                <Cell key={entry.name} fill={entry.fill} />
                              ))}
                            </Pie>
                            <Tooltip content={<LocationSharePieTooltip />} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <ul className="flex w-full flex-wrap justify-center gap-x-3 gap-y-1 text-xs">
                        {sharePie.map((slice) => (
                          <li key={slice.name} className="inline-flex items-center gap-1.5">
                            <span
                              className="size-2.5 shrink-0 rounded-[2px]"
                              style={{ backgroundColor: slice.fill }}
                              aria-hidden
                            />
                            <span className="text-muted-foreground truncate max-w-[7rem]">
                              {slice.name}
                            </span>
                            <span className="tabular-nums text-foreground">
                              {slice.pct != null ? `${slice.pct}%` : formatMoney(slice.value)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="w-full" style={{ height: barHeight }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={shareBars}
                          layout="vertical"
                          margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            className="stroke-border"
                            horizontal={false}
                          />
                          <XAxis
                            type="number"
                            tick={{ fontSize: 10 }}
                            tickFormatter={(v) =>
                              Number(v) >= 1000
                                ? `${Math.round(Number(v) / 1000)}k`
                                : String(Math.round(Number(v)))
                            }
                          />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={88}
                            tick={{ fontSize: 11 }}
                          />
                          <Tooltip content={<MerchantChartTooltip />} />
                          <Bar dataKey="sales" name="Sales" radius={[0, 4, 4, 0]}>
                            {shareBars.map((row) => (
                              <Cell key={row.name} fill={row.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="space-y-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="space-y-1">
                <CardTitle className="text-base">Daily sales &amp; calls</CardTitle>
                <p className="text-muted-foreground text-xs">
                  Current month through today (Asia/Colombo). Calls = insight /
                  call-center updates that day.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={dailyHistoryChartType === "bar" ? "default" : "outline"}
                  disabled={isBusy}
                  onClick={() => setDailyHistoryChartType("bar")}
                >
                  Bar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={dailyHistoryChartType === "line" ? "default" : "outline"}
                  disabled={isBusy}
                  onClick={() => setDailyHistoryChartType("line")}
                >
                  Line
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!dailyHistoryHasData ? (
              <p className="text-muted-foreground text-sm">
                No sales or calls this month yet.
              </p>
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {dailyHistoryChartType === "bar" ? (
                    <BarChart
                      data={dailyHistoryChart}
                      margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis
                        yAxisId="sales"
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                      />
                      <YAxis
                        yAxisId="calls"
                        orientation="right"
                        tick={{ fontSize: 10 }}
                        allowDecimals={false}
                      />
                      <Tooltip content={<MerchantChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar
                        yAxisId="sales"
                        dataKey="sales"
                        name="Sales"
                        fill="#0d9488"
                        radius={[3, 3, 0, 0]}
                      />
                      <Bar
                        yAxisId="calls"
                        dataKey="calls"
                        name="Calls"
                        fill="#6366f1"
                        radius={[3, 3, 0, 0]}
                      />
                    </BarChart>
                  ) : (
                    <LineChart
                      data={dailyHistoryChart}
                      margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis
                        yAxisId="sales"
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                      />
                      <YAxis
                        yAxisId="calls"
                        orientation="right"
                        tick={{ fontSize: 10 }}
                        allowDecimals={false}
                      />
                      <Tooltip content={<MerchantChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line
                        yAxisId="sales"
                        type="monotone"
                        dataKey="sales"
                        name="Sales"
                        stroke="#0d9488"
                        strokeWidth={2}
                        dot={{ r: 2 }}
                        activeDot={{ r: 4 }}
                      />
                      <Line
                        yAxisId="calls"
                        type="monotone"
                        dataKey="calls"
                        name="Calls"
                        stroke="#6366f1"
                        strokeWidth={2}
                        dot={{ r: 2 }}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">Monthly sales history</CardTitle>
            <p className="text-muted-foreground text-xs">Last 3 calendar months.</p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left">
                    <th className="py-2 pr-3 font-medium">Month</th>
                    <th className="py-2 pr-3 font-medium">Sales</th>
                    <th className="py-2 pr-3 font-medium">Orders</th>
                    <th className="py-2 pr-3 font-medium">Target</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.salesHistory.monthly.map((row) => (
                    <tr key={row.yearMonth} className="border-b border-border/60">
                      <td className="py-2 pr-3">{row.yearMonth}</td>
                      <td className="py-2 pr-3 tabular-nums">{formatMoney(row.total)}</td>
                      <td className="py-2 pr-3 tabular-nums">{row.orderCount}</td>
                      <td className="py-2 pr-3 tabular-nums">
                        {row.targetAmount != null ? formatMoney(row.targetAmount) : "—"}
                      </td>
                      <td className="py-2 capitalize">
                        {row.status.replaceAll("_", " ")}
                        {row.percent != null ? ` (${row.percent}%)` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Return rate (MTD)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-xl font-semibold tabular-nums ${
                (data.returns.returnRatePct ?? 0) >= 10
                  ? "text-amber-600 dark:text-amber-400"
                  : ""
              }`}
            >
              {data.returns.returnRatePct != null
                ? `${data.returns.returnRatePct}%`
                : "—"}
            </p>
            <p className="text-muted-foreground text-xs">
              {data.returns.returnOrderCount} returned / {data.returns.orderCount}{" "}
              orders
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Today’s top buyer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold tabular-nums">
              {data.topCustomersToday[0]
                ? formatMoney(data.topCustomersToday[0].total)
                : "—"}
            </p>
            <p className="text-muted-foreground truncate text-xs">
              {data.topCustomersToday[0]?.name ?? "No buyers today"}
            </p>
          </CardContent>
        </Card>
      </div>

      {data.viewerIsAdmin && overviewRows.length > 0 && (
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">All merchants — MTD performance</CardTitle>
            <p className="text-muted-foreground text-xs">
              {hasAnyTarget
                ? "Bars show progress toward each merchant’s monthly target. Click a row to open that merchant."
                : "No targets set yet — bars compare MTD sales to the top merchant this month. Use Assign monthly target at the top after selecting a merchant."}
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div
              className="w-full"
              style={{ height: Math.max(220, overviewRows.length * 28) }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={overviewChart}
                  margin={{ top: 8, right: 12, left: 4, bottom: 8 }}
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={88}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    content={<MerchantChartTooltip />}
                    cursor={{ fill: "rgba(148, 163, 184, 0.15)" }}
                  />
                  {hasAnyTarget && (
                    <Bar dataKey="target" name="Target" fill="#64748b" radius={[0, 4, 4, 0]} />
                  )}
                  <Bar dataKey="sales" name="MTD sales" fill="#14b8a6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <ul className="space-y-3">
              {overviewRows.map((row, index) => {
                const hasTarget = row.targetAmount != null && row.targetAmount > 0;
                const towardTarget = hasTarget
                  ? Math.min(100, Math.round((row.mtdSales / (row.targetAmount as number)) * 1000) / 10)
                  : null;
                const relativeShare = Math.round((row.mtdSales / maxMtd) * 1000) / 10;
                const barPct = hasTarget ? Math.min(100, towardTarget ?? 0) : relativeShare;
                const barColor =
                  hasTarget && (towardTarget ?? 0) >= 100
                    ? "bg-emerald-500"
                    : hasTarget && (towardTarget ?? 0) >= 80
                      ? "bg-teal-500"
                      : hasTarget && (towardTarget ?? 0) >= 50
                        ? "bg-amber-500"
                        : hasTarget
                          ? "bg-sky-500"
                          : "bg-teal-500";

                return (
                  <li key={row.merchantId}>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        setMerchantId(row.merchantId);
                        void reload(row.merchantId);
                      }}
                      className="hover:bg-muted/40 w-full rounded-xl border border-border/60 px-3 py-3 text-left transition-colors disabled:opacity-60"
                    >
                      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="bg-muted text-muted-foreground inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">
                            {index + 1}
                          </span>
                          <span className="truncate font-medium">{row.displayName}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm">
                          <span className="font-semibold tabular-nums">
                            {formatMoney(row.mtdSales)}
                          </span>
                          {hasTarget ? (
                            <span className="text-muted-foreground tabular-nums">
                              / {formatMoney(row.targetAmount as number)} ·{" "}
                              <span className="text-foreground font-medium">
                                {towardTarget}%
                              </span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">No target</span>
                          )}
                        </div>
                      </div>
                      <div className="bg-muted h-2.5 overflow-hidden rounded-full">
                        <div
                          className={`h-full rounded-full transition-all ${barColor}`}
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                      {!hasTarget && row.mtdSales > 0 && (
                        <p className="text-muted-foreground mt-1.5 text-[11px]">
                          {relativeShare}% of top MTD this month
                        </p>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Customer lists</p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showCustomerLists || data.showCustomerLists}
              disabled={isBusy}
              onChange={(e) => {
                const next = e.target.checked;
                setShowCustomerLists(next);
                void reload(merchantId, { showCustomerLists: next });
              }}
            />
            Show daily / lifetime customer lists
          </label>
        </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {showCustomerLists || data.showCustomerLists ? (
          <>
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">Daily top customers</CardTitle>
            <p className="text-muted-foreground text-xs">
              Today ({data.topCustomersTodayYmd}) — your allocated contacts,
              ranked by today’s purchase amount. Grouped by phone or email.
            </p>
          </CardHeader>
          <CardContent>
            {data.topCustomersToday.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No purchases from your allocated contacts today.
              </p>
            ) : (
              <>
                <ul className="space-y-2">
                  {(showAllToday
                    ? data.topCustomersToday
                    : data.topCustomersToday.slice(0, TOP_CUSTOMERS_PREVIEW)
                  ).map((customer, index) => {
                    const maxTotal = Math.max(1, data.topCustomersToday[0]?.total || 1);
                    const share = Math.min(100, (customer.total / maxTotal) * 100);
                    return (
                      <li
                        key={`today-${customer.key}`}
                        className="rounded-xl border border-border/60 px-3 py-2.5"
                      >
                        <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="bg-muted text-muted-foreground inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">
                              {index + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium">{customer.name}</p>
                              <p className="text-muted-foreground truncate text-xs">
                                {customer.phone || customer.email || "—"}
                              </p>
                            </div>
                          </div>
                          <div className="text-right text-sm">
                            <p className="font-semibold tabular-nums">
                              {formatMoney(customer.total)}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              {customer.orderCount} orders today
                            </p>
                          </div>
                        </div>
                        <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                          <div
                            className="h-full rounded-full bg-sky-500"
                            style={{ width: `${share}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {data.topCustomersToday.length > TOP_CUSTOMERS_PREVIEW && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-3 w-full"
                    disabled={isBusy}
                    onClick={() => setShowAllToday((v) => !v)}
                  >
                    {showAllToday
                      ? "Show less"
                      : `View more (${data.topCustomersToday.length - TOP_CUSTOMERS_PREVIEW} more)`}
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">Lifetime top customers</CardTitle>
            <p className="text-muted-foreground text-xs">
              All-time — your allocated contacts only, ranked by purchase value.
              Grouped by phone or email.
            </p>
          </CardHeader>
          <CardContent>
            {data.topCustomersLifetime.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No purchases from your allocated contacts yet.
              </p>
            ) : (
              <>
                <ul className="space-y-2">
                  {(showAllLifetime
                    ? data.topCustomersLifetime
                    : data.topCustomersLifetime.slice(0, TOP_CUSTOMERS_PREVIEW)
                  ).map((customer, index) => {
                    const maxTotal = Math.max(
                      1,
                      data.topCustomersLifetime[0]?.total || 1,
                    );
                    const share = Math.min(
                      100,
                      (customer.total / maxTotal) * 100,
                    );
                    return (
                      <li
                        key={`life-${customer.key}`}
                        className="rounded-xl border border-border/60 px-3 py-2.5"
                      >
                        <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="bg-muted text-muted-foreground inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">
                              {index + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium">{customer.name}</p>
                              <p className="text-muted-foreground truncate text-xs">
                                {customer.phone || customer.email || "—"}
                              </p>
                            </div>
                          </div>
                          <div className="text-right text-sm">
                            <p className="font-semibold tabular-nums">
                              {formatMoney(customer.total)}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              {customer.orderCount} orders
                              {customer.purchaseDays
                                ? ` · ${customer.purchaseDays} purchase days`
                                : ""}
                            </p>
                          </div>
                        </div>
                        <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                          <div
                            className="h-full rounded-full bg-teal-500"
                            style={{ width: `${share}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {data.topCustomersLifetime.length > TOP_CUSTOMERS_PREVIEW && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-3 w-full"
                    disabled={isBusy}
                    onClick={() => setShowAllLifetime((v) => !v)}
                  >
                    {showAllLifetime
                      ? "Show less"
                      : `View more (${data.topCustomersLifetime.length - TOP_CUSTOMERS_PREVIEW} more)`}
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
          </>
        ) : (
          <Card className="lg:col-span-2">
            <CardContent className="text-muted-foreground py-6 text-sm">
              Daily and lifetime customer lists are hidden. Turn on the checkbox
              above when you need them.
            </CardContent>
          </Card>
        )}
      </div>
      </div>

      <Dialog
        open={wishContact != null}
        onOpenChange={(open) => {
          if (!open && busyKey !== "wish-sms") setWishContact(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Birthday wish{wishContact ? ` — ${wishContact.name}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-muted-foreground text-xs font-medium">
                  Discount %
                </label>
                <Input
                  type="number"
                  min={0}
                  max={50}
                  disabled={isBusy}
                  value={wishDiscount}
                  onChange={(e) => {
                    setWishDiscount(e.target.value);
                    if (!wishContact) return;
                    const pct = Number(e.target.value) || 0;
                    setWishMessage(
                      buildBirthdayWishMessage({
                        customerName: wishContact.name,
                        merchantName: data.profile.displayName,
                        discountPercent: pct,
                        code: wishCode || null,
                      }),
                    );
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-muted-foreground text-xs font-medium">
                  Discount code (optional)
                </label>
                <Input
                  disabled={isBusy}
                  value={wishCode}
                  onChange={(e) => {
                    setWishCode(e.target.value);
                    if (!wishContact) return;
                    const pct = Number(wishDiscount) || 0;
                    setWishMessage(
                      buildBirthdayWishMessage({
                        customerName: wishContact.name,
                        merchantName: data.profile.displayName,
                        discountPercent: pct,
                        code: e.target.value || null,
                      }),
                    );
                  }}
                  placeholder="e.g. BD10"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-muted-foreground text-xs font-medium">
                SMS message
              </label>
              <Textarea
                disabled={isBusy}
                value={wishMessage}
                onChange={(e) => setWishMessage(e.target.value)}
                rows={5}
                className="min-h-28"
              />
              <p className="text-muted-foreground text-[11px]">
                Edit freely before send. One wish per phone per year.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isBusy}
              onClick={() => setWishContact(null)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={isBusy} onClick={() => void sendWish()}>
              {busyKey === "wish-sms" ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Sending...
                </>
              ) : (
                "Send SMS"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">Call center performance</CardTitle>
            <p className="text-muted-foreground text-xs">
              Your contact updates in the selected date range.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">From</span>
              <Input
                type="date"
                value={rangeFrom}
                disabled={isBusy}
                onChange={(e) => setRangeFrom(e.target.value)}
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">To</span>
              <Input
                type="date"
                value={rangeTo}
                disabled={isBusy}
                onChange={(e) => setRangeTo(e.target.value)}
              />
            </label>
            <Button
              type="button"
              size="sm"
              disabled={isBusy}
              onClick={() =>
                void reload(merchantId, { fromDate: rangeFrom, toDate: rangeTo })
              }
            >
              Apply range
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {(data.callCenterPerformance ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">No updates in this range.</p>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={(data.callCenterPerformance ?? []).map((row) => ({
                    category: row.category,
                    count: row.count,
                    fill: callCenterCategoryColor(row.category),
                  }))}
                  margin={{ top: 8, right: 8, left: 0, bottom: 48 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="category"
                    tick={{ fontSize: 11 }}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                    height={56}
                  />
                  <YAxis allowDecimals={false} width={36} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {(data.callCenterPerformance ?? []).map((row, i) => (
                      <Cell
                        key={`${row.category}-${i}`}
                        fill={callCenterCategoryColor(row.category, i)}
                      />
                    ))}
                    <LabelList dataKey="count" position="top" className="fill-foreground text-[10px]" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">Daily sales invoices</CardTitle>
            <p className="text-muted-foreground text-xs">
              Invoices attributed to you (order-placed merchant). Allocated
              merchant is shown from Contact Master when the customer is assigned.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              value={invoiceDay}
              disabled={isBusy}
              className="w-auto"
              onChange={(e) => {
                const next = e.target.value;
                if (next) void loadDailyInvoices(next);
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isBusy || dailyInvoices.length === 0}
              onClick={exportDailyInvoicesCsv}
              className="gap-2"
            >
              <Download aria-hidden />
              Export CSV
            </Button>
            {busyKey === "daily-invoices" ? (
              <Loader2 className="text-muted-foreground size-4 animate-spin" aria-hidden />
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Day total:</span>{" "}
              <span className="font-medium tabular-nums">
                {formatMoney(dailyInvoicesTotal)}
              </span>
            </p>
            <p className="text-muted-foreground">
              {dailyInvoicesOrderCount} invoice
              {dailyInvoicesOrderCount === 1 ? "" : "s"} · {invoiceDay}
            </p>
          </div>
          {busyKey === "daily-invoices" ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Loading invoices...
            </p>
          ) : dailyInvoices.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No sales invoices for this day.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left">
                    <th className="py-2 pr-3 font-medium">Time</th>
                    <th className="py-2 pr-3 font-medium">Invoice</th>
                    <th className="py-2 pr-3 font-medium">Customer</th>
                    <th className="py-2 pr-3 font-medium">Phone</th>
                    <th className="py-2 pr-3 font-medium">Amount</th>
                    <th className="py-2 pr-3 font-medium">Location</th>
                    <th className="py-2 font-medium">Allocated merchant</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyInvoices.map((row) => (
                    <tr key={row.orderId} className="border-b border-border/60">
                      <td className="py-2 pr-3 tabular-nums whitespace-nowrap">
                        {formatAppTime(row.createdAt)}
                      </td>
                      <td className="py-2 pr-3 font-medium whitespace-nowrap">
                        {row.invoiceLabel}
                      </td>
                      <td className="py-2 pr-3">{row.customerName}</td>
                      <td className="py-2 pr-3 tabular-nums whitespace-nowrap">
                        {row.customerPhone ?? "—"}
                      </td>
                      <td className="py-2 pr-3 tabular-nums whitespace-nowrap">
                        {formatMoney(row.amount)}
                      </td>
                      <td className="py-2 pr-3">{row.locationName}</td>
                      <td className="py-2">
                        {row.allocatedMerchant ? (
                          <span
                            className={
                              row.allocationMismatch
                                ? "text-amber-700 dark:text-amber-400"
                                : undefined
                            }
                          >
                            {row.allocatedMerchant}
                            {row.allocationMismatch ? (
                              <span className="text-muted-foreground ml-1 text-xs">
                                (other)
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {data.viewerIsAdmin ? (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Target assignment history</CardTitle>
        </CardHeader>
        <CardContent>
          {data.history.length === 0 ? (
            <p className="text-muted-foreground text-sm">No targets assigned yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left">
                    <th className="py-2 pr-3 font-medium">Month</th>
                    <th className="py-2 pr-3 font-medium">Target</th>
                    <th className="py-2 pr-3 font-medium">Achieved</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Assigned by</th>
                    <th className="py-2 font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {data.history.map((row) => (
                    <tr key={row.id} className="border-b border-border/60">
                      <td className="py-2 pr-3">{row.yearMonth}</td>
                      <td className="py-2 pr-3">{formatMoney(row.targetAmount)}</td>
                      <td className="py-2 pr-3">
                        {row.achievedAmount != null
                          ? formatMoney(row.achievedAmount)
                          : "—"}
                      </td>
                      <td className="py-2 pr-3 capitalize">
                        {row.status.replaceAll("_", " ")}
                      </td>
                      <td className="py-2 pr-3">{row.assignedByName ?? "—"}</td>
                      <td className="py-2">
                        {row.assignedAt
                          ? new Date(row.assignedAt).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      ) : null}
    </div>
  );
}
