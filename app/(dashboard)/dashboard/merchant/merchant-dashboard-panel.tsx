"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Cake, Crown, Download, History, Loader2, Phone, Target, AlertTriangle } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer } from "@/components/ui/chart";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  CALL_CENTER_CATEGORY_VALUES,
  callCenterCategoryColor,
} from "@/lib/contact-call-center-categories";
import { formatAppTime } from "@/lib/format-datetime";
import { notify } from "@/lib/notify";
import { loyaltyProfileIncompleteMessage } from "@/lib/customer-insight/loyalty-profile-complete";
import { buildBirthdayWishMessage } from "@/lib/page-data/merchant-birthday-wish-message";
import type { CallQueueRowDto } from "@/lib/customer-insight/call-queue";
import type { MerchantDashboardPageData } from "@/lib/page-data/merchant-dashboard";
import { resolveEffectiveTotalTarget } from "@/lib/merchant-dashboard/channel-sales";
import type { MerchantDailyInvoiceRow } from "@/lib/page-data/merchant-dashboard-sales";
import type { MerchantSalesMovement } from "@/lib/page-data/merchant-dashboard-sales-movement";

function parsePositiveTargetInput(value: string): number | null {
  if (!value.trim()) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function combinedTargetFromChannelInputs(shop: string, online: string): string | null {
  const combined = resolveEffectiveTotalTarget({
    targetAmount: null,
    shopTargetAmount: parsePositiveTargetInput(shop),
    onlineTargetAmount: parsePositiveTargetInput(online),
  });
  if (combined == null) return null;
  return String(Math.round(combined));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatChannelSubline(parts: Array<string | null | undefined>) {
  const text = parts.filter(Boolean).join(" · ");
  return text || null;
}

function formatPercentOneDecimal(value: number | null) {
  if (value == null) return null;
  return `${Math.round(value * 10) / 10}%`;
}

function formatScorecardTargetSubline(input: {
  periodPreset: "today" | "mtd" | "custom";
  periodLabel: string;
  periodTargetAmount: number | null;
  dailyTargetAmount: number | null;
  monthlyTargetAmount: number | null;
}) {
  if (input.periodTargetAmount == null || input.periodTargetAmount <= 0) {
    return null;
  }
  if (input.periodPreset === "today") {
    return `Today ${formatMoney(input.periodTargetAmount)}`;
  }
  if (input.periodPreset === "mtd") {
    const monthly =
      input.monthlyTargetAmount != null && input.monthlyTargetAmount > 0
        ? ` · Mo ${formatMoney(input.monthlyTargetAmount)}`
        : "";
    return `MTD ${formatMoney(input.periodTargetAmount)}${monthly}`;
  }
  return `${input.periodLabel} ${formatMoney(input.periodTargetAmount)}`;
}

/** Between primary numbers and faint footnotes — readable but clearly subordinate. */
const SCORECARD_SUB =
  "text-foreground/70 text-[11px] leading-snug tabular-nums";
const SCORECARD_SUB_MUTED =
  "text-muted-foreground text-[11px] leading-snug tabular-nums";

type ScorecardSortKey =
  | "default"
  | "shopAmount"
  | "onlineAmount"
  | "totalAmount"
  | "shopPercent"
  | "onlinePercent"
  | "totalPercent";

function toggleScorecardSort(
  current: { key: ScorecardSortKey; dir: "asc" | "desc" },
  nextKey: ScorecardSortKey,
): { key: ScorecardSortKey; dir: "asc" | "desc" } {
  if (current.key !== nextKey) {
    return { key: nextKey, dir: "desc" };
  }
  return { key: nextKey, dir: current.dir === "desc" ? "asc" : "desc" };
}

function healthStatusLabel(status: "green" | "amber" | "red") {
  if (status === "green") return "On track";
  if (status === "amber") return "Watch";
  return "At risk";
}

function healthStatusClass(status: "green" | "amber" | "red") {
  if (status === "green") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
  if (status === "amber") return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return "bg-red-500/15 text-red-700 dark:text-red-400";
}

function paceStatusLabel(status: "on_pace" | "behind" | "ahead" | "no_target") {
  if (status === "ahead") return "Ahead";
  if (status === "behind") return "Behind";
  if (status === "on_pace") return "On pace";
  return "—";
}

function formatQueueDate(iso: string | null | undefined) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString();
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

function renderActiveCohortDonutShape(props: {
  cx?: number;
  cy?: number;
  innerRadius?: number;
  outerRadius?: number;
  startAngle?: number;
  endAngle?: number;
  fill?: string;
  midAngle?: number;
}) {
  const {
    cx = 0,
    cy = 0,
    innerRadius = 90,
    outerRadius = 118,
    startAngle = 0,
    endAngle = 0,
    fill,
    midAngle = 0,
  } = props;

  const sweepAngle = Math.abs(endAngle - startAngle);
  const isFullCircle = sweepAngle >= 359;
  const radians = (-midAngle * Math.PI) / 180;
  const offsetDistance = isFullCircle ? 0 : 12;
  const offsetX = Math.cos(radians) * offsetDistance;
  const offsetY = Math.sin(radians) * offsetDistance;

  return (
    <g>
      <Sector
        cx={cx + offsetX}
        cy={cy + offsetY}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx + offsetX}
        cy={cy + offsetY}
        innerRadius={outerRadius + 10}
        outerRadius={outerRadius + 16}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        opacity={0.3}
      />
    </g>
  );
}

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
  const [shopTargetInput, setShopTargetInput] = useState(
    initialData.target.shopTargetAmount != null && initialData.target.shopTargetAmount > 0
      ? String(Math.round(initialData.target.shopTargetAmount))
      : "",
  );
  const [onlineTargetInput, setOnlineTargetInput] = useState(
    initialData.target.onlineTargetAmount != null &&
      initialData.target.onlineTargetAmount > 0
      ? String(Math.round(initialData.target.onlineTargetAmount))
      : "",
  );
  const [wholesaleTargetInput, setWholesaleTargetInput] = useState(
    initialData.wholesaleTarget != null &&
      initialData.wholesaleTarget.targetAmount > 0
      ? String(Math.round(initialData.wholesaleTarget.targetAmount))
      : "",
  );
  const [scorecardSort, setScorecardSort] = useState<{
    key: ScorecardSortKey;
    dir: "asc" | "desc";
  }>({ key: "default", dir: "desc" });
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [showAllToday, setShowAllToday] = useState(false);
  const [showAllLifetime, setShowAllLifetime] = useState(false);
  const [peerPeriod, setPeerPeriod] = useState<"today" | "mtd">("today");
  const [cohortPieActiveIndex, setCohortPieActiveIndex] = useState<number | null>(
    null,
  );
  const [dailyHistoryChartType, setDailyHistoryChartType] = useState<
    "bar" | "line"
  >("bar");
  const [locationSharePeriod, setLocationSharePeriod] = useState<"today" | "mtd">(
    "mtd",
  );
  /** Empty = hide charts until user picks a location. */
  const [locationShareId, setLocationShareId] = useState<string>("");
  const [wishContact, setWishContact] = useState<
    MerchantDashboardPageData["nearestBirthdays"][number] | null
  >(null);
  const [wishDiscount, setWishDiscount] = useState("10");
  const [wishCode, setWishCode] = useState("");
  const [wishMessage, setWishMessage] = useState("");
  const [callUpdateRow, setCallUpdateRow] = useState<CallQueueRowDto | null>(null);
  const [callOutcome, setCallOutcome] = useState("N/A");
  const [callRemark, setCallRemark] = useState("");
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
  const [salesChangeOpen, setSalesChangeOpen] = useState(false);
  const [salesMovement, setSalesMovement] = useState<MerchantSalesMovement | null>(
    null,
  );
  const [salesMovementLoading, setSalesMovementLoading] = useState(false);
  const [salesChangePeriod, setSalesChangePeriod] = useState<"today" | "mtd">(
    "mtd",
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
  const [dashboardTab, setDashboardTab] = useState<"merchant" | "admin">("merchant");
  const isBusy = busyKey !== null || isPending;
  const showAdminTab = data.viewerIsAdmin || data.canManageTargets;
  const channelTargetsActive =
    parsePositiveTargetInput(shopTargetInput) != null ||
    parsePositiveTargetInput(onlineTargetInput) != null;

  function handleShopTargetChange(value: string) {
    setShopTargetInput(value);
    const synced = combinedTargetFromChannelInputs(value, onlineTargetInput);
    if (synced != null) setTargetInput(synced);
  }

  function handleOnlineTargetChange(value: string) {
    setOnlineTargetInput(value);
    const synced = combinedTargetFromChannelInputs(shopTargetInput, value);
    if (synced != null) setTargetInput(synced);
  }

  useEffect(() => {
    setData(initialData);
    setMerchantId(initialData.selectedMerchantId);
    setTargetInput(
      initialData.target.targetAmount > 0
        ? String(Math.round(initialData.target.targetAmount))
        : "",
    );
    setShopTargetInput(
      initialData.target.shopTargetAmount != null &&
        initialData.target.shopTargetAmount > 0
        ? String(Math.round(initialData.target.shopTargetAmount))
        : "",
    );
    setOnlineTargetInput(
      initialData.target.onlineTargetAmount != null &&
        initialData.target.onlineTargetAmount > 0
        ? String(Math.round(initialData.target.onlineTargetAmount))
        : "",
    );
    setWholesaleTargetInput(
      initialData.wholesaleTarget != null &&
        initialData.wholesaleTarget.targetAmount > 0
        ? String(Math.round(initialData.wholesaleTarget.targetAmount))
        : "",
    );
    setShowAllToday(false);
    setShowAllLifetime(false);
    setInvoiceDay(initialData.dailyInvoicesYmd);
    setDailyInvoices(initialData.dailyInvoices);
    setDailyInvoicesTotal(initialData.dailyInvoicesTotal);
    setDailyInvoicesOrderCount(initialData.dailyInvoicesOrderCount);
    setLocationShareId("");
    setSalesChangeOpen(false);
    setSalesMovement(null);
    setSalesChangePeriod("mtd");
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
        setShopTargetInput(
          json.target.shopTargetAmount != null && json.target.shopTargetAmount > 0
            ? String(Math.round(json.target.shopTargetAmount))
            : "",
        );
        setOnlineTargetInput(
          json.target.onlineTargetAmount != null &&
            json.target.onlineTargetAmount > 0
            ? String(Math.round(json.target.onlineTargetAmount))
            : "",
        );
        setWholesaleTargetInput(
          json.wholesaleTarget != null && json.wholesaleTarget.targetAmount > 0
            ? String(Math.round(json.wholesaleTarget.targetAmount))
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
        setSalesMovement(null);
      });
    } catch {
      notify.error("Failed to load merchant dashboard");
    } finally {
      setBusyKey(null);
    }
  }

  async function openSalesChange() {
    setSalesChangeOpen(true);
    setSalesMovementLoading(true);
    try {
      const params = new URLSearchParams({
        merchantUserId: merchantId,
      });
      const res = await fetch(
        `/api/admin/merchant-dashboard/sales-movement?${params}`,
      );
      const json = await res.json();
      if (!res.ok) {
        notify.error(json.error ?? "Failed to load sales change");
        return;
      }
      setSalesMovement(json as MerchantSalesMovement);
    } catch {
      notify.error("Failed to load sales change");
    } finally {
      setSalesMovementLoading(false);
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
      "Discount coupon",
      "Merchant coupon",
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
          row.discountCouponCode ?? "",
          row.merchantCouponCode ?? "",
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
    const amount = targetInput.trim() ? Number(targetInput) : null;
    const shopAmount = shopTargetInput.trim() ? Number(shopTargetInput) : null;
    const onlineAmount = onlineTargetInput.trim()
      ? Number(onlineTargetInput)
      : null;
    const wholesaleAmount = wholesaleTargetInput.trim()
      ? Number(wholesaleTargetInput)
      : null;

    const hasCombined = amount != null && Number.isFinite(amount) && amount > 0;
    const hasShop =
      shopAmount != null && Number.isFinite(shopAmount) && shopAmount > 0;
    const hasOnline =
      onlineAmount != null && Number.isFinite(onlineAmount) && onlineAmount > 0;
    const hasWholesale =
      wholesaleAmount != null &&
      Number.isFinite(wholesaleAmount) &&
      wholesaleAmount > 0;
    const sendCombined = hasCombined && !hasShop && !hasOnline;

    if (!sendCombined && !hasShop && !hasOnline && !hasWholesale) {
      notify.error("Enter a combined target, shop/online targets, or wholesale target");
      return;
    }
    if (
      (amount != null && (!Number.isFinite(amount) || amount <= 0)) ||
      (shopAmount != null && (!Number.isFinite(shopAmount) || shopAmount <= 0)) ||
      (onlineAmount != null &&
        (!Number.isFinite(onlineAmount) || onlineAmount <= 0)) ||
      (wholesaleAmount != null &&
        (!Number.isFinite(wholesaleAmount) || wholesaleAmount <= 0))
    ) {
      notify.error("Target amounts must be positive numbers");
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
          ...(sendCombined ? { targetAmount: amount } : {}),
          ...(hasShop ? { shopTargetAmount: shopAmount } : {}),
          ...(hasOnline ? { onlineTargetAmount: onlineAmount } : {}),
          ...(hasWholesale ? { wholesaleTargetAmount: wholesaleAmount } : {}),
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

  function openCallUpdate(row: CallQueueRowDto) {
    setCallUpdateRow(row);
    setCallOutcome("N/A");
    setCallRemark("");
  }

  async function submitCallUpdate() {
    if (!callUpdateRow) return;
    if (!callOutcome.trim()) {
      notify.error("Select a call outcome.");
      return;
    }
    setBusyKey("call-update");
    try {
      const res = await fetch("/api/admin/merchant-dashboard/call-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: callUpdateRow.contactId,
          category: callOutcome,
          remark: callRemark.trim() || null,
          merchantUserId: merchantId,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(
          typeof json.error === "string" ? json.error : "Failed to save call update",
        );
        return;
      }
      notify.success(`Saved outcome: ${json.category ?? callOutcome}`);
      setCallUpdateRow(null);
      await reload(merchantId);
    } catch {
      notify.error("Failed to save call update");
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
  const overviewRows = [...(data.overview ?? [])].sort((a, b) => {
    const aHasTarget = a.targetAmount != null && a.targetAmount > 0;
    const bHasTarget = b.targetAmount != null && b.targetAmount > 0;
    const aRate = aHasTarget ? a.mtdSales / (a.targetAmount as number) : -1;
    const bRate = bHasTarget ? b.mtdSales / (b.targetAmount as number) : -1;
    if (bRate !== aRate) return bRate - aRate;
    if (b.mtdSales !== a.mtdSales) return b.mtdSales - a.mtdSales;
    return a.displayName.localeCompare(b.displayName);
  });
  const isCustomGmPeriod =
    data.rangeFromYmd !== data.fromYmd || data.rangeToYmd !== data.toYmd;
  const gmPeriodLabel = data.gmChannelFooter?.periodLabel ?? "MTD";
  const gmPeriodPreset = useMemo((): "today" | "mtd" | "custom" => {
    if (rangeFrom === data.today.ymd && rangeTo === data.today.ymd) {
      return "today";
    }
    if (rangeFrom === data.fromYmd && rangeTo === data.toYmd) {
      return "mtd";
    }
    return "custom";
  }, [rangeFrom, rangeTo, data.today.ymd, data.fromYmd, data.toYmd]);

  function applyGmPeriod(preset: "today" | "mtd") {
    if (preset === "today") {
      const day = data.today.ymd;
      setRangeFrom(day);
      setRangeTo(day);
      void reload(merchantId, { fromDate: day, toDate: day });
      return;
    }
    setRangeFrom(data.fromYmd);
    setRangeTo(data.toYmd);
    void reload(merchantId, {
      fromDate: data.fromYmd,
      toDate: data.toYmd,
    });
  }

  function applyGmCustomRange() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rangeFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(rangeTo)) {
      notify.error("Pick valid from and to dates");
      return;
    }
    if (rangeFrom > rangeTo) {
      notify.error("From date must be on or before to date");
      return;
    }
    void reload(merchantId, { fromDate: rangeFrom, toDate: rangeTo });
  }
  const scorecardRows = useMemo(() => {
    const rows = [...(data.overview ?? [])];
    if (scorecardSort.key === "default") {
      return rows.sort((a, b) => {
        const aHasTarget =
          (a.effectiveTotalTarget ?? 0) > 0 || (a.targetAmount ?? 0) > 0;
        const bHasTarget =
          (b.effectiveTotalTarget ?? 0) > 0 || (b.targetAmount ?? 0) > 0;
        const aTarget = a.effectiveTotalTarget ?? a.targetAmount ?? 0;
        const bTarget = b.effectiveTotalTarget ?? b.targetAmount ?? 0;
        const aRate = aHasTarget ? a.periodSales / aTarget : -1;
        const bRate = bHasTarget ? b.periodSales / bTarget : -1;
        if (bRate !== aRate) return bRate - aRate;
        if (b.periodSales !== a.periodSales) return b.periodSales - a.periodSales;
        return a.displayName.localeCompare(b.displayName);
      });
    }
    const dir = scorecardSort.dir === "asc" ? 1 : -1;
    const valueFor = (row: (typeof rows)[number]) => {
      switch (scorecardSort.key) {
        case "shopAmount":
          return row.shop.amount;
        case "onlineAmount":
          return row.online.amount;
        case "totalAmount":
          return row.periodSales;
        case "shopPercent":
          return row.shopPercent ?? -1;
        case "onlinePercent":
          return row.onlinePercent ?? -1;
        case "totalPercent":
          return row.percent ?? -1;
        default:
          return 0;
      }
    };
    return rows.sort((a, b) => {
      const diff = valueFor(a) - valueFor(b);
      if (diff !== 0) return diff * dir;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [data.overview, scorecardSort]);
  const overviewChartRows = [...(data.overview ?? [])].sort(
    (a, b) => b.mtdSales - a.mtdSales,
  );
  const maxOverviewSales = Math.max(
    1,
    ...overviewRows.map((row) => row.mtdSales),
  );
  const hasAnyTarget = overviewRows.some(
    (row) => row.targetAmount != null && row.targetAmount > 0,
  );
  const overviewChart = overviewChartRows.map((row) => ({
    name: row.displayName,
    sales: row.mtdSales,
    ...(hasAnyTarget ? { target: row.targetAmount ?? 0 } : {}),
  }));
  const activePeerBoard =
    peerPeriod === "today" ? data.peerBoards.today : data.peerBoards.mtd;
  const peerEntriesWithSales = activePeerBoard.entries.filter(
    (entry) => entry.total > 0,
  );
  const peerBarChart = peerEntriesWithSales.map((entry) => ({
    name: entry.isViewed ? `${entry.displayName} (you)` : entry.displayName,
    sales: entry.total,
    orders: entry.orderCount,
    isViewed: entry.isViewed,
    fill: entry.isViewed ? SELF_SHARE_COLOR : "#64748b",
  }));
  const peerCohortTotal = peerEntriesWithSales.reduce((s, e) => s + e.total, 0);
  const peerSharePie = peerEntriesWithSales.map((entry, i) => ({
    key: `peer-${entry.merchantId}`,
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
  const cohortPieChartConfig = peerSharePie.reduce<ChartConfig>((config, slice) => {
    config[slice.key] = { label: slice.name, color: slice.fill };
    return config;
  }, {});
  const cohortPieFocus =
    peerSharePie[
      cohortPieActiveIndex == null
        ? 0
        : Math.min(cohortPieActiveIndex, Math.max(0, peerSharePie.length - 1))
    ] ?? null;
  const peerPodium = activePeerBoard.entries
    .filter((entry) => !entry.excludeFromRace)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 3);
  const peerBarHeight = Math.max(180, peerBarChart.length * 34);
  const locationShareOptions = (() => {
    const byId = new Map<string, string>();
    for (const row of [...data.locationShare.mtd, ...data.locationShare.today]) {
      if (!byId.has(row.locationId)) {
        byId.set(row.locationId, row.locationName);
      }
    }
    return [...byId.entries()].map(([locationId, locationName]) => ({
      locationId,
      locationName,
    }));
  })();
  const periodLocationShare =
    locationSharePeriod === "today"
      ? data.locationShare.today
      : data.locationShare.mtd;
  const activeLocationShare = locationShareId
    ? periodLocationShare.filter((loc) => loc.locationId === locationShareId)
    : [];
  const activeCosmeticsLkBreakdown =
    locationSharePeriod === "today"
      ? data.cosmeticsLkBreakdown.today
      : data.cosmeticsLkBreakdown.mtd;
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
            {data.viewedMerchantChannelMtd.shop.amount > 0 ||
            data.viewedMerchantChannelMtd.online.amount > 0 ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {data.viewedMerchantChannelMtd.shop.amount > 0 ? (
                  <span className="bg-muted text-muted-foreground inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums">
                    Shop MTD {formatMoney(data.viewedMerchantChannelMtd.shop.amount)}
                    {" · "}
                    {data.viewedMerchantChannelMtd.shop.orderCount} orders
                  </span>
                ) : null}
                {data.viewedMerchantChannelMtd.online.amount > 0 ? (
                  <span className="bg-muted text-muted-foreground inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums">
                    Online MTD{" "}
                    {formatMoney(data.viewedMerchantChannelMtd.online.amount)}
                    {" · "}
                    {data.viewedMerchantChannelMtd.online.orderCount} orders
                  </span>
                ) : null}
              </div>
            ) : null}
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

        </div>
      </section>

      {showAdminTab ? (
        <Tabs
          value={dashboardTab}
          onValueChange={(value) =>
            setDashboardTab(value as "merchant" | "admin")
          }
          className="gap-4"
        >
          <TabsList className="h-auto w-full justify-start gap-1 sm:w-fit">
            <TabsTrigger value="merchant">Merchant view</TabsTrigger>
            <TabsTrigger value="admin">GM view</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}

      <div
        className={
          showAdminTab && dashboardTab !== "merchant"
            ? "hidden"
            : "space-y-6"
        }
      >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="text-muted-foreground"
          disabled={salesMovementLoading}
          onClick={() => void openSalesChange()}
        >
          {salesMovementLoading ? (
            <>
              <Loader2 className="animate-spin" aria-hidden />
              Loading...
            </>
          ) : (
            <>
              <History aria-hidden />
              How sales changed
            </>
          )}
        </Button>
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
              {data.sales.merTargetPercent != null ? (
                <p className="text-sm font-medium tabular-nums text-teal-700 dark:text-teal-400">
                  {Math.round(data.sales.merTargetPercent)}% of target
                </p>
              ) : null}
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
              {data.sales.dmTargetPercent != null ? (
                <p className="text-sm font-medium tabular-nums text-teal-700 dark:text-teal-400">
                  {Math.round(data.sales.dmTargetPercent)}% of target
                </p>
              ) : null}
              <p className="text-muted-foreground text-xs">
                {data.sales.dmOrderCount} orders · DM MER + orders with no MER
                code
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {data.sales.hasWholesale ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Wholesale total (MTD)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold tabular-nums">
              {formatMoney(data.sales.wholesaleTotal)}
            </p>
            {data.sales.wholesaleTargetPercent != null ? (
              <p className="text-sm font-medium tabular-nums text-teal-700 dark:text-teal-400">
                {Math.round(data.sales.wholesaleTargetPercent)}% of wholesale target
              </p>
            ) : null}
            {data.wholesaleTarget ? (
              <p className="text-muted-foreground text-xs">
                Target {formatMoney(data.wholesaleTarget.targetAmount)} ·{" "}
                {data.sales.wholesaleOrderCount} WH orders
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">
                {data.sales.wholesaleOrderCount} orders on your WH codes
              </p>
            )}
          </CardContent>
        </Card>
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
              onClick={() => {
                setPeerPeriod("today");
                setCohortPieActiveIndex(null);
              }}
            >
              Today
            </Button>
            <Button
              type="button"
              size="sm"
              variant={peerPeriod === "mtd" ? "default" : "outline"}
              disabled={isBusy}
              onClick={() => {
                setPeerPeriod("mtd");
                setCohortPieActiveIndex(null);
              }}
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
                <div className="flex flex-col items-center gap-3 rounded-xl border border-border/60 p-3 sm:p-4">
                  {peerSharePie.length === 0 ? (
                    <p className="text-muted-foreground py-10 text-center text-sm">
                      No sales in this cohort yet — first sale lights up the board.
                    </p>
                  ) : (
                    <>
                      <p className="text-muted-foreground self-start text-xs font-medium uppercase tracking-wide">
                        Cohort share
                      </p>
                      <div className="mx-auto h-[20rem] w-[20rem] max-w-full">
                        <ChartContainer
                          id="merchant-cohort-share-donut"
                          config={cohortPieChartConfig}
                          className="mx-auto aspect-square h-full w-full"
                        >
                          <PieChart>
                            <Pie
                              data={peerSharePie}
                              dataKey="value"
                              nameKey="key"
                              cx="50%"
                              cy="50%"
                              innerRadius={90}
                              outerRadius={118}
                              paddingAngle={2}
                              strokeWidth={0}
                              activeIndex={cohortPieActiveIndex ?? undefined}
                              activeShape={renderActiveCohortDonutShape}
                              isAnimationActive
                              animationDuration={260}
                              onMouseEnter={(_, index) =>
                                setCohortPieActiveIndex(index)
                              }
                              onMouseLeave={() => setCohortPieActiveIndex(null)}
                            >
                              {peerSharePie.map((slice) => (
                                <Cell key={slice.key} fill={slice.fill} />
                              ))}
                              <Label
                                content={({ viewBox }) => {
                                  if (
                                    !(
                                      viewBox &&
                                      "cx" in viewBox &&
                                      "cy" in viewBox
                                    )
                                  ) {
                                    return null;
                                  }
                                  return (
                                    <text
                                      x={viewBox.cx}
                                      y={viewBox.cy}
                                      textAnchor="middle"
                                      dominantBaseline="middle"
                                    >
                                      <tspan
                                        x={viewBox.cx}
                                        y={(viewBox.cy || 0) - 28}
                                        className="fill-muted-foreground text-[10px] uppercase"
                                      >
                                        Merchant
                                      </tspan>
                                      <tspan
                                        x={viewBox.cx}
                                        y={(viewBox.cy || 0) - 4}
                                        className="fill-foreground text-[12px] font-semibold"
                                      >
                                        {cohortPieFocus?.name ?? "Hover"}
                                      </tspan>
                                      <tspan
                                        x={viewBox.cx}
                                        y={(viewBox.cy || 0) + 22}
                                        className="fill-foreground text-[17px] font-bold"
                                      >
                                        {cohortPieFocus
                                          ? formatMoney(cohortPieFocus.value)
                                          : ""}
                                      </tspan>
                                      <tspan
                                        x={viewBox.cx}
                                        y={(viewBox.cy || 0) + 44}
                                        className="fill-muted-foreground text-[12px] font-semibold"
                                      >
                                        {cohortPieFocus?.pct != null
                                          ? `${cohortPieFocus.pct}%`
                                          : ""}
                                      </tspan>
                                    </text>
                                  );
                                }}
                              />
                            </Pie>
                          </PieChart>
                        </ChartContainer>
                      </div>
                      <ul className="flex w-full flex-wrap justify-center gap-x-3 gap-y-1 text-xs">
                        {peerSharePie.map((slice, index) => (
                          <li key={slice.key}>
                            <button
                              type="button"
                              className={`inline-flex items-center gap-1.5 rounded px-1 py-0.5 transition-colors ${
                                cohortPieActiveIndex === index
                                  ? "bg-muted"
                                  : "hover:bg-muted/60"
                              }`}
                              onMouseEnter={() => setCohortPieActiveIndex(index)}
                              onMouseLeave={() => setCohortPieActiveIndex(null)}
                              onFocus={() => setCohortPieActiveIndex(index)}
                              onBlur={() => setCohortPieActiveIndex(null)}
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
                                {slice.pct != null
                                  ? `${slice.pct}%`
                                  : formatMoney(slice.value)}
                              </span>
                            </button>
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
          <CardTitle className="text-base">Assigned call updates</CardTitle>
          <p className="text-muted-foreground text-xs">
            Customers admin assigned for you to call. Save outcome here — it updates
            Contact Master and your call center performance chart.
          </p>
        </CardHeader>
        <CardContent>
          {(data.callUpdateQueue ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No assigned call-update contacts right now.
            </p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {(data.callUpdateQueue ?? []).map((row) => (
                <li
                  key={row.contactId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="bg-muted text-muted-foreground inline-flex size-8 shrink-0 items-center justify-center rounded-full">
                      <Phone className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{row.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {row.phoneNumber ?? "No phone"} · tot {formatMoney(row.lifetimeTotal)}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        Last contacted {formatQueueDate(row.lastContactedAt)} · last purchased{" "}
                        {formatQueueDate(row.lastPurchaseAt)}
                      </p>
                    </div>
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
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={isBusy}
                      onClick={() => openCallUpdate(row)}
                    >
                      Call update
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

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
              Pick one outlet. Donut = share of location total; bars = amounts.
              All merchants shown for Today / MTD.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={locationShareId || undefined}
              onValueChange={setLocationShareId}
              disabled={isBusy || locationShareOptions.length === 0}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                {locationShareOptions.map((opt) => (
                  <SelectItem key={opt.locationId} value={opt.locationId}>
                    {opt.locationName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {locationShareId ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={isBusy}
                onClick={() => setLocationShareId("")}
              >
                Clear
              </Button>
            ) : null}
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
          {!locationShareId ? (
            <p className="text-muted-foreground text-sm">
              Select a location to load share for that outlet only.
            </p>
          ) : activeLocationShare.length === 0 ? (
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

                {activeCosmeticsLkBreakdown &&
                loc.locationId === activeCosmeticsLkBreakdown.locationId ? (
                  <div className="mt-4 border-t border-border/50 pt-4">
                    <p className="mb-1 text-sm font-medium">Your order mix</p>
                    <p className="text-muted-foreground mb-3 text-xs">
                      Your attributed orders only. Source = how placed; gateway =
                      payment; VAT = items tagged VAT - Top Priority Brand.
                    </p>
                    {activeCosmeticsLkBreakdown.selfOrderCount === 0 ? (
                      <p className="text-muted-foreground text-sm">
                        No orders for you in this period.
                      </p>
                    ) : (
                      <div className="grid gap-3 md:grid-cols-3">
                        {(
                          [
                            {
                              title: "How placed",
                              rows: activeCosmeticsLkBreakdown.bySource,
                            },
                            {
                              title: "Payment gateway",
                              rows: activeCosmeticsLkBreakdown.byGateway,
                            },
                            {
                              title: "VAT items",
                              rows: activeCosmeticsLkBreakdown.byVatItem,
                            },
                          ] as const
                        ).map((section) => (
                          <div
                            key={section.title}
                            className="rounded-lg bg-muted/40 p-3"
                          >
                            <p className="mb-2 text-xs font-semibold tracking-wide uppercase text-muted-foreground">
                              {section.title}
                            </p>
                            {section.rows.length === 0 ? (
                              <p className="text-muted-foreground text-xs">
                                No data
                              </p>
                            ) : (
                              <ul className="space-y-1.5 text-sm">
                                {section.rows.map((row) => (
                                  <li
                                    key={row.key}
                                    className="flex items-baseline justify-between gap-2"
                                  >
                                    <span className="text-muted-foreground truncate">
                                      {row.label}
                                      {row.orderCount > 0 ? (
                                        <span className="ml-1 text-xs">
                                          ({row.orderCount})
                                        </span>
                                      ) : null}
                                    </span>
                                    <span className="shrink-0 font-medium tabular-nums">
                                      {formatMoney(row.total)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
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
        open={salesChangeOpen}
        onOpenChange={(open) => {
          setSalesChangeOpen(open);
          if (!open) {
            setSalesMovement(null);
            setSalesChangePeriod("mtd");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>How sales changed</DialogTitle>
            <DialogDescription>
              {salesChangePeriod === "mtd"
                ? "Every invoice this month, minus voids and returns. Matches this month (MTD)."
                : "Through yesterday, then today's invoices, minus voids and returns."}
            </DialogDescription>
          </DialogHeader>
          {salesMovementLoading && !salesMovement ? (
            <div className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
              <Loader2 className="animate-spin" aria-hidden />
              Loading...
            </div>
          ) : salesMovement ? (
            <div className="space-y-3">
              <Tabs
                value={salesChangePeriod}
                onValueChange={(value) =>
                  setSalesChangePeriod(value as "today" | "mtd")
                }
              >
                <TabsList className="h-auto w-full justify-start gap-1 sm:w-fit">
                  <TabsTrigger value="today">Today</TabsTrigger>
                  <TabsTrigger value="mtd">MTD</TabsTrigger>
                </TabsList>
              </Tabs>
              {(() => {
                const view =
                  salesChangePeriod === "mtd"
                    ? salesMovement.mtd
                    : salesMovement.today;
                const isMtd = salesChangePeriod === "mtd";
                return (
            <div className="max-h-[60vh] space-y-3 overflow-y-auto text-sm">
              {view.openingLabel ? (
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground">
                  {view.openingLabel}
                </span>
                <span className="tabular-nums">
                  {formatMoney(view.openingTotal)}
                </span>
              </div>
              ) : null}
              {view.additions.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    {isMtd ? "Invoices this month" : "Added today"}
                  </p>
                  {view.additions.map((line, index) => (
                    <div
                      key={`add-${index}-${line.invoiceLabel}`}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <span className="truncate">
                        + {line.invoiceLabel}
                        {isMtd && line.ymd ? (
                          <span className="text-muted-foreground"> {line.ymd}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 tabular-nums text-teal-700 dark:text-teal-400">
                        {formatMoney(line.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">
                  {isMtd ? "No invoices this month" : "No new invoices today"}
                </p>
              )}
              {view.removals.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    {isMtd ? "Voids / returns this month" : "Left today"}
                  </p>
                  {view.removals.map((line, index) => (
                    <div
                      key={`rm-${index}-${line.invoiceLabel}`}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <span className="truncate">
                        − {line.invoiceLabel}
                        <span className="text-muted-foreground">
                          {" "}
                          ({line.reason === "return" ? "return" : "voided"}
                          {isMtd && line.ymd ? ` · ${line.ymd}` : ""})
                        </span>
                      </span>
                      <span className="text-destructive shrink-0 tabular-nums">
                        {formatMoney(line.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">
                  {isMtd
                    ? "No voids or returns this month"
                    : "No voids or returns today"}
                </p>
              )}
              <div className="flex items-baseline justify-between gap-3 border-t pt-2 font-medium">
                <span>{isMtd ? "This month (MTD)" : "Today → MTD"}</span>
                <span className="tabular-nums">
                  {formatMoney(view.closingTotal)}
                </span>
              </div>
              <p className="text-muted-foreground text-xs">
                {isMtd
                  ? `${view.additions.length} invoices · ${view.removals.length} left the count`
                  : `Today counted ${formatMoney(salesMovement.countedToday)} · ${view.additions.length} in + · ${view.removals.length} in −`}
              </p>
            </div>
                );
              })()}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No movement to show.</p>
          )}
        </DialogContent>
      </Dialog>

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

      <Dialog
        open={callUpdateRow != null}
        onOpenChange={(open) => {
          if (!open && busyKey !== "call-update") setCallUpdateRow(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Call update{callUpdateRow ? ` — ${callUpdateRow.name}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {callUpdateRow?.phoneNumber ? (
              <p className="text-muted-foreground text-sm">
                Phone: {callUpdateRow.phoneNumber}
              </p>
            ) : null}
            <div className="space-y-1">
              <label className="text-muted-foreground text-xs font-medium">
                Call outcome
              </label>
              <Select
                value={callOutcome}
                disabled={isBusy}
                onValueChange={setCallOutcome}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select outcome" />
                </SelectTrigger>
                <SelectContent>
                  {CALL_CENTER_CATEGORY_VALUES.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-muted-foreground text-xs font-medium">
                Remark (optional)
              </label>
              <Input
                disabled={isBusy}
                value={callRemark}
                onChange={(e) => setCallRemark(e.target.value)}
                placeholder="Optional remark"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isBusy}
              onClick={() => setCallUpdateRow(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isBusy}
              onClick={() => void submitCallUpdate()}
            >
              {busyKey === "call-update" ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Saving…
                </>
              ) : (
                "Save outcome"
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
                    <th className="py-2 pr-3 font-medium">Coupon</th>
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
                      <td className="py-2 pr-3 text-xs">
                        {[row.discountCouponCode, row.merchantCouponCode]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </td>
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
      </div>

      {showAdminTab && dashboardTab === "admin" ? (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-base">Period</CardTitle>
                <p className="text-muted-foreground text-xs">
                  Channel scorecard, footer, and target % use this range.
                  Active: <span className="font-medium">{gmPeriodLabel}</span>
                  {isCustomGmPeriod
                    ? " · monthly targets vs period actuals"
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={gmPeriodPreset === "today" ? "default" : "outline"}
                  disabled={isBusy}
                  onClick={() => applyGmPeriod("today")}
                >
                  Today
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={gmPeriodPreset === "mtd" ? "default" : "outline"}
                  disabled={isBusy}
                  onClick={() => applyGmPeriod("mtd")}
                >
                  MTD
                </Button>
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
                  variant={gmPeriodPreset === "custom" ? "default" : "outline"}
                  disabled={isBusy}
                  onClick={() => void applyGmCustomRange()}
                >
                  Apply range
                </Button>
              </div>
            </CardHeader>
          </Card>

          {data.viewerIsAdmin && data.gmPulse ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    Team today
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-semibold tabular-nums">
                    {formatMoney(data.gmPulse.companyTodaySales)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    Team MTD
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-semibold tabular-nums">
                    {formatMoney(data.gmPulse.companyMtdSales)}
                  </p>
                  {data.gmPulse.companyMtdTarget != null ? (
                    <p className="text-muted-foreground text-xs tabular-nums">
                      / {formatMoney(data.gmPulse.companyMtdTarget)}
                      {data.gmPulse.companyMtdPercent != null
                        ? ` · ${data.gmPulse.companyMtdPercent}%`
                        : ""}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    Calls today
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-semibold tabular-nums">
                    {data.gmPulse.totalCallsToday}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {data.gmPulse.totalCallsMtd} MTD
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    On target
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-semibold tabular-nums">
                    {data.gmPulse.merchantsAchieved}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {data.gmPulse.merchantsBehind} behind ·{" "}
                    {data.gmPulse.merchantsNoTarget} no target
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    Alerts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-semibold tabular-nums">
                    {data.gmPulse.alertCount}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Needs attention
                  </p>
                </CardContent>
              </Card>
              {data.gmPulse.shopAmount != null &&
              data.gmPulse.onlineAmount != null ? (
                <>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                        Shop ({gmPeriodLabel})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xl font-semibold tabular-nums">
                        {formatMoney(data.gmPulse.shopAmount)}
                      </p>
                      <p className="text-muted-foreground text-xs tabular-nums">
                        {data.gmPulse.shopOrderCount ?? 0} orders
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                        Online ({gmPeriodLabel})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xl font-semibold tabular-nums">
                        {formatMoney(data.gmPulse.onlineAmount)}
                      </p>
                      <p className="text-muted-foreground text-xs tabular-nums">
                        {data.gmPulse.onlineOrderCount ?? 0} orders
                      </p>
                    </CardContent>
                  </Card>
                </>
              ) : null}
            </div>
          ) : null}

          {data.viewerIsAdmin && data.gmAlerts.length > 0 ? (
            <Card>
              <CardHeader className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="size-4 text-amber-500" aria-hidden />
                  Alerts
                </CardTitle>
                <p className="text-muted-foreground text-xs">
                  Merchants that need a check-in today.
                </p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {data.gmAlerts.map((alert) => (
                    <li
                      key={`${alert.merchantId}-${alert.message}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <span className="font-medium">{alert.displayName}</span>
                        <span className="text-muted-foreground"> — {alert.message}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            alert.severity === "critical"
                              ? "rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400"
                              : "rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400"
                          }
                        >
                          {alert.severity === "critical" ? "Critical" : "Warning"}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isBusy}
                          onClick={() => {
                            setMerchantId(alert.merchantId);
                            setDashboardTab("merchant");
                            void reload(alert.merchantId);
                          }}
                        >
                          Open
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {data.viewerIsAdmin && scorecardRows.length > 0 ? (
            <Card>
              <CardHeader className="space-y-1">
                <CardTitle className="text-base">Merchant scorecard</CardTitle>
                <p className="text-muted-foreground text-xs">
                  Primary = amounts. Secondary lines below each cell are
                  context (orders, mix %, today/MTD, ops) — visible but not
                  main figures.
                </p>
                {isCustomGmPeriod ? (
                  <p className="text-amber-700 text-xs dark:text-amber-400">
                    Monthly targets vs {gmPeriodLabel} actuals — channel % is
                    indicative for custom ranges.
                  </p>
                ) : null}
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Merchant</TableHead>
                      <TableHead className="text-right">
                        <button
                          type="button"
                          className="hover:text-foreground ml-auto block w-full text-right font-medium"
                          onClick={() =>
                            setScorecardSort((s) =>
                              toggleScorecardSort(s, "shopAmount"),
                            )
                          }
                        >
                          Shop
                          {scorecardSort.key === "shopAmount"
                            ? scorecardSort.dir === "desc"
                              ? " ↓"
                              : " ↑"
                            : ""}
                        </button>
                      </TableHead>
                      <TableHead className="text-right">
                        <button
                          type="button"
                          className="hover:text-foreground ml-auto block w-full text-right font-medium"
                          onClick={() =>
                            setScorecardSort((s) =>
                              toggleScorecardSort(s, "onlineAmount"),
                            )
                          }
                        >
                          Online
                          {scorecardSort.key === "onlineAmount"
                            ? scorecardSort.dir === "desc"
                              ? " ↓"
                              : " ↑"
                            : ""}
                        </button>
                      </TableHead>
                      <TableHead className="text-right">
                        <button
                          type="button"
                          className="hover:text-foreground ml-auto block w-full text-right font-medium"
                          onClick={() =>
                            setScorecardSort((s) =>
                              toggleScorecardSort(s, "totalAmount"),
                            )
                          }
                        >
                          Total
                          {scorecardSort.key === "totalAmount"
                            ? scorecardSort.dir === "desc"
                              ? " ↓"
                              : " ↑"
                            : ""}
                        </button>
                      </TableHead>
                      <TableHead className="text-right">
                        <button
                          type="button"
                          className="hover:text-foreground ml-auto block w-full text-right font-medium"
                          onClick={() =>
                            setScorecardSort((s) =>
                              toggleScorecardSort(s, "totalPercent"),
                            )
                          }
                        >
                          Target %
                          {scorecardSort.key === "totalPercent"
                            ? scorecardSort.dir === "desc"
                              ? " ↓"
                              : " ↑"
                            : ""}
                        </button>
                      </TableHead>
                      <TableHead className="text-right">Ops</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scorecardRows.map((row) => (
                      <TableRow
                        key={row.merchantId}
                        className="cursor-pointer"
                        onClick={() => {
                          setMerchantId(row.merchantId);
                          setDashboardTab("merchant");
                          void reload(row.merchantId);
                        }}
                      >
                        <TableCell>
                          <div className="font-medium">{row.displayName}</div>
                          {row.isShopMerchant ? (
                            <div className={`${SCORECARD_SUB_MUTED} mt-1`}>
                              <span className="bg-teal-500/15 text-teal-800 dark:text-teal-300 inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium uppercase">
                                Shop
                              </span>
                              {row.outletName ? ` · ${row.outletName}` : ""}
                            </div>
                          ) : null}
                          <div className={`${SCORECARD_SUB} mt-1`}>
                            Today {formatMoney(row.todaySales)} · MTD{" "}
                            {formatMoney(row.mtdSales)}
                          </div>
                          <div className={SCORECARD_SUB_MUTED}>
                            {gmPeriodLabel} total{" "}
                            {formatMoney(row.periodSales)}
                          </div>
                          {row.hasDmSplit ? (
                            <div className={SCORECARD_SUB_MUTED}>
                              MER {formatMoney(row.merPeriodSales)} · DM{" "}
                              {formatMoney(row.dmPeriodSales)}
                            </div>
                          ) : null}
                          {row.hasWholesale ? (
                            <div className={SCORECARD_SUB_MUTED}>
                              WH {formatMoney(row.wholesalePeriodSales)}
                              {row.wholesalePercent != null
                                ? ` (${Math.round(row.wholesalePercent)}%)`
                                : ""}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right align-top tabular-nums">
                          <div className="font-medium">
                            {formatMoney(row.shop.amount)}
                          </div>
                          <div className={SCORECARD_SUB}>
                            {formatChannelSubline([
                              `${row.shop.orderCount} orders`,
                              formatPercentOneDecimal(row.shopPercent),
                            ]) ?? "—"}
                          </div>
                        </TableCell>
                        <TableCell className="text-right align-top tabular-nums">
                          <div className="font-medium">
                            {formatMoney(row.online.amount)}
                          </div>
                          <div className={SCORECARD_SUB}>
                            {formatChannelSubline([
                              `${row.online.orderCount} orders`,
                              formatPercentOneDecimal(row.onlinePercent),
                            ]) ?? "—"}
                          </div>
                        </TableCell>
                        <TableCell className="text-right align-top tabular-nums">
                          <div className="font-medium">
                            {formatMoney(row.periodSales)}
                          </div>
                          <div className={SCORECARD_SUB_MUTED}>{gmPeriodLabel}</div>
                        </TableCell>
                        <TableCell className="text-right align-top tabular-nums">
                          <div className="font-medium">
                            {row.percent != null
                              ? `${Math.round(row.percent)}%`
                              : "—"}
                          </div>
                          {row.effectiveTotalTarget != null &&
                          row.effectiveTotalTarget > 0 ? (
                            <div className={SCORECARD_SUB}>
                              {formatScorecardTargetSubline({
                                periodPreset: gmPeriodPreset,
                                periodLabel: gmPeriodLabel,
                                periodTargetAmount: row.periodTargetAmount,
                                dailyTargetAmount: row.dailyTargetAmount,
                                monthlyTargetAmount: row.effectiveTotalTarget,
                              }) ??
                                `/ ${formatMoney(row.effectiveTotalTarget)}`}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className={`${SCORECARD_SUB} align-top`}>
                          <div className="tabular-nums">
                            {row.callsToday}/{row.callsMtd} calls
                          </div>
                          <div>
                            Int {row.interestedPct ?? "—"}% · Ret{" "}
                            {row.returnRatePct ?? "—"}%
                          </div>
                          <div>
                            Queue {row.pendingQueueCount} ·{" "}
                            {paceStatusLabel(row.paceStatus)}
                          </div>
                          <span
                            className={`mt-0.5 inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-medium ${healthStatusClass(row.healthStatus)}`}
                          >
                            {healthStatusLabel(row.healthStatus)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  {data.gmChannelFooter ? (
                    <TableFooter>
                      <TableRow className="bg-muted/40 font-semibold">
                        <TableCell>Company total</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(data.gmChannelFooter.shop.amount)}
                          <span className="text-muted-foreground block text-[11px] font-normal tabular-nums">
                            {data.gmChannelFooter.shop.orderCount} orders
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(data.gmChannelFooter.online.amount)}
                          <span className="text-muted-foreground block text-[11px] font-normal tabular-nums">
                            {data.gmChannelFooter.online.orderCount} orders
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(data.gmChannelFooter.grandTotal.amount)}
                        </TableCell>
                        <TableCell />
                        <TableCell />
                      </TableRow>
                    </TableFooter>
                  ) : null}
                </Table>
              </CardContent>
            </Card>
          ) : null}

          {data.viewerIsAdmin && data.gmChannelFooter ? (
            <Card>
              <CardHeader className="space-y-1">
                <CardTitle className="text-base">Channel totals</CardTitle>
                <p className="text-muted-foreground text-xs">
                  Company shop vs online for {data.gmChannelFooter.periodLabel}.
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-border/60 px-4 py-3">
                    <p className="text-muted-foreground text-xs font-medium uppercase">
                      Shop
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      {formatMoney(data.gmChannelFooter.shop.amount)}
                    </p>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {data.gmChannelFooter.shop.orderCount} orders
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/60 px-4 py-3">
                    <p className="text-muted-foreground text-xs font-medium uppercase">
                      Online
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      {formatMoney(data.gmChannelFooter.online.amount)}
                    </p>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {data.gmChannelFooter.online.orderCount} orders
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/60 px-4 py-3">
                    <p className="text-muted-foreground text-xs font-medium uppercase">
                      Grand total
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      {formatMoney(data.gmChannelFooter.grandTotal.amount)}
                    </p>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {data.gmChannelFooter.grandTotal.orderCount} orders
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {data.viewerIsAdmin ? (
            <Card>
              <CardHeader className="space-y-1">
                <CardTitle className="text-base">Manage merchant</CardTitle>
                <p className="text-muted-foreground text-xs">
                  Pick a merchant to assign targets or open their dashboard in
                  Merchant view.
                </p>
              </CardHeader>
              <CardContent className="max-w-xs space-y-1">
                <label className="text-muted-foreground text-xs font-medium">
                  Merchant
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
              </CardContent>
            </Card>
          ) : null}

          {data.canManageTargets ? (
            <Card>
              <CardHeader className="space-y-1">
                <CardTitle className="text-base">Assign monthly target</CardTitle>
                <p className="text-muted-foreground text-xs">
                  {data.profile.displayName} · {data.yearMonth}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <label className="text-muted-foreground text-xs font-medium">
                      Combined target (LKR)
                    </label>
                    <Input
                      type="number"
                      min={1}
                      step={1000}
                      disabled={isBusy || channelTargetsActive}
                      value={targetInput}
                      onChange={(e) => setTargetInput(e.target.value)}
                      placeholder={channelTargetsActive ? "Shop + online" : "Optional"}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-muted-foreground text-xs font-medium">
                      Shop target (LKR)
                    </label>
                    <Input
                      type="number"
                      min={1}
                      step={1000}
                      disabled={isBusy}
                      value={shopTargetInput}
                      onChange={(e) => handleShopTargetChange(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-muted-foreground text-xs font-medium">
                      Online target (LKR)
                    </label>
                    <Input
                      type="number"
                      min={1}
                      step={1000}
                      disabled={isBusy}
                      value={onlineTargetInput}
                      onChange={(e) => handleOnlineTargetChange(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                </div>
                {data.sales.hasWholesale ? (
                  <div className="space-y-1">
                    <label className="text-muted-foreground text-xs font-medium">
                      Wholesale target (LKR)
                    </label>
                    <Input
                      type="number"
                      min={1}
                      step={1000}
                      disabled={isBusy}
                      value={wholesaleTargetInput}
                      onChange={(e) => setWholesaleTargetInput(e.target.value)}
                      placeholder="WH MER sales only"
                    />
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
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
                <p className="text-muted-foreground text-xs">
                  Shop + online auto-fill combined. Enter combined alone when
                  channel split not needed. New month copies last month until
                  admin saves a change.
                </p>
                {data.target.note ? (
                  <p className="text-muted-foreground text-xs">{data.target.note}</p>
                ) : null}
                {data.target.assignedByName ? (
                  <p className="text-muted-foreground text-xs">
                    Last assigned by {data.target.assignedByName}
                    {data.target.assignedAt
                      ? ` · ${new Date(data.target.assignedAt).toLocaleString()}`
                      : ""}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {data.viewerIsAdmin && overviewRows.length > 0 ? (
            <Card>
              <CardHeader className="space-y-1">
                <CardTitle className="text-base">
                  All merchants — MTD performance
                </CardTitle>
                <p className="text-muted-foreground text-xs">
                  {hasAnyTarget
                    ? "Bars = sales vs target. Cards sorted by highest target completion. Click a card to open that merchant in Merchant view."
                    : "No targets set yet — % is share of top MTD this month. Assign targets above after selecting a merchant."}
                </p>
              </CardHeader>
              <CardContent className="space-y-5">
                <div
                  className="w-full"
                  style={{ height: Math.max(220, overviewChartRows.length * 28) }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={overviewChart}
                      margin={{ top: 8, right: 12, left: 4, bottom: 8 }}
                      layout="vertical"
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-border"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                      />
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
                      {hasAnyTarget ? (
                        <Bar
                          dataKey="target"
                          name="Target"
                          fill="#64748b"
                          radius={[0, 4, 4, 0]}
                        />
                      ) : null}
                      <Bar
                        dataKey="sales"
                        name="MTD sales"
                        fill="#14b8a6"
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {overviewRows.map((row, index) => {
                    const hasTarget =
                      hasAnyTarget &&
                      row.targetAmount != null &&
                      row.targetAmount > 0;
                    const towardTarget = hasTarget
                      ? Math.min(
                          100,
                          Math.round(
                            (row.mtdSales / (row.targetAmount as number)) * 1000,
                          ) / 10,
                        )
                      : null;
                    const relativeShare =
                      Math.round((row.mtdSales / maxOverviewSales) * 1000) / 10;
                    const progressPct = hasTarget
                      ? Math.min(100, towardTarget ?? 0)
                      : relativeShare;
                    const ringColor =
                      hasTarget && (towardTarget ?? 0) >= 100
                        ? "#10b981"
                        : hasTarget && (towardTarget ?? 0) >= 80
                          ? "#14b8a6"
                          : hasTarget && (towardTarget ?? 0) >= 50
                            ? "#f59e0b"
                            : hasTarget
                              ? "#0ea5e9"
                              : "#14b8a6";
                    const ringR = 18;
                    const ringC = 2 * Math.PI * ringR;
                    const ringOffset =
                      ringC * (1 - Math.min(100, progressPct) / 100);

                    return (
                      <li key={row.merchantId}>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => {
                            setMerchantId(row.merchantId);
                            setDashboardTab("merchant");
                            void reload(row.merchantId);
                          }}
                          className="hover:bg-muted/50 flex h-full w-full flex-col items-center gap-2 rounded-xl border border-border/60 px-3 py-3 text-center transition-colors disabled:opacity-60"
                          title={
                            hasTarget
                              ? `${towardTarget}% of target`
                              : `${relativeShare}% of top MTD`
                          }
                        >
                          <div className="flex w-full items-center justify-between gap-1">
                            <span className="bg-muted text-muted-foreground inline-flex size-5 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums">
                              {index + 1}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">
                              {row.displayName}
                            </span>
                          </div>
                          <div className="relative size-14 shrink-0" aria-hidden>
                            <svg viewBox="0 0 44 44" className="size-14 -rotate-90">
                              <circle
                                cx="22"
                                cy="22"
                                r={ringR}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3.5"
                                className="text-muted"
                              />
                              <circle
                                cx="22"
                                cy="22"
                                r={ringR}
                                fill="none"
                                stroke={ringColor}
                                strokeWidth="3.5"
                                strokeLinecap="round"
                                strokeDasharray={ringC}
                                strokeDashoffset={ringOffset}
                              />
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums">
                              {Math.round(progressPct)}%
                            </span>
                          </div>
                          <div className="w-full space-y-0.5">
                            <p className="truncate text-sm font-semibold tabular-nums">
                              {formatMoney(row.mtdSales)}
                            </p>
                            {hasTarget ? (
                              <p className="text-muted-foreground truncate text-[11px] tabular-nums">
                                / {formatMoney(row.targetAmount as number)}
                              </p>
                            ) : (
                              <p className="text-muted-foreground text-[11px]">
                                No target
                              </p>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {data.viewerIsAdmin ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Target assignment history</CardTitle>
              </CardHeader>
              <CardContent>
                {data.history.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No targets assigned yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-muted-foreground border-b text-left">
                          <th className="py-2 pr-3 font-medium">Month</th>
                          <th className="py-2 pr-3 font-medium">Combined</th>
                          <th className="py-2 pr-3 font-medium">Shop</th>
                          <th className="py-2 pr-3 font-medium">Online</th>
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
                            <td className="py-2 pr-3">
                              {formatMoney(row.targetAmount)}
                            </td>
                            <td className="py-2 pr-3">
                              {row.shopTargetAmount != null
                                ? formatMoney(row.shopTargetAmount)
                                : "—"}
                            </td>
                            <td className="py-2 pr-3">
                              {row.onlineTargetAmount != null
                                ? formatMoney(row.onlineTargetAmount)
                                : "—"}
                            </td>
                            <td className="py-2 pr-3">
                              {row.achievedAmount != null
                                ? formatMoney(row.achievedAmount)
                                : "—"}
                            </td>
                            <td className="py-2 pr-3 capitalize">
                              {row.status.replaceAll("_", " ")}
                            </td>
                            <td className="py-2 pr-3">
                              {row.assignedByName ?? "—"}
                            </td>
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
      ) : null}
    </div>
  );
}
