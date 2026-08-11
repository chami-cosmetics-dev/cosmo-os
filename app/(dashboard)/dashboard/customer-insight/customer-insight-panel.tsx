"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Calendar, Check, Crown, Loader2, Mail, MapPin, Phone, Search, ShieldCheck, UserRound, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { invoiceLineDisplayName } from "@/lib/customer-insight/invoices";
import {
  LOYALTY_GOLD_MIN,
  LOYALTY_PLATINUM_MIN,
} from "@/lib/customer-insight/loyalty-tier";
import {
  goldMilestoneRatio,
  progressBarFillRatio,
} from "@/lib/customer-insight/progress-bar";
import type {
  AllocatedFilterItemDto,
  CustomerInsightDto,
  SearchMatchDto,
  SeriesPointDto,
  TopItemDto,
} from "@/lib/customer-insight/types";
import {
  CONTACT_GENDER_OPTIONS,
  CONTACT_LANGUAGE_OPTIONS,
} from "@/lib/customer-insight/contact-profile-options";
import { CALL_CENTER_CATEGORY_VALUES } from "@/lib/contact-call-center-categories";
import { formatAppDateTime } from "@/lib/format-datetime";
import { notify } from "@/lib/notify";

const CHART_BLUE = "#3b82f6";

function formatMoney(amount: number, currency = "LKR") {
  return `${currency} ${new Intl.NumberFormat("en-LK", {
    maximumFractionDigits: 0,
  }).format(amount)}`;
}

function formatAmount(value: string | number, currency?: string | null) {
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  if (Number.isNaN(n)) return String(value);
  const formatted = n.toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${formatted} ${currency}` : formatted;
}

function formatChartAxis(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return String(Math.round(value));
}

function formatMonthLabel(monthKey: string) {
  const [y, m] = monthKey.split("-");
  const year = Number(y);
  const month = Number(m);
  if (!year || !month || month < 1 || month > 12) return monthKey;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-LK", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function formatDob(
  year: number | null | undefined,
  month: number | null | undefined,
  day: number | null | undefined
) {
  if (!year && !month && !day) return "—";
  const parts = [
    day != null ? String(day).padStart(2, "0") : "??",
    month != null ? String(month).padStart(2, "0") : "??",
    year != null ? String(year) : "????",
  ];
  return parts.join("/");
}

function tierBadgeClass(key: CustomerInsightDto["loyalty"]["key"]) {
  if (key === "gold")
    return "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-700";
  if (key === "platinum")
    return "bg-slate-200 text-slate-900 border-slate-400 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-500";
  return "bg-muted text-muted-foreground";
}

function initialFromName(name: string | null | undefined) {
  const trimmed = name?.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}

function formatMemberSince(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-LK", { month: "short", year: "numeric" });
}

function truncateLabel(value: string, max = 18) {
  const t = value.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function DetailField({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 text-sm font-medium text-foreground break-words">
        {value || "—"}
      </div>
    </div>
  );
}

function contactPhoneList(contact: {
  phoneNumber: string | null;
  phones?: string[] | null;
}) {
  if (contact.phones?.length) return contact.phones;
  return [contact.phoneNumber].filter(Boolean) as string[];
}

function InsightChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{
    value?: number | string;
    name?: string;
    payload?: Record<string, unknown>;
  }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload ?? {};
  const title =
    (typeof row.name === "string" && row.name) ||
    (typeof row.month === "string" && formatMonthLabel(row.month)) ||
    String(label ?? "");
  const spend = Number(payload[0]?.value ?? row.spend ?? 0);
  const quantity = typeof row.quantity === "number" ? row.quantity : null;
  const orderCount = typeof row.orderCount === "number" ? row.orderCount : null;

  return (
    <div className="max-w-[220px] rounded-md border border-border bg-popover px-2.5 py-2 text-xs shadow-md">
      <p className="font-medium leading-snug text-popover-foreground break-words">{title}</p>
      <p className="mt-1 tabular-nums text-muted-foreground">
        {formatMoney(spend)}
        {quantity != null ? ` · qty ${quantity}` : null}
        {orderCount != null
          ? ` · ${orderCount} invoice${orderCount === 1 ? "" : "s"}`
          : null}
      </p>
    </div>
  );
}

type ProfileForm = {
  name: string;
  email: string;
  addPhoneNumber: string;
  gender: string;
  language: string;
  address: string;
  birthDate: string;
};

function dobPartsToInputValue(
  year: number | null | undefined,
  month: number | null | undefined,
  day: number | null | undefined
) {
  if (year == null || month == null || day == null) return "";
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function birthDateInputToParts(value: string): {
  birthYear: number | null;
  birthMonth: number | null;
  birthDay: number | null;
} {
  const trimmed = value.trim();
  if (!trimmed) {
    return { birthYear: null, birthMonth: null, birthDay: null };
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    return { birthYear: null, birthMonth: null, birthDay: null };
  }
  return {
    birthYear: Number(match[1]),
    birthMonth: Number(match[2]),
    birthDay: Number(match[3]),
  };
}

export function CustomerInsightPanel({
  canFilterAllContacts = false,
}: {
  canFilterAllContacts?: boolean;
}) {
  const [phone, setPhone] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [matches, setMatches] = useState<SearchMatchDto[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [searched, setSearched] = useState(false);
  const [insight, setInsight] = useState<CustomerInsightDto | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [invoicePage, setInvoicePage] = useState(1);
  const [itemFilter, setItemFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [profileForm, setProfileForm] = useState<ProfileForm | null>(null);
  const [filterPush, setFilterPush] = useState<"" | "gold" | "platinum">("");
  const [filterLoyalty, setFilterLoyalty] = useState("");
  const [filterBrand, setFilterBrand] = useState("");
  const [brandOptions, setBrandOptions] = useState<string[]>([]);
  const [filterBirthday, setFilterBirthday] = useState(false);
  const [filterNoPurchase, setFilterNoPurchase] = useState<"" | "3" | "6">("");
  const [filterMin, setFilterMin] = useState("");
  const [filterMax, setFilterMax] = useState("");
  const [filterResults, setFilterResults] = useState<AllocatedFilterItemDto[] | null>(
    null
  );
  const [filterTotal, setFilterTotal] = useState(0);
  const [callOutcome, setCallOutcome] = useState<string>("Interested");
  const invoicesRef = useRef<HTMLDivElement>(null);

  const isBusy = busyKey !== null;
  const isOwner = insight?.visibility === "owner";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/customer-insight/filter-options");
        const data = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const brands = Array.isArray(data.brands)
          ? (data.brands as unknown[]).filter((b): b is string => typeof b === "string")
          : [];
        setBrandOptions(brands);
      } catch {
        // Options are optional for page use; filters still work without brands.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function runSearch() {
    const q = phone.trim();
    if (!q) {
      notify.error("Enter a phone number to search.");
      return;
    }
    setBusyKey("search");
    setInsight(null);
    setMatches(null);
    setSearched(false);
    setItemFilter(null);
    setEditing(false);
    let autoOpenId: string | null = null;
    try {
      const res = await fetch(
        `/api/admin/customer-insight/search?phone=${encodeURIComponent(q)}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(data.error ?? "Search failed.");
        return;
      }
      const nextMatches = (data.matches ?? []) as SearchMatchDto[];
      setMatches(nextMatches);
      setTruncated(Boolean(data.truncated));
      setSearched(true);
      if (nextMatches.length === 1 && nextMatches[0]) {
        autoOpenId = nextMatches[0].id;
      }
    } catch {
      notify.error("Search failed.");
    } finally {
      setBusyKey(null);
    }
    if (autoOpenId) {
      await loadInsight(autoOpenId, 1);
    }
  }

  async function loadInsight(contactId: string, page: number) {
    setBusyKey(`insight-${contactId}`);
    setEditing(false);
    setSelectedContactId(contactId);
    try {
      const res = await fetch(
        `/api/admin/customer-insight/${encodeURIComponent(contactId)}?invoicesPage=${page}&invoicesPageSize=25`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(data.error ?? "Failed to load customer insight.");
        setInsight(null);
        return;
      }
      const next = data as CustomerInsightDto;
      setInsight(next);
      setInvoicePage(page);
      if (next.visibility === "owner" && next.contact) {
        setProfileForm({
          name: next.contact.name,
          email: next.contact.email ?? "",
          addPhoneNumber: "",
          gender: next.contact.gender ?? "",
          language: next.contact.language ?? "",
          address: next.contact.address ?? "",
          birthDate: dobPartsToInputValue(
            next.contact.birthYear,
            next.contact.birthMonth,
            next.contact.birthDay
          ),
        });
      } else {
        setProfileForm(null);
      }
    } catch {
      notify.error("Failed to load customer insight.");
      setInsight(null);
    } finally {
      setBusyKey(null);
    }
  }

  async function saveProfile() {
    if (!selectedContactId || !profileForm) return;
    setBusyKey("profile");
    try {
      const dob = birthDateInputToParts(profileForm.birthDate);
      const addPhone = profileForm.addPhoneNumber.trim();
      const body: Record<string, unknown> = {
        name: profileForm.name.trim(),
        email: profileForm.email.trim() || null,
        gender: profileForm.gender || null,
        language: profileForm.language || null,
        address: profileForm.address.trim() || null,
        birthYear: dob.birthYear,
        birthMonth: dob.birthMonth,
        birthDay: dob.birthDay,
      };
      if (addPhone) {
        body.addPhoneNumber = addPhone;
      }
      const res = await fetch(
        `/api/admin/customer-insight/${encodeURIComponent(selectedContactId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(data.error ?? "Failed to save profile.");
        return;
      }
      notify.success(
        addPhone
          ? "Profile updated. New phone is primary; old number kept for search and purchase history."
          : "Profile updated."
      );
      setEditing(false);
      await loadInsight(selectedContactId, invoicePage);
    } catch {
      notify.error("Failed to save profile.");
    } finally {
      setBusyKey(null);
    }
  }

  async function markContacted() {
    if (!selectedContactId) return;
    if (!callOutcome.trim()) {
      notify.error("Select a call outcome.");
      return;
    }
    setBusyKey("contacted");
    try {
      const res = await fetch(
        `/api/admin/customer-insight/${encodeURIComponent(selectedContactId)}/contacted`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: callOutcome }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(data.error ?? "Failed to save call outcome.");
        return;
      }
      notify.success(`Saved outcome: ${data.category ?? callOutcome}`);
      setInsight((prev) =>
        prev
          ? {
              ...prev,
              lastContactedAt: data.lastContactedAt ?? new Date().toISOString(),
              contact: prev.contact
                ? {
                    ...prev.contact,
                    category: data.category ?? callOutcome,
                  }
                : prev.contact,
            }
          : prev
      );
    } catch {
      notify.error("Failed to save call outcome.");
    } finally {
      setBusyKey(null);
    }
  }

  async function runFilters() {
    setBusyKey("filter");
    try {
      const params = new URLSearchParams();
      if (filterPush === "gold") params.set("pushGold", "true");
      if (filterPush === "platinum") params.set("pushPlatinum", "true");
      if (filterLoyalty) params.set("loyalty", filterLoyalty);
      if (filterBrand.trim()) params.set("brand", filterBrand.trim());
      if (filterBirthday) params.set("birthdayThisMonth", "true");
      if (filterNoPurchase === "3" || filterNoPurchase === "6") {
        params.set("noPurchaseMonths", filterNoPurchase);
      }
      if (filterMin.trim()) params.set("minTotal", filterMin.trim());
      if (filterMax.trim()) params.set("maxTotal", filterMax.trim());
      params.set("page", "1");
      params.set("pageSize", "25");
      const res = await fetch(`/api/admin/customer-insight/filter?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(data.error ?? "Filter failed.");
        return;
      }
      setFilterResults((data.items ?? []) as AllocatedFilterItemDto[]);
      setFilterTotal(data.pagination?.total ?? 0);
    } catch {
      notify.error("Filter failed.");
    } finally {
      setBusyKey(null);
    }
  }

  function focusInvoicesForItem(itemName: string) {
    setItemFilter(itemName);
    invoicesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const totalPages = insight
    ? Math.max(
        1,
        Math.ceil(insight.invoicePagination.total / insight.invoicePagination.pageSize)
      )
    : 1;

  const visibleInvoices =
    insight && itemFilter && isOwner
      ? insight.invoices.filter((inv) =>
          inv.lineItems.some((li) => invoiceLineDisplayName(li) === itemFilter)
        )
      : insight?.invoices ?? [];

  const monthlySpendChart = useMemo(() => {
    const series = insight?.series ?? [];
    return [...series]
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12)
      .map((point: SeriesPointDto) => ({
        month: point.month,
        label: formatMonthLabel(point.month),
        spend: point.spend,
        orderCount: point.orderCount,
      }));
  }, [insight?.series]);

  const topItemsChart = useMemo(() => {
    const items = insight?.topItems ?? [];
    return items.slice(0, 10).map((item: TopItemDto) => ({
      name: item.name,
      label: truncateLabel(item.name, 22),
      spend: item.spend,
      quantity: item.quantity,
    }));
  }, [insight?.topItems]);

  const contactIdForPaging = selectedContactId ?? insight?.contact?.id ?? null;
  const progressPct = insight?.progressBar
    ? Math.round(progressBarFillRatio(insight.progressBar.currentTotal) * 100)
    : 0;
  const nextTierLabel =
    insight?.loyalty.key === "platinum"
      ? "Platinum"
      : insight?.loyalty.key === "gold"
        ? "Platinum"
        : "Gold";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Customer Insight</h1>
        <p className="text-sm text-muted-foreground">
          View customer profile, purchase history, and loyalty details. Allocated merchants and
          admins can edit profile fields.{" "}
          {canFilterAllContacts
            ? "Filters search all company contacts."
            : "Filters search your allocated customers."}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {canFilterAllContacts ? "Customer filters" : "Allocated customer filters"}
          </CardTitle>
          <CardDescription>
            {canFilterAllContacts
              ? "Results include all company contacts matching your filters (allocated and unallocated)."
              : "Results are limited to your allocated customers."}{" "}
            Without a brand, highest lifetime totals first. With a brand, customers who bought
            that brand (vendor or product title), ranked by brand spend — same rules as Contact
            Master.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Push</span>
              <select
                className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-sm"
                value={filterPush}
                onChange={(e) =>
                  setFilterPush(e.target.value as "" | "gold" | "platinum")
                }
                disabled={isBusy}
              >
                <option value="">None</option>
                <option value="gold">Push to Gold (≥75k &lt;100k)</option>
                <option value="platinum">Push to Platinum (≥200k &lt;250k)</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Loyalty</span>
              <select
                className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-sm"
                value={filterLoyalty}
                onChange={(e) => setFilterLoyalty(e.target.value)}
                disabled={isBusy}
              >
                <option value="">Any</option>
                <option value="standard">Standard</option>
                <option value="gold">Gold</option>
                <option value="platinum">Platinum</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Brand</span>
              <select
                className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-sm"
                value={filterBrand}
                onChange={(e) => setFilterBrand(e.target.value)}
                disabled={isBusy}
              >
                <option value="">Any</option>
                {brandOptions.map((brand) => (
                  <option key={brand} value={brand}>
                    {brand}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Min total</span>
              <Input
                value={filterMin}
                onChange={(e) => setFilterMin(e.target.value)}
                inputMode="numeric"
                disabled={isBusy}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Max total</span>
              <Input
                value={filterMax}
                onChange={(e) => setFilterMax(e.target.value)}
                inputMode="numeric"
                disabled={isBusy}
              />
            </label>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={filterBirthday}
                onChange={(e) => setFilterBirthday(e.target.checked)}
                disabled={isBusy}
              />
              Birthday this month
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">No purchase</span>
              <select
                className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-sm"
                value={filterNoPurchase}
                onChange={(e) =>
                  setFilterNoPurchase(e.target.value as "" | "3" | "6")
                }
                disabled={isBusy}
              >
                <option value="">Any</option>
                <option value="3">No purchase in last 3 months</option>
                <option value="6">No purchase in last 6 months</option>
              </select>
            </label>
          </div>
          <Button type="button" disabled={isBusy} onClick={() => void runFilters()}>
            {busyKey === "filter" ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Filtering...
              </>
            ) : (
              "Apply filters"
            )}
          </Button>
          {filterResults && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {filterTotal === 0
                  ? canFilterAllContacts
                    ? "No contacts match these filters."
                    : "No allocated customers match these filters."
                  : `${filterTotal} match(es), showing ${filterResults.length}.`}
              </p>
              <ul className="divide-y rounded-md border">
                {filterResults.map((row) => (
                  <li key={row.contactId}>
                    <button
                      type="button"
                      className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
                      disabled={isBusy}
                      onClick={() => void loadInsight(row.contactId, 1)}
                    >
                      <span className="font-medium">{row.name}</span>
                      <span className="text-muted-foreground">
                        {row.phoneNumber ?? "—"} ·{" "}
                        {row.brandSpend != null
                          ? `Brand ${formatMoney(row.brandSpend)} · `
                          : null}
                        {formatMoney(row.lifetimeTotal)} · {row.loyalty.label}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Phone search</CardTitle>
          <CardDescription>
            Enter a full customer phone number for an exact match.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch();
            }}
          >
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 0771234567"
              disabled={isBusy}
              inputMode="tel"
              autoComplete="tel"
              className="sm:max-w-sm"
            />
            <Button type="submit" disabled={isBusy}>
              {busyKey === "search" ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Searching...
                </>
              ) : (
                <>
                  <Search aria-hidden />
                  Search
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {searched && matches && matches.length === 0 && !insight && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No customer found for that phone number.
          </CardContent>
        </Card>
      )}

      {matches && matches.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Matches</CardTitle>
            <CardDescription>
              Select a customer to open insight.
              {truncated ? " More matches exist — refine the phone number." : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {matches.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={isBusy}
                onClick={() => void loadInsight(m.id, 1)}
                className="flex w-full flex-col rounded-md border px-3 py-2 text-left text-sm transition hover:bg-muted/50 disabled:opacity-50 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="font-medium">{m.name}</span>
                <span className="text-muted-foreground">
                  {m.phoneNumber ?? "—"}
                  {m.email ? ` · ${m.email}` : ""}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {insight && (
        <>
          {/* Limited summary */}
          {!isOwner && (
            <Card>
              <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
                    {initialFromName(insight.assignedMerchant ?? "C")}
                  </div>
                  <div className="space-y-1">
                    <CardTitle className="text-xl">Customer (limited view)</CardTitle>
                    <CardDescription>
                      Allocated merchant:{" "}
                      <span className="font-medium text-foreground">
                        {insight.assignedMerchant ?? "Unallocated"}
                      </span>
                    </CardDescription>
                  </div>
                </div>
                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <div className="space-y-1 text-left sm:text-right">
                    <p className="text-xs text-muted-foreground">Loyalty Tier</p>
                    <span
                      className={`inline-flex whitespace-nowrap rounded-md border px-2 py-1 text-xs font-semibold ${tierBadgeClass(insight.loyalty.key)}`}
                    >
                      {insight.loyalty.label}
                      {insight.loyalty.code ? ` (${insight.loyalty.code})` : ""}
                    </span>
                  </div>
                  <div className="space-y-1 text-left sm:text-right">
                    <p className="text-xs text-muted-foreground">Lifetime Total Spend</p>
                    <p className="text-lg font-semibold tabular-nums">
                      {formatMoney(insight.loyalty.lifetimeTotal, insight.loyalty.currency)}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  You are not the allocated merchant. Profile, progress bar, contacted, top
                  items, spend chart, and invoice line items are hidden.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Owner contact details + progress */}
          {isOwner && insight.contact && (
            <Card className="overflow-hidden">
              <CardContent className="space-y-5 p-5 sm:p-6">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 flex-1 items-start gap-4">
                    <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-semibold text-primary-foreground">
                      {initialFromName(insight.contact.name)}
                    </div>
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="space-y-1.5">
                        <h2 className="text-xl font-semibold tracking-tight">
                          {insight.contact.name}
                        </h2>
                        <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                          {contactPhoneList(insight.contact).length > 0 ? (
                            contactPhoneList(insight.contact).map((p, idx) => (
                              <span
                                key={`${p}-${idx}`}
                                className="inline-flex flex-wrap items-center gap-1.5"
                              >
                                <Phone className="size-3.5 shrink-0" aria-hidden />
                                <span className="text-foreground">{p}</span>
                                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                                  {idx === 0 ? "Primary" : "Previous"}
                                </span>
                              </span>
                            ))
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              <Phone className="size-3.5 shrink-0" aria-hidden />
                              No phone
                            </span>
                          )}
                          {insight.contact.email ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Mail className="size-3.5 shrink-0" aria-hidden />
                              <span className="truncate text-foreground">
                                {insight.contact.email}
                              </span>
                            </span>
                          ) : null}
                          {formatMemberSince(insight.frequency?.firstOrderAt) ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Calendar className="size-3.5 shrink-0" aria-hidden />
                              Member since{" "}
                              {formatMemberSince(insight.frequency?.firstOrderAt)}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="grid gap-3 rounded-lg border border-border/70 bg-muted/25 p-3 sm:grid-cols-2 lg:grid-cols-3">
                        <DetailField
                          label="Allocated to"
                          value={insight.assignedMerchant ?? "—"}
                        />
                        <DetailField
                          label="Date of birth"
                          value={formatDob(
                            insight.contact.birthYear,
                            insight.contact.birthMonth,
                            insight.contact.birthDay
                          )}
                        />
                        <DetailField
                          label="Gender"
                          value={
                            insight.contact.gender ? (
                              <span className="inline-flex items-center gap-1.5">
                                <UserRound
                                  className="size-3.5 text-muted-foreground"
                                  aria-hidden
                                />
                                {insight.contact.gender}
                              </span>
                            ) : (
                              "—"
                            )
                          }
                        />
                        <DetailField
                          label="Language"
                          value={insight.contact.language ?? "—"}
                        />
                        <DetailField
                          label="Address"
                          className="sm:col-span-2"
                          value={
                            insight.contact.address ? (
                              <span className="inline-flex items-start gap-1.5">
                                <MapPin
                                  className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                                  aria-hidden
                                />
                                <span>{insight.contact.address}</span>
                              </span>
                            ) : (
                              "—"
                            )
                          }
                        />
                      </div>

                      {insight.canEditProfile ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="w-fit"
                          disabled={isBusy}
                          onClick={() => setEditing((v) => !v)}
                        >
                          {editing ? "Cancel edit" : "Edit profile"}
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-start gap-6 lg:flex-col lg:items-end lg:gap-4">
                    <div className="space-y-1.5 lg:text-right">
                      <p className="text-xs text-muted-foreground">Loyalty Tier</p>
                      <span
                        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-semibold ${tierBadgeClass(insight.loyalty.key)}`}
                      >
                        <ShieldCheck className="size-3.5" aria-hidden />
                        {insight.loyalty.label}
                        {insight.loyalty.code ? ` (${insight.loyalty.code})` : ""}
                      </span>
                    </div>
                    <div className="space-y-1 lg:text-right">
                      <p className="text-xs text-muted-foreground">Lifetime Total Spend</p>
                      <p className="text-2xl font-semibold tabular-nums tracking-tight">
                        {formatMoney(
                          insight.loyalty.lifetimeTotal,
                          insight.loyalty.currency
                        )}
                      </p>
                      {insight.frequency ? (
                        <p className="text-xs text-muted-foreground">
                          Across {insight.frequency.orderCount} order
                          {insight.frequency.orderCount === 1 ? "" : "s"}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>

                {editing && profileForm ? (
                  <div className="grid gap-3 border-t border-border/60 pt-4 sm:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span className="text-muted-foreground">Name</span>
                      <Input
                        value={profileForm.name}
                        onChange={(e) =>
                          setProfileForm((prev) =>
                            prev ? { ...prev, name: e.target.value } : prev
                          )
                        }
                        disabled={isBusy}
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-muted-foreground">Email</span>
                      <Input
                        type="email"
                        value={profileForm.email}
                        onChange={(e) =>
                          setProfileForm((prev) =>
                            prev ? { ...prev, email: e.target.value } : prev
                          )
                        }
                        disabled={isBusy}
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-muted-foreground">Gender</span>
                      <select
                        className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-sm"
                        value={profileForm.gender}
                        onChange={(e) =>
                          setProfileForm((prev) =>
                            prev ? { ...prev, gender: e.target.value } : prev
                          )
                        }
                        disabled={isBusy}
                      >
                        <option value="">Select gender</option>
                        {CONTACT_GENDER_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-muted-foreground">Language</span>
                      <select
                        className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-sm"
                        value={profileForm.language}
                        onChange={(e) =>
                          setProfileForm((prev) =>
                            prev ? { ...prev, language: e.target.value } : prev
                          )
                        }
                        disabled={isBusy}
                      >
                        <option value="">Select language</option>
                        {CONTACT_LANGUAGE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1 text-sm sm:col-span-2">
                      <span className="text-muted-foreground">Birth date</span>
                      <Input
                        type="date"
                        value={profileForm.birthDate}
                        onChange={(e) =>
                          setProfileForm((prev) =>
                            prev ? { ...prev, birthDate: e.target.value } : prev
                          )
                        }
                        disabled={isBusy}
                        max="2100-12-31"
                        min="1900-01-01"
                      />
                    </label>
                    <label className="space-y-1 text-sm sm:col-span-2">
                      <span className="text-muted-foreground">Address</span>
                      <textarea
                        className="border-input bg-background flex min-h-[72px] w-full rounded-md border px-3 py-2 text-sm"
                        value={profileForm.address}
                        onChange={(e) =>
                          setProfileForm((prev) =>
                            prev ? { ...prev, address: e.target.value } : prev
                          )
                        }
                        disabled={isBusy}
                        maxLength={500}
                        placeholder="Customer address"
                      />
                    </label>
                    <div className="space-y-2 rounded-md border border-border/70 p-3 sm:col-span-2">
                      <p className="text-sm font-medium">Phone numbers</p>
                      <p className="text-xs text-muted-foreground">
                        Current numbers stay linked for purchase history and search. Adding a
                        new number makes it primary and keeps the old one.
                      </p>
                      <ul className="space-y-1 text-sm">
                        {(insight.contact.phones?.length
                          ? insight.contact.phones
                          : ([insight.contact.phoneNumber].filter(Boolean) as string[])
                        ).map((p, idx) => (
                          <li key={`${p}-${idx}`} className="flex items-center gap-2">
                            <Phone className="size-3.5 text-muted-foreground" aria-hidden />
                            <span>{p}</span>
                            {idx === 0 ? (
                              <span className="text-xs text-muted-foreground">(primary)</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">(previous)</span>
                            )}
                          </li>
                        ))}
                        {(insight.contact.phones?.length
                          ? insight.contact.phones
                          : [insight.contact.phoneNumber]
                        ).filter(Boolean).length === 0 ? (
                          <li className="text-muted-foreground">No phone on file</li>
                        ) : null}
                      </ul>
                      <label className="mt-2 block space-y-1 text-sm">
                        <span className="text-muted-foreground">Add new phone number</span>
                        <Input
                          value={profileForm.addPhoneNumber}
                          onChange={(e) =>
                            setProfileForm((prev) =>
                              prev ? { ...prev, addPhoneNumber: e.target.value } : prev
                            )
                          }
                          placeholder="e.g. 0771234567"
                          disabled={isBusy}
                          inputMode="tel"
                        />
                      </label>
                    </div>
                    <div className="sm:col-span-2">
                      <Button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void saveProfile()}
                      >
                        Save profile
                      </Button>
                    </div>
                  </div>
                ) : null}

                {insight.progressBar ? (
                  <div className="flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400">
                      <Crown className="size-5" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold">
                            {insight.loyalty.key === "platinum"
                              ? "Platinum reached"
                              : `Progress to ${nextTierLabel}`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {insight.progressBar.amountToNext > 0
                              ? `Spend ${formatMoney(insight.progressBar.amountToNext, insight.loyalty.currency)} more to reach ${nextTierLabel} tier`
                              : "Highest loyalty milestone reached."}
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground sm:pt-0.5">
                          {progressPct}%
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <div className="relative h-2.5 rounded-full bg-muted">
                          <div
                            className="absolute inset-y-0 left-0 rounded-full bg-primary"
                            style={{ width: `${progressPct}%` }}
                          />
                          {/* Gold @ 100,000 */}
                          <div
                            className="absolute top-1/2 z-[1] h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400 shadow-[0_0_0_2px_rgba(15,23,42,0.35)]"
                            style={{ left: `${goldMilestoneRatio() * 100}%` }}
                            title={`Gold ${formatMoney(LOYALTY_GOLD_MIN, insight.loyalty.currency)}`}
                          />
                          {/* Platinum @ 250,000 (end of bar) */}
                          <div
                            className="absolute top-1/2 right-0 z-[1] h-4 w-0.5 -translate-y-1/2 rounded-full bg-violet-400 shadow-[0_0_0_2px_rgba(15,23,42,0.35)]"
                            title={`Platinum ${formatMoney(LOYALTY_PLATINUM_MIN, insight.loyalty.currency)}`}
                          />
                        </div>
                        <div className="relative h-4 text-[10px] tabular-nums text-muted-foreground">
                          <span className="absolute left-0">0</span>
                          <span
                            className="absolute -translate-x-1/2 font-medium text-amber-600 dark:text-amber-400"
                            style={{ left: `${goldMilestoneRatio() * 100}%` }}
                          >
                            Gold {formatMoney(LOYALTY_GOLD_MIN, insight.loyalty.currency)}
                          </span>
                          <span className="absolute right-0 font-medium text-violet-600 dark:text-violet-400">
                            Platinum {formatMoney(LOYALTY_PLATINUM_MIN, insight.loyalty.currency)}
                          </span>
                        </div>
                        <p className="text-xs tabular-nums text-muted-foreground">
                          Now:{" "}
                          {formatMoney(
                            insight.progressBar.currentTotal,
                            insight.loyalty.currency
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}

          {/* Charts side-by-side; invoice history stays full-width below */}
          {isOwner ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Top Items Overview</CardTitle>
                  <CardDescription>
                    Highest spend items. Click a bar to filter invoice history to that item.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {topItemsChart.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      No purchased items yet.
                    </p>
                  ) : (
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={topItemsChart}
                          margin={{ top: 22, right: 8, left: 0, bottom: 48 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            dataKey="label"
                            tickLine={false}
                            axisLine={false}
                            fontSize={10}
                            interval={0}
                            angle={-28}
                            textAnchor="end"
                            height={60}
                          />
                          <YAxis
                            tickLine={false}
                            axisLine={false}
                            fontSize={11}
                            tickFormatter={formatChartAxis}
                            width={42}
                          />
                          <Tooltip
                            content={<InsightChartTooltip />}
                            cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.35 }}
                          />
                          <Bar
                            dataKey="spend"
                            fill={CHART_BLUE}
                            radius={[4, 4, 0, 0]}
                            cursor="pointer"
                            onClick={(data) => {
                              const name =
                                data &&
                                typeof data === "object" &&
                                "name" in data &&
                                typeof (data as { name?: unknown }).name === "string"
                                  ? (data as { name: string }).name
                                  : null;
                              if (name) focusInvoicesForItem(name);
                            }}
                          >
                            <LabelList
                              dataKey="quantity"
                              position="top"
                              className="fill-foreground"
                              fontSize={11}
                              formatter={(value: unknown) =>
                                value == null || value === "" ? "" : String(value)
                              }
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Monthly Spend Overview</CardTitle>
                  <CardDescription>Last 12 months of loyalty-eligible spend.</CardDescription>
                </CardHeader>
                <CardContent>
                  {monthlySpendChart.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      No monthly spend to chart yet.
                    </p>
                  ) : (
                    <div className="h-[280px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={monthlySpendChart}
                          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            dataKey="label"
                            tickLine={false}
                            axisLine={false}
                            fontSize={11}
                          />
                          <YAxis
                            tickLine={false}
                            axisLine={false}
                            fontSize={11}
                            tickFormatter={formatChartAxis}
                            width={42}
                          />
                          <Tooltip
                            content={<InsightChartTooltip />}
                            cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.35 }}
                          />
                          <Bar dataKey="spend" fill={CHART_BLUE} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}

          {/* Invoice history — full width, same as before */}
          <Card ref={invoicesRef}>
            <CardHeader className="pb-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base">Invoice history</CardTitle>
                  <CardDescription>
                    {insight.invoicePagination.total} order(s).
                    {!isOwner
                      ? " Headers only — line items hidden for non-allocated merchants."
                      : " Cosmo invoices open with View Invoice; Adapt is view-only in the table."}
                  </CardDescription>
                </div>
                {itemFilter && isOwner ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setItemFilter(null)}
                  >
                    <X className="size-4" aria-hidden />
                    Clear item filter
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {insight.invoices.length === 0 ? (
                <div className="rounded-md border border-dashed py-10 text-center">
                  <p className="text-sm font-medium">No purchases found</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border/70">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-[linear-gradient(180deg,color-mix(in_srgb,var(--secondary)_14%,transparent),transparent)]">
                        <th className="px-4 py-2 text-left font-medium">Order</th>
                        {isOwner ? (
                          <th className="px-4 py-2 text-left font-medium">Items</th>
                        ) : null}
                        <th className="px-4 py-2 text-left font-medium">Date</th>
                        <th className="px-4 py-2 text-right font-medium">Total</th>
                        <th className="px-4 py-2 text-left font-medium">Status</th>
                        {isOwner ? (
                          <th className="px-4 py-2 text-left font-medium">Invoice</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleInvoices.map((order) => (
                        <tr
                          key={order.id}
                          className="border-b last:border-0 hover:bg-secondary/10"
                        >
                          <td className="px-4 py-2 align-top">
                            <p className="font-medium">{order.reference}</p>
                            <p className="text-muted-foreground text-xs">
                              {order.secondaryLabel ??
                                (order.source === "adapt" ? "Adapt" : "N/A")}
                            </p>
                          </td>
                          {isOwner ? (
                            <td className="px-4 py-2 align-top">
                              {order.lineItems.length > 0 ? (
                                <div className="space-y-2">
                                  {order.lineItems.map((item) => (
                                    <div
                                      key={item.id}
                                      className="rounded-md border border-dashed border-border/70 px-3 py-2"
                                    >
                                      <p className="font-medium leading-snug">
                                        {item.productTitle}
                                      </p>
                                      <p className="text-muted-foreground text-xs">
                                        {[
                                          item.variantTitle,
                                          item.sku ? `SKU: ${item.sku}` : null,
                                          item.brand ? `Brand: ${item.brand}` : null,
                                        ]
                                          .filter(Boolean)
                                          .join(" • ") || "Standard item"}
                                      </p>
                                      <p className="mt-1 text-xs">
                                        Qty {item.quantity}
                                        <span className="text-muted-foreground">
                                          {" "}
                                          • {formatAmount(item.price, order.currency)} each
                                        </span>
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-xs">
                                  {order.source === "adapt"
                                    ? "Adapt history (no line items)"
                                    : "No items"}
                                </span>
                              )}
                            </td>
                          ) : null}
                          <td className="px-4 py-2 align-top text-muted-foreground whitespace-nowrap">
                            {formatAppDateTime(order.date, "N/A")}
                          </td>
                          <td className="px-4 py-2 align-top text-right whitespace-nowrap">
                            {formatAmount(order.amount, order.currency)}
                            {!order.includedInLoyaltyTotal ? (
                              <p className="text-muted-foreground text-[10px]">
                                Excluded from loyalty total
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-2 align-top text-xs text-muted-foreground">
                            {order.source === "adapt"
                              ? `${order.financialStatus ?? "Adapt"} / ${order.fulfillmentStatus ?? "—"}`
                              : `${order.financialStatus ?? "N/A"} / ${order.fulfillmentStatus ?? "N/A"}`}
                          </td>
                          {isOwner ? (
                            <td className="px-4 py-2 align-top">
                              {order.source === "adapt" || !order.orderId ? (
                                <span className="text-muted-foreground text-xs">
                                  Adapt (view only)
                                </span>
                              ) : (
                                <a
                                  href={`/api/admin/orders/${order.orderId}/invoice`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary underline-offset-4 hover:underline"
                                >
                                  View Invoice
                                </a>
                              )}
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {insight.invoicePagination.total > insight.invoicePagination.pageSize &&
                contactIdForPaging && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      Page {invoicePage} of {totalPages}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isBusy || invoicePage <= 1}
                        onClick={() => void loadInsight(contactIdForPaging, invoicePage - 1)}
                      >
                        Previous
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isBusy || invoicePage >= totalPages}
                        onClick={() => void loadInsight(contactIdForPaging, invoicePage + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
            </CardContent>
          </Card>

          {/* Contacted footer */}
          {isOwner ? (
            <Card>
              <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-3 sm:flex-1">
                  <div className="text-sm">
                    <p className="text-muted-foreground">Last Contacted</p>
                    <p className="font-medium">
                      {insight.lastContactedAt
                        ? formatAppDateTime(insight.lastContactedAt)
                        : "—"}
                    </p>
                    {insight.contact?.category ? (
                      <p className="text-muted-foreground mt-1 text-xs">
                        Current status:{" "}
                        <span className="text-foreground font-medium">
                          {insight.contact.category}
                        </span>
                      </p>
                    ) : null}
                  </div>
                  {insight.canMarkContacted ? (
                    <label className="block max-w-sm space-y-1 text-sm">
                      <span className="text-muted-foreground">Call outcome</span>
                      <select
                        className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-sm"
                        value={callOutcome}
                        disabled={isBusy}
                        onChange={(e) => setCallOutcome(e.target.value)}
                      >
                        {CALL_CENTER_CATEGORY_VALUES.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
                {insight.canMarkContacted ? (
                  <Button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void markContacted()}
                    className="gap-2"
                  >
                    {busyKey === "contacted" ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Check className="size-4" aria-hidden />
                    )}
                    Save outcome
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
