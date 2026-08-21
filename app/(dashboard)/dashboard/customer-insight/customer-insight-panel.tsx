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
import { Calendar, Check, ChevronsUpDown, Crown, Download, Loader2, Mail, MapPin, Phone, Search, ShieldCheck, UserRound, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { invoiceLineDisplayName } from "@/lib/customer-insight/invoices";
import { appendInsightFilterList } from "@/lib/customer-insight/filter-query-params";
import { isNonProductInsightItem } from "@/lib/customer-insight/item-junk";
import { formatRemovedEmailLabel } from "@/lib/contacts/removed-email-label";
import { isCompletePhoneSearch } from "@/lib/phone-lookup";
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
import { formatAppDate, formatAppDateTime } from "@/lib/format-datetime";
import { loyaltyProfileIncompleteMessage, getLoyaltyProfileMissingFields } from "@/lib/customer-insight/loyalty-profile-complete";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

const CHART_BLUE = "#3b82f6";

function loyaltyEligibleCopy(eligibility: {
  suggestedTier: "gold" | "platinum";
  kind: "new" | "upgrade";
}) {
  const next = eligibility.suggestedTier === "platinum" ? "Platinum" : "Gold";
  if (eligibility.kind === "upgrade") {
    return "Eligible for Platinum (currently Gold)";
  }
  return `Eligible for ${next} (still Standard)`;
}

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
  city: string;
  birthYear: string;
  birthMonth: string;
  birthDay: string;
};

const BIRTH_MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);
const BIRTH_DAY_OPTIONS = Array.from({ length: 31 }, (_, index) => index + 1);

function birthPartsToForm(
  year: number | null | undefined,
  month: number | null | undefined,
  day: number | null | undefined
) {
  return {
    birthYear: year != null && year >= 1900 && year <= 2100 ? String(year) : "",
    birthMonth: month != null && month >= 1 && month <= 12 ? String(month) : "",
    birthDay: day != null && day >= 1 && day <= 31 ? String(day) : "",
  };
}

function formBirthPartsToDb(form: Pick<ProfileForm, "birthYear" | "birthMonth" | "birthDay">) {
  const birthMonth = form.birthMonth ? Number(form.birthMonth) : null;
  const birthDay = form.birthDay ? Number(form.birthDay) : null;
  const yearText = form.birthYear.trim();
  const birthYear =
    yearText && Number.isFinite(Number(yearText)) ? Number(yearText) : null;
  return { birthYear, birthMonth, birthDay };
}

type InsightSelectOption = {
  value: string;
  label: string;
  sku?: string;
  keywords?: string;
};

type CallQueueRow = {
  contactId: string;
  name: string;
  phoneNumber: string | null;
  assignedMerchant: string | null;
  lifetimeTotal: number;
  lastPurchaseAt: string | null;
  lastContactedAt: string | null;
  queued: boolean;
};

function formatQueueDate(value: string | null) {
  return value ? formatAppDate(value) : "Never";
}

function normalizeSelectOptions(
  options: string[] | InsightSelectOption[]
): InsightSelectOption[] {
  return options.map((option) =>
    typeof option === "string"
      ? { value: option, label: option }
      : { ...option, keywords: option.keywords ?? "" }
  );
}

function InsightSearchableMultiSelect({
  values,
  options,
  placeholder,
  searchPlaceholder,
  allLabel = "Any",
  disabled,
  disableLocalFilter,
  onChange,
  onQueryChange,
}: {
  values: string[];
  options: string[] | InsightSelectOption[];
  placeholder: string;
  searchPlaceholder: string;
  allLabel?: string;
  disabled?: boolean;
  disableLocalFilter?: boolean;
  onChange: (next: string[]) => void;
  onQueryChange?: (q: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const normalized = normalizeSelectOptions(options);
  const selected = values
    .map(
      (value) =>
        normalized.find((option) => option.value === value) ?? {
          value,
          label: value,
          sku: undefined,
          keywords: "",
        }
    )
    .filter(Boolean);

  const triggerLabel =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? selected[0]?.sku
          ? `${selected[0].label} · ${selected[0].sku}`
          : selected[0]?.label
        : `${selected.length} selected`;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) onQueryChange?.("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="border-input h-9 w-full justify-between px-3 font-normal"
        >
          <span
            className={cn(
              "min-w-0 truncate text-left",
              selected.length === 0 && "text-muted-foreground"
            )}
            title={selected.map((option) => option.label).join(", ") || allLabel}
          >
            {triggerLabel}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(var(--radix-popover-trigger-width),100vw)] min-w-[22rem] p-0"
        align="start"
      >
        <Command shouldFilter={!disableLocalFilter}>
          <CommandInput
            placeholder={searchPlaceholder}
            onValueChange={(q) => onQueryChange?.(q)}
          />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={allLabel}
                onSelect={() => {
                  onChange([]);
                }}
              >
                <Check className={cn("size-4", values.length === 0 ? "opacity-100" : "opacity-0")} />
                {allLabel}
              </CommandItem>
              {normalized.map((option) => {
                const checked = values.includes(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    value={`${option.label} ${option.sku ?? ""} ${option.keywords ?? ""}`.trim()}
                    onSelect={() => {
                      onChange(
                        checked
                          ? values.filter((value) => value !== option.value)
                          : [...values, option.value]
                      );
                    }}
                    className="items-start"
                  >
                    <Check
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        checked ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{option.label}</span>
                      {option.sku ? (
                        <span className="text-muted-foreground block truncate text-xs">
                          SKU: {option.sku}
                        </span>
                      ) : null}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function InsightSearchableSelect({
  value,
  options,
  placeholder,
  searchPlaceholder,
  allLabel = "Any",
  disabled,
  disableLocalFilter,
  onChange,
  onQueryChange,
}: {
  value: string;
  options: string[] | InsightSelectOption[];
  placeholder: string;
  searchPlaceholder: string;
  allLabel?: string;
  disabled?: boolean;
  disableLocalFilter?: boolean;
  onChange: (next: string) => void;
  onQueryChange?: (q: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const normalized = normalizeSelectOptions(options);
  const selected =
    normalized.find((option) => option.value === value) ??
    (value
      ? { value, label: value, sku: undefined, keywords: "" }
      : undefined);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) onQueryChange?.("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="border-input h-9 w-full justify-between px-3 font-normal"
        >
          <span
            className={cn("min-w-0 truncate text-left", !selected && "text-muted-foreground")}
            title={
              selected
                ? selected.sku
                  ? `${selected.label} · ${selected.sku}`
                  : selected.label
                : allLabel
            }
          >
            {selected?.label ?? allLabel}
            {selected?.sku ? (
              <span className="text-muted-foreground"> · {selected.sku}</span>
            ) : null}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(var(--radix-popover-trigger-width),100vw)] min-w-[22rem] p-0"
        align="start"
      >
        <Command shouldFilter={!disableLocalFilter}>
          <CommandInput
            placeholder={searchPlaceholder}
            onValueChange={(q) => onQueryChange?.(q)}
          />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={allLabel}
                onSelect={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                <Check className={cn("size-4", !value ? "opacity-100" : "opacity-0")} />
                {allLabel}
              </CommandItem>
              {normalized.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.sku ?? ""} ${option.keywords ?? ""}`.trim()}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className="items-start"
                >
                  <Check
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{option.label}</span>
                    {option.sku ? (
                      <span className="text-muted-foreground block truncate text-xs">
                        SKU: {option.sku}
                      </span>
                    ) : null}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function CustomerInsightPanel({
  canFilterAllContacts = false,
  canExportFilteredCsv = false,
  canAddContactPhone = false,
  canManageLoyalty = false,
  canAssignLoyalty = false,
  initialContactId = null,
  initialEdit = false,
}: {
  canFilterAllContacts?: boolean;
  canExportFilteredCsv?: boolean;
  /** contacts.merge — link extra phones (old numbers kept). */
  canAddContactPhone?: boolean;
  canManageLoyalty?: boolean;
  canAssignLoyalty?: boolean;
  initialContactId?: string | null;
  initialEdit?: boolean;
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
  const [filterBrands, setFilterBrands] = useState<string[]>([]);
  const [brandOptions, setBrandOptions] = useState<string[]>([]);
  const [filterItems, setFilterItems] = useState<string[]>([]);
  const [itemOptions, setItemOptions] = useState<InsightSelectOption[]>([]);
  const [itemSearch, setItemSearch] = useState("");
  const [itemSearchDebounced, setItemSearchDebounced] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [filterAssignedMerchant, setFilterAssignedMerchant] = useState("");
  const [merchantOptions, setMerchantOptions] = useState<InsightSelectOption[]>([]);
  const [filterPurchaseLocationId, setFilterPurchaseLocationId] = useState("");
  const [locationOptions, setLocationOptions] = useState<InsightSelectOption[]>([]);
  const [filterBirthdayFrom, setFilterBirthdayFrom] = useState("");
  const [filterBirthdayTo, setFilterBirthdayTo] = useState("");
  const [filterLastFrom, setFilterLastFrom] = useState("");
  const [filterLastTo, setFilterLastTo] = useState("");
  const [filterLoyaltyRegFrom, setFilterLoyaltyRegFrom] = useState("");
  const [filterLoyaltyRegTo, setFilterLoyaltyRegTo] = useState("");
  const [filterNoPurchaseFrom, setFilterNoPurchaseFrom] = useState("");
  const [filterNoPurchaseTo, setFilterNoPurchaseTo] = useState("");
  const [filterMin, setFilterMin] = useState("");
  const [filterMax, setFilterMax] = useState("");
  const [filterResults, setFilterResults] = useState<AllocatedFilterItemDto[] | null>(
    null
  );
  const [filterTotal, setFilterTotal] = useState(0);
  const [filterPage, setFilterPage] = useState(1);
  const filterPageSize = 25;
  const [contactHistory, setContactHistory] = useState<
    Array<{
      id: string;
      createdAt: string;
      merchantName: string | null;
      category: string | null;
      remark: string | null;
      outcome: string | null;
    }>
  >([]);
  const [callOutcome, setCallOutcome] = useState<string>("N/A");
  const [contactRemark, setContactRemark] = useState("");
  const [loyaltyQueue, setLoyaltyQueue] = useState<
    Array<{
      contactId: string;
      name: string;
      phoneNumber: string | null;
      lifetimeTotal: number;
      suggestedTier: "gold" | "platinum" | null;
      eligibleGroup: string | null;
      suggestionKind?: "new" | "upgrade" | null;
      currentAssignedTier?: "gold" | "platinum" | null;
      erpGroup: string | null;
      shopifyTag: string | null;
      assignedMerchant: string | null;
      missingProfileFields: string[];
    }>
  >([]);
  const [myCallQueue, setMyCallQueue] = useState<CallQueueRow[]>([]);
  const [queueMerchant, setQueueMerchant] = useState("");
  const [queueCandidates, setQueueCandidates] = useState<CallQueueRow[] | null>(null);
  const [queueCandidateTotal, setQueueCandidateTotal] = useState(0);
  const [queueCandidatePage, setQueueCandidatePage] = useState(1);
  const queueCandidatePageSize = 50;
  const [queueSelectedIds, setQueueSelectedIds] = useState<string[]>([]);
  const invoicesRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);

  const isBusy = busyKey !== null;
  const isOwner = insight?.visibility === "owner";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/customer-insight/filter-options?type=brands`
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const brands = Array.isArray(data.brands)
          ? (data.brands as unknown[]).filter((b): b is string => typeof b === "string")
          : Array.isArray(data.options)
            ? (data.options as Array<{ value?: string }>)
                .map((o) => o.value)
                .filter((b): b is string => typeof b === "string")
            : [];
        setBrandOptions(brands);
      } catch {
        // Options optional
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setItemSearchDebounced(itemSearch), 250);
    return () => window.clearTimeout(t);
  }, [itemSearch]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const params = new URLSearchParams({ type: "items" });
        appendInsightFilterList(params, "brand", filterBrands);
        if (itemSearchDebounced.trim()) params.set("q", itemSearchDebounced.trim());
        const res = await fetch(
          `/api/admin/customer-insight/filter-options?${params.toString()}`
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const items = Array.isArray(data.options)
          ? (data.options as Array<{ value?: string; label?: string; sku?: string | null }>)
              .filter((o): o is { value: string; label?: string; sku?: string | null } =>
                typeof o.value === "string"
              )
              .map((o) => ({
                value: o.value,
                label: o.label ?? o.value,
                sku: o.sku?.trim() || undefined,
                keywords: o.sku?.trim() ?? "",
              }))
              .filter(
                (o) =>
                  !isNonProductInsightItem({
                    title: o.label,
                    sku: o.sku,
                  })
              )
          : [];
        setItemOptions(items);
      } catch {
        // optional
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filterBrands, itemSearchDebounced]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/customer-insight/filter-options?type=cities`
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const cities = Array.isArray(data.options)
          ? (data.options as Array<{ value?: string }>)
              .map((o) => o.value)
              .filter((c): c is string => typeof c === "string")
          : [];
        setCityOptions(cities);
      } catch {
        // optional
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!canExportFilteredCsv) return;
    let cancelled = false;
    void (async () => {
      try {
        const [merchantsRes, locationsRes] = await Promise.all([
          fetch(`/api/admin/customer-insight/filter-options?type=merchants`),
          fetch(`/api/admin/customer-insight/filter-options?type=locations`),
        ]);
        const merchantsData = await merchantsRes.json().catch(() => ({}));
        const locationsData = await locationsRes.json().catch(() => ({}));
        if (cancelled) return;
        if (merchantsRes.ok && Array.isArray(merchantsData.options)) {
          setMerchantOptions(
            (merchantsData.options as Array<{ value?: string; label?: string }>)
              .filter((o): o is { value: string; label?: string } => typeof o.value === "string")
              .map((o) => ({ value: o.value, label: o.label ?? o.value }))
          );
        }
        if (locationsRes.ok && Array.isArray(locationsData.options)) {
          setLocationOptions(
            (locationsData.options as Array<{ value?: string; label?: string }>)
              .filter((o): o is { value: string; label?: string } => typeof o.value === "string")
              .map((o) => ({ value: o.value, label: o.label ?? o.value }))
          );
        }
      } catch {
        // optional
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canExportFilteredCsv]);

  async function loadMyCallQueue() {
    try {
      const res = await fetch("/api/admin/customer-insight/call-queue");
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.items)) return;
      setMyCallQueue(data.items as CallQueueRow[]);
    } catch {
      // optional
    }
  }

  useEffect(() => {
    void loadMyCallQueue();
  }, []);

  async function loadQueueCandidates(page = 1) {
    if (!queueMerchant.trim()) {
      notify.error("Select a merchant.");
      return;
    }
    setBusyKey("queue-candidates");
    try {
      const params = new URLSearchParams();
      params.set("assignedMerchant", queueMerchant.trim());
      params.set("page", String(page));
      params.set("pageSize", String(queueCandidatePageSize));
      const res = await fetch(
        `/api/admin/customer-insight/call-queue/candidates?${params}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(data.error ?? "Failed to load allocated contacts.");
        return;
      }
      setQueueCandidates((data.items ?? []) as CallQueueRow[]);
      setQueueCandidateTotal(data.pagination?.total ?? 0);
      setQueueCandidatePage(data.pagination?.page ?? page);
      setQueueSelectedIds([]);
    } catch {
      notify.error("Failed to load allocated contacts.");
    } finally {
      setBusyKey(null);
    }
  }

  async function assignSelectedToQueue() {
    if (!queueMerchant.trim() || queueSelectedIds.length === 0) {
      notify.error("Select contacts to assign.");
      return;
    }
    setBusyKey("queue-assign");
    try {
      const res = await fetch("/api/admin/customer-insight/call-queue/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignedMerchant: queueMerchant.trim(),
          contactIds: queueSelectedIds,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(data.error ?? "Failed to assign queue.");
        return;
      }
      notify.success(`Assigned ${data.assigned ?? queueSelectedIds.length} contact(s).`);
      await loadQueueCandidates(queueCandidatePage);
    } catch {
      notify.error("Failed to assign queue.");
    } finally {
      setBusyKey(null);
    }
  }

  async function openQueueContact(contactId: string) {
    await loadInsight(contactId, 1);
    setEditing(true);
  }

  useEffect(() => {
    if (!canManageLoyalty) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/customer-insight/loyalty-queue");
        const data = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        setLoyaltyQueue(Array.isArray(data.items) ? data.items : []);
      } catch {
        // optional
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canManageLoyalty]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#loyalty-queue") return;
    document.getElementById("loyalty-queue")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loyaltyQueue]);

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
    const exactNumber = isCompletePhoneSearch(q);
    if (exactNumber) {
      clearFilters();
    }
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
      await loadInsight(
        autoOpenId,
        1,
        exactNumber ? { brands: [], items: [] } : undefined
      );
    }
  }

  async function loadInsight(
    contactId: string,
    page: number,
    scopeOverride?: { brands?: string[]; items?: string[] }
  ) {
    setBusyKey(`insight-${contactId}`);
    setEditing(false);
    setSelectedContactId(contactId);
    setItemFilter(null);
    try {
      const brands = scopeOverride?.brands ?? filterBrands;
      const items = scopeOverride?.items ?? filterItems;
      const params = new URLSearchParams({
        invoicesPage: String(page),
        invoicesPageSize: "25",
      });
      appendInsightFilterList(params, "brand", brands);
      appendInsightFilterList(params, "item", items);
      const res = await fetch(
        `/api/admin/customer-insight/${encodeURIComponent(contactId)}?${params}`
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
          city: next.contact.city ?? "",
          ...birthPartsToForm(
            next.contact.birthYear,
            next.contact.birthMonth,
            next.contact.birthDay
          ),
        });
        try {
          const hRes = await fetch(
            `/api/admin/customer-insight/${encodeURIComponent(contactId)}/contact-history`
          );
          const hData = await hRes.json().catch(() => ({}));
          if (hRes.ok && Array.isArray(hData.items)) {
            setContactHistory(hData.items);
          } else {
            setContactHistory([]);
          }
        } catch {
          setContactHistory([]);
        }
      } else {
        setProfileForm(null);
        setContactHistory([]);
      }
      if (page === 1) {
        requestAnimationFrame(() => {
          detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    } catch {
      notify.error("Failed to load customer insight.");
      setInsight(null);
    } finally {
      setBusyKey(null);
    }
  }

  useEffect(() => {
    if (!initialContactId) return;
    void (async () => {
      await loadInsight(initialContactId, 1);
      if (initialEdit) setEditing(true);
    })();
    // Open linked contact from merchant dashboard once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialContactId]);

  async function saveProfile() {
    if (!selectedContactId || !profileForm) return;
    setBusyKey("profile");
    try {
      const dob = formBirthPartsToDb(profileForm);
      const addPhone = profileForm.addPhoneNumber.trim();
      const body: Record<string, unknown> = {
        name: profileForm.name.trim(),
        email: profileForm.email.trim() || null,
        gender: profileForm.gender || null,
        language: profileForm.language || null,
        address: profileForm.address.trim() || null,
        city: profileForm.city.trim() || null,
        birthYear: dob.birthYear,
        birthMonth: dob.birthMonth,
        birthDay: dob.birthDay,
      };
      if (addPhone) {
        if (!canAddContactPhone) {
          notify.error("You do not have permission to add phone numbers.");
          setBusyKey(null);
          return;
        }
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
      void loadMyCallQueue();
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
          body: JSON.stringify({
            category: callOutcome,
            remark: contactRemark.trim() || null,
            outcome: "general",
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(data.error ?? "Failed to save call outcome.");
        return;
      }
      notify.success(`Saved outcome: ${data.category ?? callOutcome}`);
      setContactRemark("");
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
      if (selectedContactId) {
        void loadInsight(selectedContactId, invoicePage);
      }
      void loadMyCallQueue();
    } catch {
      notify.error("Failed to save call outcome.");
    } finally {
      setBusyKey(null);
    }
  }

  async function postLoyaltyOutreach(action: "loyalty_informed" | "responded" | "not_responded") {
    const contact = insight?.contact;
    if (!contact) return;
    if (action === "responded") {
      const missing = getLoyaltyProfileMissingFields({
        name: contact.name,
        email: contact.email,
        phoneNumber: contact.phoneNumber,
        phones: contact.phones,
        gender: contact.gender,
        language: contact.language,
        birthMonth: contact.birthMonth,
        birthDay: contact.birthDay,
        city: contact.city,
        address: contact.address,
      });
      if (missing.length > 0) {
        notify.error(loyaltyProfileIncompleteMessage(missing));
        setEditing(true);
        return;
      }
    }
    setBusyKey("loyalty");
    try {
      const res = await fetch("/api/admin/merchant-dashboard/loyalty-outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact.id, action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(json.error ?? "Update failed");
        return;
      }
      notify.success(
        action === "responded"
          ? "Responded request sent to assignment queue"
          : action === "not_responded"
            ? "Marked not responded"
            : "Marked contacted"
      );
      await loadInsight(contact.id, invoicePage);
    } catch {
      notify.error("Update failed");
    } finally {
      setBusyKey(null);
    }
  }

  async function runFilters(page = 1) {
    setBusyKey("filter");
    setFilterPage(page);
    try {
      const params = buildFilterParams(page);
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

  function buildFilterParams(page = 1) {
    const params = new URLSearchParams();
    appendInsightFilterList(params, "brand", filterBrands);
    appendInsightFilterList(params, "item", filterItems);
    if (filterCity.trim()) params.set("city", filterCity.trim());
    if (canExportFilteredCsv && filterAssignedMerchant.trim()) {
      params.set("assignedMerchant", filterAssignedMerchant.trim());
    }
    if (canExportFilteredCsv && filterPurchaseLocationId.trim()) {
      params.set("purchaseLocationId", filterPurchaseLocationId.trim());
    }
    if (filterBirthdayFrom.trim() && filterBirthdayTo.trim()) {
      params.set("birthdayFrom", filterBirthdayFrom.trim());
      params.set("birthdayTo", filterBirthdayTo.trim());
    }
    if (filterLastFrom.trim()) params.set("lastContactedFrom", filterLastFrom.trim());
    if (filterLastTo.trim()) params.set("lastContactedTo", filterLastTo.trim());
    if (filterLoyaltyRegFrom.trim()) {
      params.set("loyaltyRegisteredFrom", filterLoyaltyRegFrom.trim());
    }
    if (filterLoyaltyRegTo.trim()) {
      params.set("loyaltyRegisteredTo", filterLoyaltyRegTo.trim());
    }
    if (filterNoPurchaseFrom.trim() && filterNoPurchaseTo.trim()) {
      params.set("noPurchaseFrom", filterNoPurchaseFrom.trim());
      params.set("noPurchaseTo", filterNoPurchaseTo.trim());
    }
    if (filterMin.trim()) params.set("minTotal", filterMin.trim());
    if (filterMax.trim()) params.set("maxTotal", filterMax.trim());
    params.set("page", String(page));
    params.set("pageSize", String(filterPageSize));
    return params;
  }

  async function exportFilteredCsv() {
    if (!canExportFilteredCsv) return;
    setBusyKey("export-filter");
    try {
      const params = buildFilterParams(1);
      params.delete("page");
      params.delete("pageSize");
      const res = await fetch(
        `/api/admin/customer-insight/filter/export?${params.toString()}`
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        notify.error(
          typeof data.error === "string" ? data.error : "Export failed."
        );
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "customer-insight-filter-export.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      notify.success("Filter export downloaded.");
    } catch {
      notify.error("Export failed.");
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

  const filterTotalPages = Math.max(1, Math.ceil(filterTotal / filterPageSize));

  const hasActiveFilters =
    Boolean(
      filterBrands.length > 0 ||
        filterItems.length > 0 ||
        filterCity.trim() ||
        filterAssignedMerchant.trim() ||
        filterPurchaseLocationId.trim() ||
        filterBirthdayFrom.trim() ||
        filterBirthdayTo.trim() ||
        filterLastFrom.trim() ||
        filterLastTo.trim() ||
        filterLoyaltyRegFrom.trim() ||
        filterLoyaltyRegTo.trim() ||
        filterNoPurchaseFrom.trim() ||
        filterNoPurchaseTo.trim() ||
        filterMin.trim() ||
        filterMax.trim() ||
        filterResults
    );

  function clearFilters() {
    setFilterBrands([]);
    setFilterItems([]);
    setItemSearch("");
    setItemSearchDebounced("");
    setFilterCity("");
    setFilterAssignedMerchant("");
    setFilterPurchaseLocationId("");
    setFilterBirthdayFrom("");
    setFilterBirthdayTo("");
    setFilterLastFrom("");
    setFilterLastTo("");
    setFilterLoyaltyRegFrom("");
    setFilterLoyaltyRegTo("");
    setFilterNoPurchaseFrom("");
    setFilterNoPurchaseTo("");
    setFilterMin("");
    setFilterMax("");
    setFilterResults(null);
    setFilterTotal(0);
    setFilterPage(1);
  }

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
    insight?.progressBar?.tier === "platinum"
      ? "Platinum"
      : insight?.progressBar?.tier === "gold"
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

      {canManageLoyalty ? (
        <Card id="loyalty-queue">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Loyalty assignment queue</CardTitle>
            <CardDescription>
              Only contacts the allocated merchant marked Responded. Assign Gold or
              Platinum from lifetime spend.
              {canAssignLoyalty
                ? " Send writes ERP customer group and Shopify tag."
                : " Read-only."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loyaltyQueue.length === 0 ? (
              <p className="text-muted-foreground text-sm">Queue empty.</p>
            ) : (
              <ul className="space-y-2">
                {loyaltyQueue.map((row) => (
                  <li
                    key={row.contactId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">{row.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {row.phoneNumber ? `${row.phoneNumber} · ` : null}
                        {formatMoney(row.lifetimeTotal)}
                      </p>
                      <p className="text-xs">
                        Eligible:{" "}
                        <span className="font-medium">
                          {row.suggestionKind === "upgrade"
                            ? "Platinum (upgrade from Gold)"
                            : (row.eligibleGroup ?? "Standard (not Gold/Platinum yet)")}
                        </span>
                        {row.erpGroup ? ` · ERP ${row.erpGroup}` : null}
                        {row.shopifyTag ? ` · Shopify “${row.shopifyTag}”` : null}
                      </p>
                      {row.missingProfileFields?.length ? (
                        <p className="text-amber-700 dark:text-amber-400 text-xs">
                          Missing details: {row.missingProfileFields.join(", ")}
                        </p>
                      ) : null}
                    </div>
                    {canAssignLoyalty && row.suggestedTier ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => {
                          void (async () => {
                            if (row.missingProfileFields?.length) {
                              notify.error(
                                loyaltyProfileIncompleteMessage(row.missingProfileFields)
                              );
                              return;
                            }
                            setBusyKey("loyalty-assign");
                            try {
                              const res = await fetch(
                                `/api/admin/customer-insight/${encodeURIComponent(row.contactId)}/loyalty-assign`,
                                {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    tier: row.suggestedTier,
                                  }),
                                }
                              );
                              const data = await res.json().catch(() => ({}));
                              if (!res.ok) {
                                notify.error(data.error ?? "Assign failed");
                                return;
                              }
                              const pushErrors = Array.isArray(data.pushErrors)
                                ? (data.pushErrors as string[])
                                : [];
                              if (pushErrors.length > 0) {
                                notify.error(
                                  `Assigned ${row.eligibleGroup}, but some ERP/Shopify updates failed`
                                );
                              } else {
                                notify.success(
                                  `Sent to ${row.eligibleGroup} (ERP ${row.erpGroup}, Shopify ${row.shopifyTag})`
                                );
                              }
                              setLoyaltyQueue((prev) =>
                                prev.filter((x) => x.contactId !== row.contactId)
                              );
                            } catch {
                              notify.error("Assign failed");
                            } finally {
                              setBusyKey(null);
                            }
                          })();
                        }}
                      >
                        Send to {row.eligibleGroup}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      {myCallQueue.length > 0 || !canExportFilteredCsv ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Call update queue</CardTitle>
            <CardDescription>
              Contacts admin assigned for you to call. Never/oldest contacted first. Update
              writes Contact Master; logging a call outcome also clears the row.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {myCallQueue.length === 0 ? (
              <p className="text-muted-foreground text-sm">No assigned call-update contacts.</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {myCallQueue.map((row) => (
                  <li
                    key={row.contactId}
                    className="flex flex-col gap-2 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{row.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {row.phoneNumber ?? "No phone"} · tot {formatMoney(row.lifetimeTotal)}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        Last contacted {formatQueueDate(row.lastContactedAt)} · last purchased{" "}
                        {formatQueueDate(row.lastPurchaseAt)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={isBusy}
                      onClick={() => void openQueueContact(row.contactId)}
                    >
                      Update
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      {canExportFilteredCsv ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Assign merchant call queue</CardTitle>
            <CardDescription>
              Pick a merchant, load allocated customers (no recent update first, recently
              called last), then bulk-assign to their Insight call list.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="min-w-0 flex-1 space-y-1 text-sm">
                <span className="text-muted-foreground">Merchant</span>
                <InsightSearchableSelect
                  value={queueMerchant}
                  options={merchantOptions}
                  placeholder="Select merchant"
                  searchPlaceholder="Search merchants…"
                  disabled={isBusy}
                  onChange={(next) => {
                    setQueueMerchant(next);
                    setQueueCandidates(null);
                    setQueueSelectedIds([]);
                  }}
                />
              </label>
              <Button
                type="button"
                disabled={isBusy || !queueMerchant}
                onClick={() => void loadQueueCandidates(1)}
              >
                {busyKey === "queue-candidates" ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden />
                    Loading...
                  </>
                ) : (
                  "Load allocated"
                )}
              </Button>
            </div>
            {queueCandidates ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {queueCandidateTotal} allocated · oldest/never contacted first
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isBusy || queueCandidates.length === 0}
                      onClick={() =>
                        setQueueSelectedIds(
                          queueSelectedIds.length === queueCandidates.length
                            ? []
                            : queueCandidates.map((row) => row.contactId)
                        )
                      }
                    >
                      {queueSelectedIds.length === queueCandidates.length
                        ? "Clear page"
                        : "Select page"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={isBusy || queueSelectedIds.length === 0}
                      onClick={() => void assignSelectedToQueue()}
                    >
                      {busyKey === "queue-assign" ? (
                        <>
                          <Loader2 className="animate-spin" aria-hidden />
                          Assigning...
                        </>
                      ) : (
                        `Assign ${queueSelectedIds.length || ""}`.trim()
                      )}
                    </Button>
                  </div>
                </div>
                <ul className="max-h-[28rem] divide-y overflow-auto rounded-md border">
                  {queueCandidates.map((row) => {
                    const checked = queueSelectedIds.includes(row.contactId);
                    return (
                      <li key={row.contactId}>
                        <label className="flex cursor-pointer items-start gap-3 px-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={checked}
                            onChange={() =>
                              setQueueSelectedIds((prev) =>
                                checked
                                  ? prev.filter((id) => id !== row.contactId)
                                  : [...prev, row.contactId]
                              )
                            }
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium">
                              {row.name}
                              {row.queued ? (
                                <span className="text-muted-foreground ml-2 text-xs font-normal">
                                  already queued
                                </span>
                              ) : null}
                            </span>
                            <span className="text-muted-foreground block text-xs">
                              {row.phoneNumber ?? "No phone"} · tot{" "}
                              {formatMoney(row.lifetimeTotal)}
                            </span>
                            <span className="text-muted-foreground block text-xs">
                              Last contacted {formatQueueDate(row.lastContactedAt)} · last
                              purchased {formatQueueDate(row.lastPurchaseAt)}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                {queueCandidateTotal > queueCandidatePageSize ? (
                  <div className="flex items-center justify-between gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isBusy || queueCandidatePage <= 1}
                      onClick={() => void loadQueueCandidates(queueCandidatePage - 1)}
                    >
                      Previous
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Page {queueCandidatePage} of{" "}
                      {Math.max(
                        1,
                        Math.ceil(queueCandidateTotal / queueCandidatePageSize)
                      )}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={
                        isBusy ||
                        queueCandidatePage >=
                          Math.ceil(queueCandidateTotal / queueCandidatePageSize)
                      }
                      onClick={() => void loadQueueCandidates(queueCandidatePage + 1)}
                    >
                      Next
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {canFilterAllContacts ? "Customer filters" : "Allocated customer filters"}
          </CardTitle>
          <CardDescription>
            {canFilterAllContacts
              ? "Results include all company contacts matching your filters (allocated and unallocated)."
              : "Results are limited to your allocated customers."}{" "}
            Min/max total uses lifetime spend (completed Cosmo orders + Adapt history) across that
            full set. Without brands, highest lifetime totals first. Multiple brands = any of them
            (even one matching item). Ranked by combined spend on those brands. Multiple items =
            any selected item, ranked by combined item spend.
            {canExportFilteredCsv
              ? " Last purchase location keeps contacts whose newest Cosmo/Adapt purchase was at that outlet."
              : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset className="space-y-3 rounded-lg border border-border/60 p-3">
            <legend className="px-1 text-xs font-medium text-muted-foreground">
              Phone search
            </legend>
            <p className="text-muted-foreground text-xs">
              Enter a full customer phone number for an exact match.
            </p>
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
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Brand</span>
              <InsightSearchableMultiSelect
                values={filterBrands}
                options={brandOptions}
                placeholder="Any"
                searchPlaceholder="Search brands…"
                disabled={isBusy}
                onChange={(next) => {
                  setFilterBrands(next);
                  setFilterItems([]);
                }}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Item</span>
              <InsightSearchableMultiSelect
                values={filterItems}
                options={itemOptions}
                placeholder="Any"
                searchPlaceholder="Search items or SKU…"
                disabled={isBusy}
                disableLocalFilter
                onChange={setFilterItems}
                onQueryChange={setItemSearch}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">City</span>
              <InsightSearchableSelect
                value={filterCity}
                options={cityOptions}
                placeholder="Any"
                searchPlaceholder="Search cities…"
                disabled={isBusy}
                onChange={setFilterCity}
              />
            </label>
            {canExportFilteredCsv ? (
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Allocated merchant</span>
                <InsightSearchableSelect
                  value={filterAssignedMerchant}
                  options={merchantOptions}
                  placeholder="Any"
                  searchPlaceholder="Search merchants…"
                  disabled={isBusy}
                  onChange={setFilterAssignedMerchant}
                />
              </label>
            ) : null}
            {canExportFilteredCsv ? (
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Last purchase location</span>
                <InsightSearchableSelect
                  value={filterPurchaseLocationId}
                  options={locationOptions}
                  placeholder="Any"
                  searchPlaceholder="Search locations…"
                  disabled={isBusy}
                  onChange={setFilterPurchaseLocationId}
                />
              </label>
            ) : null}
            <div className="grid grid-cols-2 gap-2 sm:col-span-2">
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
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <fieldset className="space-y-2 rounded-lg border border-border/60 p-3">
              <legend className="px-1 text-xs font-medium text-muted-foreground">
                Birthday (MM-DD)
              </legend>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">From</span>
                  <Input
                    value={filterBirthdayFrom}
                    onChange={(e) => setFilterBirthdayFrom(e.target.value)}
                    placeholder="08-01"
                    disabled={isBusy}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">To</span>
                  <Input
                    value={filterBirthdayTo}
                    onChange={(e) => setFilterBirthdayTo(e.target.value)}
                    placeholder="08-31"
                    disabled={isBusy}
                  />
                </label>
              </div>
            </fieldset>

            <fieldset className="space-y-2 rounded-lg border border-border/60 p-3">
              <legend className="px-1 text-xs font-medium text-muted-foreground">
                Last contacted
              </legend>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">From</span>
                  <Input
                    type="date"
                    value={filterLastFrom}
                    onChange={(e) => setFilterLastFrom(e.target.value)}
                    disabled={isBusy}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">To</span>
                  <Input
                    type="date"
                    value={filterLastTo}
                    onChange={(e) => setFilterLastTo(e.target.value)}
                    disabled={isBusy}
                  />
                </label>
              </div>
            </fieldset>

            <fieldset className="space-y-2 rounded-lg border border-border/60 p-3">
              <legend className="px-1 text-xs font-medium text-muted-foreground">
                Loyalty registered
              </legend>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">From</span>
                  <Input
                    type="date"
                    value={filterLoyaltyRegFrom}
                    onChange={(e) => setFilterLoyaltyRegFrom(e.target.value)}
                    disabled={isBusy}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">To</span>
                  <Input
                    type="date"
                    value={filterLoyaltyRegTo}
                    onChange={(e) => setFilterLoyaltyRegTo(e.target.value)}
                    disabled={isBusy}
                  />
                </label>
              </div>
            </fieldset>

            <fieldset className="space-y-2 rounded-lg border border-border/60 p-3">
              <legend className="px-1 text-xs font-medium text-muted-foreground">
                No purchase
              </legend>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">From</span>
                  <Input
                    type="date"
                    value={filterNoPurchaseFrom}
                    onChange={(e) => setFilterNoPurchaseFrom(e.target.value)}
                    disabled={isBusy}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">To</span>
                  <Input
                    type="date"
                    value={filterNoPurchaseTo}
                    onChange={(e) => setFilterNoPurchaseTo(e.target.value)}
                    disabled={isBusy}
                  />
                </label>
              </div>
            </fieldset>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" disabled={isBusy} onClick={() => void runFilters(1)}>
              {busyKey === "filter" ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Filtering...
                </>
              ) : (
                "Apply filters"
              )}
            </Button>
            {canExportFilteredCsv ? (
              <Button
                type="button"
                variant="outline"
                disabled={isBusy || !filterResults || filterTotal === 0}
                onClick={() => void exportFilteredCsv()}
              >
                {busyKey === "export-filter" ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="size-4" aria-hidden />
                    Export CSV
                  </>
                )}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              disabled={isBusy || !hasActiveFilters}
              onClick={clearFilters}
            >
              <X className="size-4" aria-hidden />
              Clear filters
            </Button>
          </div>
          {filterResults && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {filterTotal === 0
                    ? canFilterAllContacts
                      ? "No contacts match these filters."
                      : "No allocated customers match these filters."
                    : `${filterTotal} match(es), showing ${filterResults.length}.`}
                </p>
                {filterTotal > filterPageSize ? (
                  <p className="text-xs text-muted-foreground">
                    Page {filterPage} of {filterTotalPages}
                  </p>
                ) : null}
              </div>
              <ul className="divide-y rounded-md border">
                {filterResults.map((row) => (
                  <li key={row.contactId}>
                    <button
                      type="button"
                      className={`flex w-full flex-col gap-3 px-3 py-3 text-left transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${
                        selectedContactId === row.contactId
                          ? "border-l-2 border-l-primary bg-primary/15 hover:bg-primary/20"
                          : "hover:bg-muted/50"
                      }`}
                      disabled={isBusy}
                      onClick={() => void loadInsight(row.contactId, 1)}
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {row.name}
                        </p>
                        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                          <Phone className="size-3 shrink-0" aria-hidden />
                          <span className="truncate">{row.phoneNumber ?? "No phone"}</span>
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        <span
                          className={`inline-flex whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-semibold ${tierBadgeClass(row.loyalty.key)}`}
                        >
                          {row.loyalty.label}
                        </span>
                        {row.brandSpend != null ? (
                          <span className="rounded-md bg-muted/60 px-2 py-1 text-[11px] tabular-nums text-muted-foreground">
                            Brand{" "}
                            <span className="font-medium text-foreground">
                              {formatMoney(row.brandSpend)}
                            </span>
                          </span>
                        ) : null}
                        {row.itemSpend != null ? (
                          <span className="rounded-md bg-muted/60 px-2 py-1 text-[11px] tabular-nums text-muted-foreground">
                            Item{" "}
                            <span className="font-medium text-foreground">
                              {formatMoney(row.itemSpend)}
                            </span>
                          </span>
                        ) : null}
                        <span className="rounded-md bg-muted/60 px-2 py-1 text-[11px] tabular-nums text-muted-foreground">
                          Lifetime{" "}
                          <span className="font-medium text-foreground">
                            {formatMoney(row.lifetimeTotal)}
                          </span>
                        </span>
                        <span className="rounded-md bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground">
                          Last purchased{" "}
                          <span className="font-medium text-foreground">
                            {row.lastPurchaseAt
                              ? formatAppDate(row.lastPurchaseAt, "—")
                              : "never"}
                          </span>
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              {filterTotal > filterPageSize ? (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isBusy || filterPage <= 1}
                    onClick={() => void runFilters(filterPage - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isBusy || filterPage >= filterTotalPages}
                    onClick={() => void runFilters(filterPage + 1)}
                  >
                    Next
                  </Button>
                </div>
              ) : null}
            </div>
          )}
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
                onClick={() =>
                  void loadInsight(
                    m.id,
                    1,
                    isCompletePhoneSearch(phone) ? { brands: [], items: [] } : undefined
                  )
                }
                className="flex w-full flex-col rounded-md border px-3 py-2 text-left text-sm transition hover:bg-muted/50 disabled:opacity-50 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="font-medium">{m.name}</span>
                <span className="text-muted-foreground">
                  {m.phoneNumber ?? "—"}
                  {m.email ? ` · ${m.email}` : ""}
                  {m.suggestedTier
                    ? ` · ${loyaltyEligibleCopy({
                        suggestedTier: m.suggestedTier,
                        kind: m.suggestionKind === "upgrade" ? "upgrade" : "new",
                      })}`
                    : m.loyaltyAssignedTier === "platinum"
                      ? " · Platinum"
                      : m.loyaltyAssignedTier === "gold"
                        ? " · Gold"
                        : ""}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {insight && (
        <div ref={detailsRef} className="scroll-mt-4 space-y-6">
          {insight.historyScope ? (
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-medium">Filtered purchase history</p>
                  <p className="text-muted-foreground text-xs">
                    {insight.historyScope.brands.length
                      ? `Brands: ${insight.historyScope.brands.join(", ")}`
                      : null}
                    {insight.historyScope.brands.length &&
                    insight.historyScope.items.length
                      ? " · "
                      : null}
                    {insight.historyScope.items.length
                      ? `Items: ${insight.historyScope.items.join(", ")}`
                      : null}
                    {" · "}
                    Scoped spend{" "}
                    <span className="font-medium tabular-nums text-foreground">
                      {formatMoney(
                        insight.historyScope.scopedSpend,
                        insight.loyalty.currency
                      )}
                    </span>
                    . Lifetime loyalty total above is still all completed orders.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isBusy || !selectedContactId}
                  onClick={() => {
                    setFilterBrands([]);
                    setFilterItems([]);
                    if (selectedContactId) {
                      void loadInsight(selectedContactId, 1, { brands: [], items: [] });
                    }
                  }}
                >
                  <X className="size-4" aria-hidden />
                  Show all history
                </Button>
              </div>
            </div>
          ) : null}

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
                    {insight.loyaltyEligibility ? (
                      <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                        {loyaltyEligibleCopy(insight.loyaltyEligibility)}
                      </p>
                    ) : null}
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
                          {insight.contact.email?.trim() ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Mail className="size-3.5 shrink-0" aria-hidden />
                              <span className="truncate text-foreground">
                                {insight.contact.email}
                              </span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              <Mail className="size-3.5 shrink-0" aria-hidden />
                              <span className="text-foreground">-</span>
                            </span>
                          )}
                          {canExportFilteredCsv &&
                          insight.contact.removedEmails &&
                          insight.contact.removedEmails.length > 0
                            ? insight.contact.removedEmails.map((row) => (
                                <span
                                  key={`${row.reason}-${row.email}-${row.removedAt}`}
                                  className="inline-flex items-center gap-1.5 text-muted-foreground"
                                >
                                  <Mail className="size-3.5 shrink-0" aria-hidden />
                                  <span className="truncate">
                                    {formatRemovedEmailLabel(row.reason, row.email)}
                                  </span>
                                </span>
                              ))
                            : null}
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="size-3.5 shrink-0" aria-hidden />
                            <span className="text-foreground">
                              {insight.contact.city?.trim() ? insight.contact.city : "-"}
                            </span>
                          </span>
                          {formatMemberSince(insight.frequency?.firstOrderAt) ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Calendar className="size-3.5 shrink-0" aria-hidden />
                              Member since{" "}
                              {formatMemberSince(insight.frequency?.firstOrderAt)}
                            </span>
                          ) : null}
                          <span className="inline-flex items-center gap-1.5">
                            <Calendar className="size-3.5 shrink-0" aria-hidden />
                            Last purchased{" "}
                            <span className="text-foreground">
                              {insight.contact.lastPurchaseAt
                                ? formatAppDate(insight.contact.lastPurchaseAt, "—")
                                : "never"}
                            </span>
                          </span>
                        </div>
                      </div>

                      <div className="grid gap-3 rounded-lg border border-border/70 bg-muted/25 p-3 sm:grid-cols-2 lg:grid-cols-3">
                        <DetailField
                          label="Allocated to"
                          value={insight.assignedMerchant ?? "—"}
                        />
                        <DetailField
                          label="Last purchased"
                          value={
                            insight.contact.lastPurchaseAt
                              ? formatAppDate(insight.contact.lastPurchaseAt, "—")
                              : "Never"
                          }
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
                          label="City"
                          value={insight.contact.city ?? "—"}
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
                        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-semibold ${tierBadgeClass(insight.loyaltyAssignment?.tier ?? insight.loyalty.key)}`}
                      >
                        <ShieldCheck className="size-3.5" aria-hidden />
                        {insight.loyaltyAssignment
                          ? insight.loyaltyAssignment.tier === "platinum"
                            ? "Platinum"
                            : "Gold"
                          : insight.loyalty.label}
                        {insight.loyalty.code && !insight.loyaltyAssignment
                          ? ` (${insight.loyalty.code})`
                          : ""}
                      </span>
                      {insight.loyaltyAssignment ? (
                        <p className="text-xs text-muted-foreground">
                          Assigned by{" "}
                          {insight.loyaltyAssignment.assignedByName ?? "unknown"}{" "}
                          {insight.loyaltyAssignment.assignedAt
                            ? `· ${new Date(insight.loyaltyAssignment.assignedAt).toLocaleString()}`
                            : ""}
                        </p>
                      ) : null}
                      {insight.loyaltyEligibility ? (
                        <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                          {loyaltyEligibleCopy(insight.loyaltyEligibility)}
                        </p>
                      ) : null}
                      {isOwner && insight.loyaltyEligibility ? (
                        <div className="mt-1 flex flex-col items-end gap-1">
                          {insight.contact ? (
                            getLoyaltyProfileMissingFields({
                              name: insight.contact.name,
                              email: insight.contact.email,
                              phoneNumber: insight.contact.phoneNumber,
                              phones: insight.contact.phones,
                              gender: insight.contact.gender,
                              language: insight.contact.language,
                              birthMonth: insight.contact.birthMonth,
                              birthDay: insight.contact.birthDay,
                              city: insight.contact.city,
                              address: insight.contact.address,
                            }).length > 0 ? (
                              <p className="text-xs text-amber-700 dark:text-amber-400">
                                Fill missing profile fields, then send the request.
                              </p>
                            ) : null
                          ) : null}
                          {insight.loyaltyOutreachStatus === "responded" ? (
                            <p className="text-xs text-muted-foreground">
                              Requested — waiting in assignment queue
                            </p>
                          ) : insight.loyaltyOutreachStatus === "contacted" ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                disabled={isBusy}
                                onClick={() => void postLoyaltyOutreach("responded")}
                              >
                                Send responded request
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={isBusy}
                                onClick={() => void postLoyaltyOutreach("not_responded")}
                              >
                                Not responded
                              </Button>
                            </>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              disabled={isBusy}
                              onClick={() => void postLoyaltyOutreach("loyalty_informed")}
                            >
                              Mark contacted
                            </Button>
                          )}
                        </div>
                      ) : null}
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
                      <span className="text-muted-foreground">
                        Birth date (month &amp; day required; year optional)
                      </span>
                      <div className="grid grid-cols-3 gap-2">
                        <select
                          className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-sm"
                          value={profileForm.birthMonth}
                          onChange={(e) =>
                            setProfileForm((prev) =>
                              prev ? { ...prev, birthMonth: e.target.value } : prev
                            )
                          }
                          disabled={isBusy}
                        >
                          <option value="">Month</option>
                          {BIRTH_MONTH_OPTIONS.map((month) => (
                            <option key={month} value={String(month)}>
                              {String(month).padStart(2, "0")}
                            </option>
                          ))}
                        </select>
                        <select
                          className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-sm"
                          value={profileForm.birthDay}
                          onChange={(e) =>
                            setProfileForm((prev) =>
                              prev ? { ...prev, birthDay: e.target.value } : prev
                            )
                          }
                          disabled={isBusy}
                        >
                          <option value="">Day</option>
                          {BIRTH_DAY_OPTIONS.map((day) => (
                            <option key={day} value={String(day)}>
                              {String(day).padStart(2, "0")}
                            </option>
                          ))}
                        </select>
                        <Input
                          type="number"
                          inputMode="numeric"
                          placeholder="Year (optional)"
                          value={profileForm.birthYear}
                          onChange={(e) =>
                            setProfileForm((prev) =>
                              prev ? { ...prev, birthYear: e.target.value } : prev
                            )
                          }
                          disabled={isBusy}
                          min={1900}
                          max={2100}
                        />
                      </div>
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-muted-foreground">City</span>
                      <Input
                        value={profileForm.city}
                        onChange={(e) =>
                          setProfileForm((prev) =>
                            prev ? { ...prev, city: e.target.value } : prev
                          )
                        }
                        disabled={isBusy}
                        maxLength={80}
                        placeholder="e.g. Colombo"
                        list="insight-city-suggestions"
                      />
                      <datalist id="insight-city-suggestions">
                        {cityOptions.map((c) => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
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
                      {canAddContactPhone ? (
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
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Linking a new phone needs contacts.merge permission.
                        </p>
                      )}
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
                            {insight.progressBar.tier === "platinum"
                              ? "Platinum spend reached"
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

          {/* Invoice history — under customer details */}
          <Card ref={invoicesRef}>
            <CardHeader className="pb-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base">Invoice history</CardTitle>
                  <CardDescription>
                    {insight.invoicePagination.total} order(s).
                    {insight.historyScope
                      ? " Only lines matching your brand/item filter."
                      : null}
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
                <div className="max-h-[28rem] overflow-auto rounded-xl border border-border/70">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-card">
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

          {/* Charts */}
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
                        : "N/A"}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Current status:{" "}
                      <span className="text-foreground font-medium">
                        {insight.contact?.category?.trim()
                          ? insight.contact.category
                          : "N/A"}
                      </span>
                    </p>
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
                  {insight.canMarkContacted ? (
                    <label className="block max-w-sm space-y-1 text-sm">
                      <span className="text-muted-foreground">Remark</span>
                      <Input
                        value={contactRemark}
                        onChange={(e) => setContactRemark(e.target.value)}
                        disabled={isBusy}
                        placeholder="Optional remark"
                      />
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
                {contactHistory.length > 0 ? (
                  <div className="space-y-2 border-t pt-3">
                    <p className="text-sm font-medium">Contact history</p>
                    <ul className="max-h-48 space-y-2 overflow-y-auto text-xs">
                      {contactHistory.map((row) => (
                        <li key={row.id} className="rounded border px-2 py-1.5">
                          <div className="font-medium">
                            {new Date(row.createdAt).toLocaleString()}
                            {row.merchantName ? ` · ${row.merchantName}` : ""}
                          </div>
                          <div className="text-muted-foreground">
                            {row.category?.trim() ? row.category : "N/A"}
                            {row.outcome ? ` · ${row.outcome}` : ""}
                          </div>
                          {row.remark ? <div>{row.remark}</div> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
