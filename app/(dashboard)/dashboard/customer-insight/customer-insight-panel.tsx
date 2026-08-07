"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";

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
} from "@/lib/customer-insight/types";
import { formatAppDateTime } from "@/lib/format-datetime";
import { notify } from "@/lib/notify";

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

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-LK", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatMonthLabel(monthKey: string) {
  const [y, m] = monthKey.split("-");
  const year = Number(y);
  const month = Number(m);
  if (!year || !month || month < 1 || month > 12) return monthKey;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-LK", {
    month: "short",
    year: "numeric",
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

type ProfileForm = {
  name: string;
  email: string;
  phoneNumber: string;
  birthYear: string;
  birthMonth: string;
  birthDay: string;
};

export function CustomerInsightPanel() {
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
  const [filterMin, setFilterMin] = useState("");
  const [filterMax, setFilterMax] = useState("");
  const [filterResults, setFilterResults] = useState<AllocatedFilterItemDto[] | null>(
    null
  );
  const [filterTotal, setFilterTotal] = useState(0);
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
          phoneNumber: next.contact.phoneNumber ?? "",
          birthYear: next.contact.birthYear != null ? String(next.contact.birthYear) : "",
          birthMonth:
            next.contact.birthMonth != null ? String(next.contact.birthMonth) : "",
          birthDay: next.contact.birthDay != null ? String(next.contact.birthDay) : "",
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
      const res = await fetch(
        `/api/admin/customer-insight/${encodeURIComponent(selectedContactId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: profileForm.name.trim(),
            email: profileForm.email.trim() || null,
            phoneNumber: profileForm.phoneNumber.trim() || null,
            birthYear: profileForm.birthYear ? Number(profileForm.birthYear) : null,
            birthMonth: profileForm.birthMonth ? Number(profileForm.birthMonth) : null,
            birthDay: profileForm.birthDay ? Number(profileForm.birthDay) : null,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(data.error ?? "Failed to save profile.");
        return;
      }
      notify.success("Profile updated.");
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
    setBusyKey("contacted");
    try {
      const res = await fetch(
        `/api/admin/customer-insight/${encodeURIComponent(selectedContactId)}/contacted`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(data.error ?? "Failed to mark contacted.");
        return;
      }
      notify.success("Marked as contacted.");
      setInsight((prev) =>
        prev
          ? { ...prev, lastContactedAt: data.lastContactedAt ?? new Date().toISOString() }
          : prev
      );
    } catch {
      notify.error("Failed to mark contacted.");
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

  const maxTopSpend =
    insight?.topItems && insight.topItems.length
      ? Math.max(...insight.topItems.map((i) => i.spend), 1)
      : 1;

  const spendSeriesNewestFirst = insight?.series
    ? [...insight.series].sort((a, b) => b.month.localeCompare(a.month))
    : [];
  const maxMonthSpend = spendSeriesNewestFirst.length
    ? Math.max(...spendSeriesNewestFirst.map((s) => s.spend), 1)
    : 1;

  const contactIdForPaging = selectedContactId ?? insight?.contact?.id ?? null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Customer Insight</h1>
        <p className="text-sm text-muted-foreground">
          Search any customer by exact phone. Full profile and analytics are only for the
          allocated merchant (and admins). Filters search your allocated customers.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Allocated customer filters</CardTitle>
          <CardDescription>
            Results are limited to your allocated customers (admins: all allocated), highest
            totals first.
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
                <option value="gold">Push to Gold (≥75k &lt;200k)</option>
                <option value="platinum">Push to Platinum (≥200k)</option>
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
                  ? "No allocated customers match these filters."
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
                <div className="space-y-1">
                  <CardTitle className="text-xl">Customer (limited view)</CardTitle>
                  <CardDescription>
                    Allocated merchant:{" "}
                    <span className="font-medium text-foreground">
                      {insight.assignedMerchant ?? "Unallocated"}
                    </span>
                  </CardDescription>
                </div>
                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <span
                    className={`inline-flex whitespace-nowrap rounded-md border px-2 py-1 text-xs font-semibold ${tierBadgeClass(insight.loyalty.key)}`}
                  >
                    {insight.loyalty.label}
                    {insight.loyalty.code ? ` (${insight.loyalty.code})` : ""}
                  </span>
                  <p className="text-sm font-medium">
                    Lifetime total:{" "}
                    {formatMoney(insight.loyalty.lifetimeTotal, insight.loyalty.currency)}
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  You are not the allocated merchant. Profile, progress bar, contacted, top
                  items, spend over time, and invoice line items are hidden.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Owner profile */}
          {isOwner && insight.contact && (
            <Card>
              <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-xl">{insight.contact.name}</CardTitle>
                  <CardDescription className="space-y-0.5">
                    <span className="block">
                      {insight.contact.phoneNumber ??
                        insight.contact.phones[0] ??
                        "No phone"}
                    </span>
                    {insight.contact.email ? (
                      <span className="block">{insight.contact.email}</span>
                    ) : null}
                    <span className="block font-medium text-foreground">
                      Allocated: {insight.assignedMerchant ?? "—"}
                    </span>
                    <span className="block">
                      DOB:{" "}
                      {formatDob(
                        insight.contact.birthYear,
                        insight.contact.birthMonth,
                        insight.contact.birthDay
                      )}
                    </span>
                    {insight.lastContactedAt ? (
                      <span className="block">
                        Last contacted: {formatAppDateTime(insight.lastContactedAt)}
                      </span>
                    ) : (
                      <span className="block">Last contacted: —</span>
                    )}
                  </CardDescription>
                </div>
                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <span
                    className={`inline-flex whitespace-nowrap rounded-md border px-2 py-1 text-xs font-semibold ${tierBadgeClass(insight.loyalty.key)}`}
                  >
                    {insight.loyalty.label}
                    {insight.loyalty.code ? ` (${insight.loyalty.code})` : ""}
                  </span>
                  <p className="text-sm font-medium">
                    Lifetime total:{" "}
                    {formatMoney(insight.loyalty.lifetimeTotal, insight.loyalty.currency)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {insight.canEditProfile ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isBusy}
                        onClick={() => setEditing((v) => !v)}
                      >
                        {editing ? "Cancel edit" : "Edit profile"}
                      </Button>
                    ) : null}
                    {insight.canMarkContacted ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => void markContacted()}
                      >
                        {busyKey === "contacted" ? (
                          <Loader2 className="animate-spin" aria-hidden />
                        ) : null}
                        Contacted
                      </Button>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              {editing && profileForm ? (
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["name", "Name"],
                      ["email", "Email"],
                      ["phoneNumber", "Phone"],
                      ["birthYear", "Birth year"],
                      ["birthMonth", "Birth month"],
                      ["birthDay", "Birth day"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="space-y-1 text-sm">
                      <span className="text-muted-foreground">{label}</span>
                      <Input
                        value={profileForm[key]}
                        onChange={(e) =>
                          setProfileForm((prev) =>
                            prev ? { ...prev, [key]: e.target.value } : prev
                          )
                        }
                        disabled={isBusy}
                      />
                    </label>
                  ))}
                  <div className="sm:col-span-2">
                    <Button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void saveProfile()}
                    >
                      Save profile
                    </Button>
                  </div>
                </CardContent>
              ) : null}
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Groups: under {formatMoney(LOYALTY_GOLD_MIN)} Standard ·{" "}
                  {formatMoney(LOYALTY_GOLD_MIN)}–{formatMoney(LOYALTY_PLATINUM_MIN)} Gold
                  (loyalcs) · {formatMoney(LOYALTY_PLATINUM_MIN)}+ Platinum (loyalcs2).
                  Cancelled Cosmo orders are listed but excluded from the lifetime total.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Progress bar — owner only */}
          {isOwner && insight.progressBar && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Purchasing performance</CardTitle>
                <CardDescription>
                  Milestones at Gold ({formatMoney(LOYALTY_GOLD_MIN)}) and Platinum (
                  {formatMoney(LOYALTY_PLATINUM_MIN)}). Current lifetime total is shown on
                  the bar.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative h-8 overflow-hidden rounded-md bg-muted">
                  <div
                    className="absolute inset-y-0 left-0 bg-primary/80"
                    style={{
                      width: `${Math.round(progressBarFillRatio(insight.progressBar.currentTotal) * 100)}%`,
                    }}
                  />
                  <div
                    className="absolute inset-y-0 w-0.5 bg-amber-600"
                    style={{ left: `${Math.round(goldMilestoneRatio() * 100)}%` }}
                    title="Gold"
                  />
                  <div
                    className="absolute inset-y-0 right-0 w-0.5 bg-slate-700"
                    title="Platinum"
                  />
                </div>
                <p className="text-sm font-semibold tabular-nums">
                  Current total:{" "}
                  {formatMoney(
                    insight.progressBar.currentTotal,
                    insight.loyalty.currency
                  )}
                </p>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0</span>
                  <span>Gold {formatMoney(LOYALTY_GOLD_MIN)}</span>
                  <span>Platinum {formatMoney(LOYALTY_PLATINUM_MIN)}</span>
                </div>
                {insight.progressBar.amountToNext > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {formatMoney(insight.progressBar.amountToNext)} to next milestone
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Platinum milestone reached</p>
                )}
              </CardContent>
            </Card>
          )}

          {isOwner && insight.frequency && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="Orders (loyalty)" value={String(insight.frequency.orderCount)} />
              <Kpi
                label="First order"
                value={
                  insight.frequency.firstOrderAt
                    ? formatDate(insight.frequency.firstOrderAt)
                    : "—"
                }
              />
              <Kpi
                label="Last order"
                value={
                  insight.frequency.lastOrderAt
                    ? formatDate(insight.frequency.lastOrderAt)
                    : "—"
                }
              />
              <Kpi
                label="Avg days between"
                value={
                  insight.frequency.avgDaysBetweenOrders != null
                    ? String(insight.frequency.avgDaysBetweenOrders)
                    : "—"
                }
              />
            </div>
          )}

          {isOwner && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Top items</CardTitle>
                  <CardDescription>
                    Click an item to jump to invoices that include it (this page).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!insight.topItems || insight.topItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No purchased items yet.</p>
                  ) : (
                    <ul className="space-y-3">
                      {insight.topItems.map((item) => {
                        const pct = Math.max(4, Math.round((item.spend / maxTopSpend) * 100));
                        const active = itemFilter === item.name;
                        return (
                          <li key={item.name}>
                            <button
                              type="button"
                              onClick={() => focusInvoicesForItem(item.name)}
                              className={`w-full rounded-md border px-3 py-2 text-left transition hover:bg-muted/40 ${
                                active ? "border-primary bg-primary/5" : "border-border/70"
                              }`}
                            >
                              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                                <span className="text-sm font-medium leading-snug break-words pr-2">
                                  {item.name}
                                </span>
                                <span className="shrink-0 text-xs tabular-nums text-muted-foreground sm:text-sm">
                                  qty {item.quantity} · {formatMoney(item.spend)}
                                </span>
                              </div>
                              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full bg-primary"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Spend over time</CardTitle>
                  <CardDescription>
                    Loyalty-eligible spend by month (newest first).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {spendSeriesNewestFirst.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No loyalty-eligible monthly spend to show yet.
                    </p>
                  ) : (
                    <ul className="max-h-80 space-y-2.5 overflow-y-auto pr-1">
                      {spendSeriesNewestFirst.map((point) => {
                        const pct = Math.max(
                          4,
                          Math.round((point.spend / maxMonthSpend) * 100)
                        );
                        return (
                          <li
                            key={point.month}
                            className="rounded-md border border-border/70 px-3 py-2"
                          >
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="text-sm font-medium">
                                {formatMonthLabel(point.month)}
                              </span>
                              <span className="shrink-0 text-sm tabular-nums font-medium">
                                {formatMoney(point.spend)}
                              </span>
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {point.orderCount} invoice
                              {point.orderCount === 1 ? "" : "s"}
                            </div>
                            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

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
        </>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
