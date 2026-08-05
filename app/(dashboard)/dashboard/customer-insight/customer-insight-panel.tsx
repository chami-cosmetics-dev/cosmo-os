"use client";

import { useRef, useState } from "react";
import { Eye, Loader2, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  CustomerInsightDto,
  SearchMatchDto,
  UnifiedInvoiceRowDto,
} from "@/lib/customer-insight/types";
import { LOYALTY_GOLD_MIN, LOYALTY_PLATINUM_ABOVE } from "@/lib/customer-insight/loyalty-tier";
import { notify } from "@/lib/notify";

function formatMoney(amount: number, currency = "LKR") {
  return `${currency} ${new Intl.NumberFormat("en-LK", {
    maximumFractionDigits: 0,
  }).format(amount)}`;
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

/** `YYYY-MM` → `Jan 2022` */
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

function tierBadgeClass(key: CustomerInsightDto["loyalty"]["key"]) {
  if (key === "gold") return "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-700";
  if (key === "platinum") return "bg-slate-200 text-slate-900 border-slate-400 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-500";
  return "bg-muted text-muted-foreground";
}

export function CustomerInsightPanel() {
  const [phone, setPhone] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [matches, setMatches] = useState<SearchMatchDto[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [searched, setSearched] = useState(false);
  const [insight, setInsight] = useState<CustomerInsightDto | null>(null);
  const [invoicePage, setInvoicePage] = useState(1);
  const [openInvoice, setOpenInvoice] = useState<UnifiedInvoiceRowDto | null>(null);
  const [itemFilter, setItemFilter] = useState<string | null>(null);
  const invoicesRef = useRef<HTMLDivElement>(null);

  const isBusy = busyKey !== null;

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
    setOpenInvoice(null);
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
      setInsight(data as CustomerInsightDto);
      setInvoicePage(page);
    } catch {
      notify.error("Failed to load customer insight.");
      setInsight(null);
    } finally {
      setBusyKey(null);
    }
  }

  function focusInvoicesForItem(itemName: string) {
    setItemFilter(itemName);
    invoicesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const totalPages = insight
    ? Math.max(1, Math.ceil(insight.invoicePagination.total / insight.invoicePagination.pageSize))
    : 1;

  const visibleInvoices =
    insight && itemFilter
      ? insight.invoices.filter((inv) =>
          inv.lineItems.some((li) => li.name === itemFilter)
        )
      : insight?.invoices ?? [];

  const maxTopSpend = insight
    ? Math.max(...insight.topItems.map((i) => i.spend), 1)
    : 1;

  const spendSeriesNewestFirst = insight
    ? [...insight.series].sort((a, b) => b.month.localeCompare(a.month))
    : [];
  const maxMonthSpend = spendSeriesNewestFirst.length
    ? Math.max(...spendSeriesNewestFirst.map((s) => s.spend), 1)
    : 1;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Customer Insight</h1>
        <p className="text-sm text-muted-foreground">
          Search by phone to view one customer&apos;s group, invoices, and buying history.
          View only — no contact list, export, or import.
        </p>
      </div>

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
          <Card>
            <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-xl">{insight.contact.name}</CardTitle>
                <CardDescription className="space-y-0.5">
                  <span className="block">
                    {insight.contact.phoneNumber ?? insight.contact.phones[0] ?? "No phone"}
                  </span>
                  {insight.contact.email ? (
                    <span className="block">{insight.contact.email}</span>
                  ) : null}
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
                  Lifetime total: {formatMoney(insight.loyalty.lifetimeTotal, insight.loyalty.currency)}
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Groups: under {formatMoney(LOYALTY_GOLD_MIN)} Standard ·{" "}
                {formatMoney(LOYALTY_GOLD_MIN)}–{formatMoney(LOYALTY_PLATINUM_ABOVE)} Gold
                (loyalcs) · above {formatMoney(LOYALTY_PLATINUM_ABOVE)} Platinum (loyalcs2).
                Cancelled Cosmo orders are listed but excluded from the lifetime total.
              </p>
            </CardContent>
          </Card>

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

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Top items</CardTitle>
                <CardDescription>
                  Click an item to jump to invoices that include it (this page).
                </CardDescription>
              </CardHeader>
              <CardContent>
                {insight.topItems.length === 0 ? (
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
                  Loyalty-eligible spend by month (newest first). Amounts shown on each row.
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
                      const pct = Math.max(4, Math.round((point.spend / maxMonthSpend) * 100));
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
                          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span>
                              {point.orderCount} invoice{point.orderCount === 1 ? "" : "s"}
                            </span>
                          </div>
                          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${pct}%` }}
                              title={formatMoney(point.spend)}
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

          <Card ref={invoicesRef}>
            <CardHeader className="pb-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base">Invoice history</CardTitle>
                  <CardDescription>
                    Cosmo orders and Adapt invoices · {insight.invoicePagination.total} total.
                    Open any row to see line items.
                  </CardDescription>
                </div>
                {itemFilter ? (
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
              {itemFilter ? (
                <p className="text-xs text-muted-foreground">
                  Showing invoices on this page that include:{" "}
                  <span className="font-medium text-foreground">{itemFilter}</span>
                  {visibleInvoices.length === 0
                    ? " — none on this page; try another page or clear the filter."
                    : null}
                </p>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
              {insight.invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No purchase history yet.</p>
              ) : visibleInvoices.length === 0 && itemFilter ? (
                <p className="text-sm text-muted-foreground">
                  No matching invoices on this page for that item.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="w-[1%] text-right">Open</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleInvoices.map((inv) => (
                        <TableRow
                          key={inv.id}
                          className="cursor-pointer"
                          onClick={() => setOpenInvoice(inv)}
                        >
                          <TableCell className="whitespace-nowrap">
                            {formatDate(inv.date)}
                          </TableCell>
                          <TableCell className="max-w-[12rem]">
                            <span className="break-words font-medium">{inv.reference}</span>
                          </TableCell>
                          <TableCell>{inv.source}</TableCell>
                          <TableCell>
                            {inv.status}
                            {!inv.includedInLoyaltyTotal ? (
                              <span className="ml-1 text-xs text-muted-foreground">
                                (excluded from total)
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            {formatMoney(inv.amount)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenInvoice(inv);
                              }}
                            >
                              <Eye className="size-4" aria-hidden />
                              Open
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {insight.invoicePagination.total > insight.invoicePagination.pageSize && (
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
                      onClick={() => void loadInsight(insight.contact.id, invoicePage - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isBusy || invoicePage >= totalPages}
                      onClick={() => void loadInsight(insight.contact.id, invoicePage + 1)}
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

      <Dialog open={openInvoice != null} onOpenChange={(open) => !open && setOpenInvoice(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {openInvoice ? (
            <>
              <DialogHeader>
                <DialogTitle className="break-words pr-6">{openInvoice.reference}</DialogTitle>
                <DialogDescription>
                  {formatDate(openInvoice.date)} · {openInvoice.source} · {openInvoice.status}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <p className="text-base font-semibold tabular-nums">
                  {formatMoney(openInvoice.amount)}
                </p>
                {!openInvoice.includedInLoyaltyTotal ? (
                  <p className="text-xs text-muted-foreground">
                    This invoice is excluded from the loyalty lifetime total.
                  </p>
                ) : null}
                <div>
                  <p className="mb-2 font-medium">Items</p>
                  {openInvoice.lineItems.length === 0 ? (
                    <p className="text-muted-foreground">No line items available.</p>
                  ) : (
                    <ul className="space-y-2">
                      {openInvoice.lineItems.map((li, idx) => (
                        <li
                          key={`${li.name}-${idx}`}
                          className="flex flex-col gap-0.5 rounded-md border border-border/70 px-3 py-2 sm:flex-row sm:justify-between"
                        >
                          <span className="break-words font-medium">{li.name}</span>
                          <span className="shrink-0 text-muted-foreground tabular-nums">
                            qty {li.quantity} · {formatMoney(li.spend)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
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
