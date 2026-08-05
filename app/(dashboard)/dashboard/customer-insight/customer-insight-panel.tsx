"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CustomerInsightDto, SearchMatchDto } from "@/lib/customer-insight/types";
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

function tierBadgeClass(key: CustomerInsightDto["loyalty"]["key"]) {
  if (key === "gold") return "bg-amber-100 text-amber-900 border-amber-300";
  if (key === "platinum") return "bg-slate-200 text-slate-900 border-slate-400";
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

  const totalPages = insight
    ? Math.max(1, Math.ceil(insight.invoicePagination.total / insight.invoicePagination.pageSize))
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
            Enter a customer phone number. Results are capped; refine the number if truncated.
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
                <Badge
                  variant="outline"
                  className={tierBadgeClass(insight.loyalty.key)}
                >
                  {insight.loyalty.label}
                  {insight.loyalty.code ? ` (${insight.loyalty.code})` : ""}
                </Badge>
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
                <CardDescription>What they buy most (by spend)</CardDescription>
              </CardHeader>
              <CardContent>
                {insight.topItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No purchased items yet.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {insight.topItems.map((item) => (
                      <li
                        key={item.name}
                        className="flex flex-col gap-0.5 border-b border-border/60 py-2 last:border-0 sm:flex-row sm:justify-between"
                      >
                        <span className="font-medium">{item.name}</span>
                        <span className="text-muted-foreground">
                          qty {item.quantity} · {formatMoney(item.spend)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Spend over time</CardTitle>
                <CardDescription>Loyalty-eligible invoices by month</CardDescription>
              </CardHeader>
              <CardContent>
                {!insight.chartsAvailable ? (
                  <p className="text-sm text-muted-foreground">
                    Need at least 3 loyalty-eligible invoices to show a trend chart. KPIs above
                    still reflect available history.
                  </p>
                ) : (
                  <div className="h-64 w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={insight.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} width={56} />
                        <Tooltip
                          formatter={(value) =>
                            typeof value === "number" ? formatMoney(value) : String(value)
                          }
                        />
                        <Line
                          type="monotone"
                          dataKey="spend"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {insight.chartsAvailable && insight.topItems.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Top items chart</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72 w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={insight.topItems.map((i) => ({
                        name: i.name.length > 28 ? `${i.name.slice(0, 26)}…` : i.name,
                        spend: i.spend,
                      }))}
                      layout="vertical"
                      margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
                    >
                      <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
                      <XAxis type="number" hide />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={120}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip
                        formatter={(value) =>
                          typeof value === "number" ? formatMoney(value) : String(value)
                        }
                      />
                      <Bar dataKey="spend" fill="hsl(var(--primary))" radius={4} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Invoice history</CardTitle>
              <CardDescription>
                Cosmo orders and Adapt invoices · {insight.invoicePagination.total} total
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {insight.invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No purchase history yet.</p>
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
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {insight.invoices.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell className="whitespace-nowrap">
                            {formatDate(inv.date)}
                          </TableCell>
                          <TableCell className="max-w-[10rem] truncate sm:max-w-none">
                            {inv.reference}
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
