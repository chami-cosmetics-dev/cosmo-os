"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search, Ticket } from "lucide-react";

import { TableSkeleton } from "@/components/skeletons/table-skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { formatAppDateTime } from "@/lib/format-datetime";
import {
  GIFT_VOUCHER_CHECK_LABELS,
  GIFT_VOUCHER_MAX_QUANTITY,
  GIFT_VOUCHER_STATUS_LABELS,
  GIFT_VOUCHER_STATUSES,
  formatVoucherCode,
  parseVoucherCodeList,
  type GiftVoucherCheck,
  type GiftVoucherCheckResult,
  type GiftVoucherCodeMode,
  type GiftVoucherCodeRow,
  type GiftVoucherDateField,
  type GiftVoucherGroupOption,
  type GiftVoucherStatus,
} from "@/lib/gift-vouchers/types";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

const ALL = "all";

const STATUS_STYLES: Record<GiftVoucherStatus, string> = {
  PENDING: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  ACTIVE: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  EXPIRED: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  USED: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
};

const CHECK_STYLES: Record<GiftVoucherCheckResult, string> = {
  VALID: STATUS_STYLES.ACTIVE,
  USED: STATUS_STYLES.USED,
  EXPIRED: STATUS_STYLES.EXPIRED,
  NOT_YET_ACTIVE: STATUS_STYLES.PENDING,
  NOT_FOUND: "border-border bg-muted text-muted-foreground",
};

type GroupForm = {
  name: string;
  codePrefix: string;
  mode: GiftVoucherCodeMode;
  codesText: string;
  quantity: string;
  startDate: string;
  endDate: string;
};

const EMPTY_FORM: GroupForm = {
  name: "",
  codePrefix: "",
  mode: "manual",
  codesText: "",
  quantity: "",
  startDate: "",
  endDate: "",
};

function StatusBadge({ status }: { status: GiftVoucherStatus }) {
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium", STATUS_STYLES[status])}>
      {GIFT_VOUCHER_STATUS_LABELS[status]}
    </span>
  );
}

function CheckCodeCard() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GiftVoucherCheck | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const value = code.trim();
    if (!value) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/products/gift-vouchers/check?code=${encodeURIComponent(value)}`);
      const data = await res.json();
      if (!res.ok) {
        notify.error(data.error ?? "Could not check this code");
        return;
      }
      setResult(data as GiftVoucherCheck);
    } catch {
      notify.error("Could not check this code");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Check code</CardTitle>
        <CardDescription>Enter a batch code to see whether it can be redeemed today.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="e.g. GV0001"
            className="sm:max-w-sm"
            aria-label="Batch code"
          />
          <Button type="submit" disabled={busy || !code.trim()}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />}
            Check
          </Button>
        </form>
        {result ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-mono font-medium">{result.code}</span>
            <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-sm font-semibold", CHECK_STYLES[result.result])}>
              {GIFT_VOUCHER_CHECK_LABELS[result.result]}
            </span>
            {result.groupName ? (
              <span className="text-muted-foreground">
                {result.groupName} · {result.startDate} to {result.endDate}
              </span>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function GiftVouchersPanel({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<GiftVoucherCodeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [refreshKey, setRefreshKey] = useState(0);

  const [groups, setGroups] = useState<GiftVoucherGroupOption[]>([]);
  const [groupId, setGroupId] = useState(ALL);
  const [codeInput, setCodeInput] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<string>(ALL);
  const [dateField, setDateField] = useState<GiftVoucherDateField>("used");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState<GroupForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const parsedCodes = useMemo(() => parseVoucherCodeList(form.codesText), [form.codesText]);

  // Debounce the batch code filter so typing doesn't fire a request per key.
  useEffect(() => {
    const timer = setTimeout(() => {
      setCode(codeInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [codeInput]);

  const loadGroups = useCallback(async () => {
    const res = await fetch("/api/admin/products/gift-vouchers/groups");
    if (!res.ok) return;
    const data = (await res.json()) as { groups: GiftVoucherGroupOption[] };
    setGroups(data.groups ?? []);
  }, []);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (code) params.set("code", code);
    if (status !== ALL) params.set("status", status);
    if (groupId !== ALL) params.set("groupId", groupId);
    if (from || to) params.set("dateField", dateField);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    setLoading(true);
    fetch(`/api/admin/products/gift-vouchers/codes?${params}`)
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          notify.error(data.error ?? "Could not load gift vouchers");
          return;
        }
        setRows(data.rows ?? []);
        setTotal(data.total ?? 0);
      })
      .catch(() => {
        if (!cancelled) notify.error("Could not load gift vouchers");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, limit, code, status, groupId, dateField, from, to, refreshKey]);

  function resetFilters() {
    setGroupId(ALL);
    setCodeInput("");
    setCode("");
    setStatus(ALL);
    setDateField("used");
    setFrom("");
    setTo("");
    setPage(1);
  }

  async function saveGroup() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/products/gift-vouchers/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          codePrefix: form.codePrefix,
          mode: form.mode,
          ...(form.mode === "generate" ? { quantity: Number(form.quantity) } : { codes: parsedCodes.codes }),
          startDate: form.startDate,
          endDate: form.endDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify.error(data.error ?? "Could not create the group");
        return;
      }
      notify.success(`Created group with ${data.group.quantity} codes (${data.firstCode} - ${data.lastCode})`);
      setSheetOpen(false);
      setForm(EMPTY_FORM);
      await loadGroups();
      setPage(1);
      setRefreshKey((key) => key + 1);
    } catch {
      notify.error("Could not create the group");
    } finally {
      setSaving(false);
    }
  }

  const prefixPreview = form.codePrefix.trim().toUpperCase();
  const codesValid =
    form.mode === "generate"
      ? Number(form.quantity) >= 1 && Number(form.quantity) <= GIFT_VOUCHER_MAX_QUANTITY
      : parsedCodes.codes.length >= 1 &&
        parsedCodes.codes.length <= GIFT_VOUCHER_MAX_QUANTITY &&
        parsedCodes.invalid.length === 0 &&
        parsedCodes.duplicates.length === 0;
  const formValid =
    form.name.trim() &&
    /^[A-Z0-9-]{1,20}$/.test(prefixPreview) &&
    codesValid &&
    form.startDate &&
    form.endDate &&
    form.endDate >= form.startDate;

  const hasFilters = code || status !== ALL || groupId !== ALL || from || to;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Ticket className="size-5 text-muted-foreground" aria-hidden />
            Gift vouchers
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Track every batch code&apos;s status and redemption.
          </p>
        </div>
        {canManage ? (
          <Button onClick={() => setSheetOpen(true)}>
            <Plus className="size-4" aria-hidden />
            Create group
          </Button>
        ) : null}
      </div>

      <CheckCodeCard />

      <Card>
        <CardHeader>
          <CardTitle>Gift Vouchers</CardTitle>
          <CardDescription>{total.toLocaleString("en-LK")} codes match the current filters.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <label htmlFor="gv-filter-group" className="text-muted-foreground text-xs font-medium">Group</label>
              <Select value={groupId} onValueChange={(value) => { setGroupId(value); setPage(1); }}>
                <SelectTrigger id="gv-filter-group" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All</SelectItem>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>#{group.groupNumber} {group.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label htmlFor="gv-filter-code" className="text-muted-foreground text-xs font-medium">Batch code</label>
              <Input
                id="gv-filter-code"
                value={codeInput}
                onChange={(event) => setCodeInput(event.target.value.toUpperCase())}
                placeholder="Search code"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="gv-filter-status" className="text-muted-foreground text-xs font-medium">Status</label>
              <Select value={status} onValueChange={(value) => { setStatus(value); setPage(1); }}>
                <SelectTrigger id="gv-filter-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All</SelectItem>
                  {GIFT_VOUCHER_STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>{GIFT_VOUCHER_STATUS_LABELS[value]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label htmlFor="gv-filter-date-field" className="text-muted-foreground text-xs font-medium">Date range applies to</label>
              <Select value={dateField} onValueChange={(value) => { setDateField(value as GiftVoucherDateField); setPage(1); }}>
                <SelectTrigger id="gv-filter-date-field" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="used">Used date</SelectItem>
                  <SelectItem value="start">Group active date</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label htmlFor="gv-filter-from" className="text-muted-foreground text-xs font-medium">From</label>
              <Input id="gv-filter-from" type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} />
            </div>
            <div className="space-y-1">
              <label htmlFor="gv-filter-to" className="text-muted-foreground text-xs font-medium">To</label>
              <Input id="gv-filter-to" type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} />
            </div>
          </div>
          {hasFilters ? (
            <Button variant="outline" size="sm" onClick={resetFilters}>Clear filters</Button>
          ) : null}

          {loading ? (
            <TableSkeleton columns={7} rows={8} />
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 p-8 text-center">
              <p className="text-muted-foreground text-sm">
                {hasFilters ? "No codes match these filters." : "No gift voucher codes yet."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/40 text-left">
                    <th className="px-4 py-2 font-medium">Group</th>
                    <th className="px-4 py-2 font-medium">Batch code</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Order no</th>
                    <th className="px-4 py-2 font-medium">Used date</th>
                    <th className="px-4 py-2 font-medium">Phone no</th>
                    <th className="px-4 py-2 font-medium">Group active date</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/10">
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{row.groupName}</p>
                        <p className="text-muted-foreground text-xs">#{row.groupNumber}</p>
                      </td>
                      <td className="px-4 py-2.5 font-mono">{row.code}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={row.status} /></td>
                      <td className="px-4 py-2.5">{row.orderNo ?? "—"}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{formatAppDateTime(row.usedAt)}</td>
                      <td className="px-4 py-2.5">{row.phoneNo ?? "—"}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {row.startDate}
                        <span className="text-muted-foreground block text-xs">until {row.endDate}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {total > 0 ? (
            <Pagination
              page={page}
              limit={limit}
              total={total}
              onPageChange={setPage}
              onLimitChange={(newLimit) => { setLimit(newLimit); setPage(1); }}
              limitOptions={[25, 50, 100, 200]}
            />
          ) : null}
        </CardContent>
      </Card>

      {canManage ? (
        <Sheet open={sheetOpen} onOpenChange={(open) => { if (!saving) setSheetOpen(open); }}>
          <SheetContent className="overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Create voucher group</SheetTitle>
              <SheetDescription>
                Add the batch codes for this group. Each code can belong to one group only and can be used once.
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-4 px-4">
              <div className="space-y-1">
                <label htmlFor="gv-name" className="text-sm font-medium">Voucher Group Name</label>
                <Input id="gv-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Avurudu 2027" disabled={saving} />
              </div>
              <div className="space-y-1">
                <label htmlFor="gv-prefix" className="text-sm font-medium">Coupon Code Prefix</label>
                <Input id="gv-prefix" value={form.codePrefix} onChange={(event) => setForm({ ...form, codePrefix: event.target.value.toUpperCase() })} placeholder="GV" maxLength={20} disabled={saving} />
                <p className="text-muted-foreground text-xs">
                  Orders whose coupon starts with this word (e.g. <span className="font-mono">{prefixPreview || "GV"} 1000</span>) can apply a batch code from this group.
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Batch Codes</p>
                <div className="inline-flex rounded-lg border border-border/70 p-1">
                  <Button type="button" size="sm" variant={form.mode === "manual" ? "default" : "ghost"} onClick={() => setForm({ ...form, mode: "manual" })} disabled={saving}>
                    Type or paste codes
                  </Button>
                  <Button type="button" size="sm" variant={form.mode === "generate" ? "default" : "ghost"} onClick={() => setForm({ ...form, mode: "generate" })} disabled={saving}>
                    Generate
                  </Button>
                </div>
                {form.mode === "manual" ? (
                  <>
                    <Textarea
                      id="gv-codes"
                      aria-label="Batch codes"
                      value={form.codesText}
                      onChange={(event) => setForm({ ...form, codesText: event.target.value })}
                      placeholder={"One code per line, or paste a column from Excel\nGV0001\nGV0002"}
                      className="min-h-40 font-mono"
                      disabled={saving}
                    />
                    <p className="text-muted-foreground text-xs">
                      {parsedCodes.codes.length.toLocaleString("en-LK")} code{parsedCodes.codes.length === 1 ? "" : "s"} ready
                      {parsedCodes.codes.length > GIFT_VOUCHER_MAX_QUANTITY ? ` (maximum ${GIFT_VOUCHER_MAX_QUANTITY.toLocaleString("en-LK")})` : ""}
                    </p>
                    {parsedCodes.duplicates.length > 0 ? (
                      <p className="text-destructive text-xs">Listed more than once: {parsedCodes.duplicates.slice(0, 10).join(", ")}{parsedCodes.duplicates.length > 10 ? "…" : ""}</p>
                    ) : null}
                    {parsedCodes.invalid.length > 0 ? (
                      <p className="text-destructive text-xs">Not valid (letters, digits, - or _ only): {parsedCodes.invalid.slice(0, 10).join(", ")}{parsedCodes.invalid.length > 10 ? "…" : ""}</p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Input id="gv-quantity" type="number" aria-label="Number of codes to generate" min={1} max={GIFT_VOUCHER_MAX_QUANTITY} value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} placeholder="How many codes, e.g. 100" disabled={saving} />
                    <p className="text-muted-foreground text-xs">
                      Codes look like <span className="font-mono">{formatVoucherCode(141, 48213)}</span>: COS + this group&apos;s permanent number + 5 random digits. Codes are never repeated. Maximum {GIFT_VOUCHER_MAX_QUANTITY.toLocaleString("en-LK")} per group.
                    </p>
                  </>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="gv-start" className="text-sm font-medium">Start Date</label>
                  <Input id="gv-start" type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} disabled={saving} />
                </div>
                <div className="space-y-1">
                  <label htmlFor="gv-end" className="text-sm font-medium">End Date</label>
                  <Input id="gv-end" type="date" value={form.endDate} min={form.startDate || undefined} onChange={(event) => setForm({ ...form, endDate: event.target.value })} disabled={saving} />
                </div>
              </div>
              {form.startDate && form.endDate && form.endDate < form.startDate ? (
                <p className="text-destructive text-xs">End date must be on or after the start date.</p>
              ) : null}
            </div>
            <SheetFooter>
              <Button variant="outline" onClick={() => setSheetOpen(false)} disabled={saving}>Cancel</Button>
              <Button onClick={saveGroup} disabled={saving || !formValid}>
                {saving ? <><Loader2 className="size-4 animate-spin" aria-hidden />Creating...</> : "Create group"}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  );
}
