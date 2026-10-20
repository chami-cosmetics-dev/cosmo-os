"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, Eraser, Loader2, Plus, RefreshCw, Trash2, X } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CONSULTATION_INVOICE_PATTERN,
  CONSULTATION_MERCHANT_OPTIONS,
  CONSULTATION_MONTH_PATTERN,
  CONSULTATION_PHONE_PATTERN,
  cleanConsultationPhone,
  currentConsultationMonth,
  findDuplicateInvoices,
  formatConsultationMonth,
  groupConsultations,
  resolveCustomerName,
  resolveSuggestedMerchant,
  splitInvoiceNumbers,
  summarizeConsultations,
  todayConsultationDate,
  type ConsultationGroup,
  type ConsultationInvoiceMatch,
  type ConsultationRow,
} from "@/lib/consultation-insights/shared";
import { formatAppCalendarDate } from "@/lib/format-datetime";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

type LookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; invoices: ConsultationInvoiceMatch[] }
  | { status: "error" };

const LIVE_REFRESH_MS = 10_000;

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

const STICKY_HEAD = "sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_var(--border)]";

type FieldErrors = Partial<Record<"date" | "phone" | "invoices" | "name" | "merchant", string>>;

function FieldLabel({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <label className="mb-1 block text-xs font-medium text-muted-foreground">
      {children}
      {!optional && <span className="text-destructive"> *</span>}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-destructive">{message}</p>;
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-[110px] rounded-lg border border-border/70 bg-muted/30 px-4 py-2">
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{label}</p>
    </div>
  );
}

function ReviewCell({
  row,
  onSaved,
}: {
  row: ConsultationRow;
  onSaved: (rows: ConsultationRow[]) => void;
}) {
  const [value, setValue] = useState(row.physicalReview);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setValue(row.physicalReview);
  }, [row.physicalReview]);

  async function save() {
    if (value.trim() === row.physicalReview.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/consultation-insights/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ physicalReview: value }),
      });
      const data = (await res.json()) as { rows?: ConsultationRow[]; error?: string };
      if (!res.ok || !data.rows) {
        notify.error(data.error ?? "Failed to save review");
        setValue(row.physicalReview);
        return;
      }
      onSaved(data.rows);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch {
      notify.error("Failed to save review");
      setValue(row.physicalReview);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setValue(row.physicalReview);
            e.currentTarget.blur();
          }
        }}
        placeholder="Add review…"
        disabled={saving}
        className="h-8 min-w-[220px] pr-7 text-sm"
      />
      <span className="absolute top-1/2 right-2 -translate-y-1/2">
        {saving ? (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        ) : savedFlash ? (
          <Check className="size-3.5 text-emerald-500" />
        ) : null}
      </span>
    </div>
  );
}

export function ConsultationInsightsPanel({
  initialMonth,
  initialRows,
}: {
  initialMonth: string;
  initialRows: ConsultationRow[];
}) {
  const [month, setMonth] = useState(initialMonth);
  const [rows, setRows] = useState<ConsultationRow[]>(initialRows);
  const [loadingRows, setLoadingRows] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [date, setDate] = useState(todayConsultationDate());
  const [phone, setPhone] = useState("");
  const [lookup, setLookup] = useState<LookupState>({ status: "idle" });
  const [selectedFound, setSelectedFound] = useState<Set<string>>(new Set());
  const [manualInvoices, setManualInvoices] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [merchant, setMerchant] = useState("");
  const [merchantTouched, setMerchantTouched] = useState(false);
  const [review, setReview] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const lookupSeq = useRef(0);
  const monthRef = useRef(initialMonth);
  const [pendingDelete, setPendingDelete] = useState<ConsultationGroup | null>(null);
  const [deleting, setDeleting] = useState(false);

  const summary = useMemo(() => summarizeConsultations(rows), [rows]);
  const groups = useMemo(() => groupConsultations(rows), [rows]);
  // Pages count customers, so one customer's invoices never split across pages.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(20);
  const pageCount = Math.max(1, Math.ceil(groups.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const groupOffset = (safePage - 1) * pageSize;
  const pagedGroups = groups.slice(groupOffset, groupOffset + pageSize);
  const duplicateInvoices = useMemo(() => findDuplicateInvoices(rows), [rows]);
  const maxMonth = currentConsultationMonth();
  const today = todayConsultationDate();

  const cleanedPhone = cleanConsultationPhone(phone);
  const phoneValid = CONSULTATION_PHONE_PATTERN.test(cleanedPhone);
  const foundInvoices = lookup.status === "done" ? lookup.invoices : [];
  const cancelledFound = foundInvoices.filter((invoice) => invoice.cancelled);
  const selectedFoundInvoices = foundInvoices.filter(
    (invoice) => !invoice.cancelled && selectedFound.has(invoice.invoiceNumber),
  );
  const invoiceNumbers = splitInvoiceNumbers(
    [...selectedFoundInvoices.map((invoice) => invoice.invoiceNumber), manualInvoices].join(" "),
  );
  const nameResolution = resolveCustomerName(selectedFoundInvoices);
  const suggestedMerchant = resolveSuggestedMerchant(selectedFoundInvoices);

  async function loadMonth(nextMonth: string, { silent = false } = {}) {
    if (!silent) setLoadingRows(true);
    try {
      const res = await fetch(`/api/admin/consultation-insights?month=${nextMonth}`);
      const data = (await res.json()) as { rows?: ConsultationRow[]; error?: string };
      // Ignore responses for a month the user has already moved away from.
      if (monthRef.current !== nextMonth) return;
      if (!res.ok || !data.rows) {
        if (!silent) notify.error(data.error ?? "Failed to load consultations");
        return;
      }
      setRows(data.rows);
    } catch {
      if (!silent) notify.error("Failed to load consultations");
    } finally {
      if (!silent) setLoadingRows(false);
    }
  }

  function changeMonth(nextMonth: string) {
    if (!CONSULTATION_MONTH_PATTERN.test(nextMonth) || nextMonth === month) return;
    monthRef.current = nextMonth;
    setMonth(nextMonth);
    setPage(1);
    void loadMonth(nextMonth);
  }

  // Live: pick up rows added or reviewed by other staff.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void loadMonth(month, { silent: true });
    }, LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [month]);

  // Load the invoices for this number on the selected date.
  useEffect(() => {
    if (!phoneValid || !date) {
      setLookup({ status: "idle" });
      setSelectedFound(new Set());
      return;
    }
    const seq = ++lookupSeq.current;
    setLookup({ status: "loading" });
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ phone: cleanedPhone, date });
        const res = await fetch(`/api/admin/consultation-insights/invoices?${params.toString()}`);
        const data = (await res.json()) as { invoices?: ConsultationInvoiceMatch[] };
        if (seq !== lookupSeq.current) return;
        if (!res.ok || !data.invoices) {
          setLookup({ status: "error" });
          return;
        }
        setLookup({ status: "done", invoices: data.invoices });
        setSelectedFound(
          new Set(data.invoices.filter((invoice) => !invoice.cancelled).map((invoice) => invoice.invoiceNumber)),
        );
        setNameTouched(false);
        setMerchantTouched(false);
      } catch {
        if (seq === lookupSeq.current) setLookup({ status: "error" });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [cleanedPhone, phoneValid, date]);

  // Fill the customer name from the selected invoices unless the user typed one.
  useEffect(() => {
    if (nameTouched) return;
    if (nameResolution.status === "resolved") setCustomerName(nameResolution.name);
    else setCustomerName("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameTouched, nameResolution.status, nameResolution.status === "resolved" ? nameResolution.name : ""]);

  // Pre-select the merchant from the invoices' coupon code unless the user picked one.
  // No suggestion leaves the current choice alone.
  useEffect(() => {
    if (!merchantTouched && suggestedMerchant) setMerchant(suggestedMerchant);
  }, [merchantTouched, suggestedMerchant]);

  function toggleFound(invoiceNumber: string) {
    setSelectedFound((prev) => {
      const next = new Set(prev);
      if (next.has(invoiceNumber)) next.delete(invoiceNumber);
      else next.add(invoiceNumber);
      return next;
    });
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!date) next.date = "Select a date";
    else if (date > today) next.date = "Date cannot be in the future";
    if (!phoneValid) next.phone = "Enter 10 digits starting with 0 (e.g. 0771234567)";
    if (invoiceNumbers.length === 0) next.invoices = "Add at least one invoice number";
    if (!customerName.trim()) next.name = "Customer name is required";
    if (!merchant) next.merchant = "Select a merchant";
    return next;
  }

  async function handleAdd() {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/consultation-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consultationDate: date,
          contactNumber: cleanedPhone,
          invoiceNumbers,
          customerName,
          merchant,
          physicalReview: review.trim() || null,
        }),
      });
      const data = (await res.json()) as { rows?: ConsultationRow[]; error?: string };
      if (!res.ok || !data.rows) {
        notify.error(data.error ?? "Failed to add customer");
        return;
      }
      const added = data.rows;
      if (date.slice(0, 7) === month) {
        setRows((prev) =>
          [...prev, ...added].sort(
            (a, b) =>
              a.consultationDate.localeCompare(b.consultationDate) || a.createdAt.localeCompare(b.createdAt),
          ),
        );
      }
      notify.success(
        `Added ${customerName.trim()} (${added.length} invoice${added.length === 1 ? "" : "s"})` +
          (date.slice(0, 7) === month ? "" : ` to ${formatConsultationMonth(date.slice(0, 7))}`),
      );
      // Keep the date: staff usually log several customers from the same day.
      resetForm();
    } catch {
      notify.error("Failed to add customer");
    } finally {
      setSubmitting(false);
    }
  }

  /** Empties every field except the date (the invoice lookup resets with the phone). */
  function resetForm() {
    setPhone("");
    setManualInvoices("");
    setCustomerName("");
    setNameTouched(false);
    setMerchant("");
    setMerchantTouched(false);
    setReview("");
    setErrors({});
  }

  /** Clear button: start over, date back to today. */
  function clearForm() {
    resetForm();
    setDate(todayConsultationDate());
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(`/api/admin/consultation-insights/export?month=${month}`);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        notify.error(data.error ?? "Export failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `consultation-insights-${month}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      notify.error("Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/consultation-insights/${pendingDelete.head.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to delete");
        return;
      }
      const entryId = pendingDelete.entryId;
      setRows((prev) => prev.filter((row) => row.entryId !== entryId));
      notify.success(`Deleted ${pendingDelete.head.customerName}`);
      setPendingDelete(null);
    } catch {
      notify.error("Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  function updateRows(updated: ConsultationRow[]) {
    const byId = new Map(updated.map((row) => [row.id, row]));
    setRows((prev) => prev.map((row) => byId.get(row.id) ?? row));
  }

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-5 shadow-[0_18px_40px_-28px_var(--primary)] sm:p-6">
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">Contacts</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Consultation Insights</h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
          Physical consultation log. Add each customer after their consultation.
        </p>
      </section>

      <Card className="border-border/70 shadow-xs">
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <FieldLabel optional>Month</FieldLabel>
              <Input
                type="month"
                value={month}
                max={maxMonth}
                onChange={(e) => changeMonth(e.target.value)}
                className="w-44"
              />
            </div>
            <StatTile label="Customers" value={summary.customers} />
            <StatTile label="Invoices" value={summary.invoices} />
            <StatTile label="Reviews" value={summary.reviews} />
            <Button variant="outline" onClick={handleExport} disabled={exporting} className="ml-auto">
              {exporting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
              Download Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base">Add a customer</CardTitle>
          <Button variant="outline" size="sm" onClick={clearForm} disabled={submitting}>
            <Eraser className="mr-2 size-4" />
            Clear
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[150px_150px_minmax(200px,1.4fr)_minmax(160px,1fr)_minmax(180px,1fr)_minmax(160px,1fr)_auto]">
            <div>
              <FieldLabel>Date</FieldLabel>
              <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
              <FieldError message={errors.date} />
            </div>

            <div>
              <FieldLabel>Contact number</FieldLabel>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0771234567"
                inputMode="numeric"
                maxLength={14}
                aria-invalid={Boolean(errors.phone) || (phone.length > 0 && !phoneValid && cleanedPhone.length >= 10)}
              />
              <FieldError
                message={
                  errors.phone ??
                  (cleanedPhone.length >= 10 && !phoneValid ? "Must be 10 digits starting with 0" : undefined)
                }
              />
            </div>

            <div>
              <FieldLabel>Invoice number(s)</FieldLabel>
              <Input
                value={manualInvoices}
                onChange={(e) => setManualInvoices(e.target.value)}
                placeholder={foundInvoices.length > 0 ? "Add more…" : "400-000438 / 600-004939"}
              />
              {lookup.status === "loading" && (
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" /> Looking up invoices…
                </p>
              )}
              {lookup.status === "done" && foundInvoices.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  No invoices found for this number on the selected date. Please enter them here or try changing the date.
                </p>
              )}
              {lookup.status === "error" && (
                <p className="mt-1 text-xs text-muted-foreground">Couldn&apos;t load invoices — type them in.</p>
              )}
              {foundInvoices.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {foundInvoices.map((invoice) => {
                    const selected = selectedFound.has(invoice.invoiceNumber);
                    return (
                      <button
                        key={invoice.invoiceNumber}
                        type="button"
                        // Cancelled invoices are shown for information only and can't be picked.
                        disabled={invoice.cancelled}
                        onClick={() => toggleFound(invoice.invoiceNumber)}
                        title={[
                          invoice.cancelled ? "Cancelled — cannot be added" : null,
                          invoice.isOrderNumber ? "Order number — no ERP invoice yet" : null,
                          invoice.customerName,
                          invoice.locationName,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-xs transition-colors",
                          invoice.cancelled
                            ? "cursor-not-allowed border-destructive/60 bg-destructive/15 text-destructive"
                            : selected
                              ? "border-primary/60 bg-primary/15 text-foreground"
                              : "border-border text-muted-foreground line-through",
                        )}
                      >
                        {invoice.cancelled ? <X className="size-3" /> : selected && <Check className="size-3" />}
                        {invoice.invoiceNumber}
                        {invoice.cancelled && <span className="font-sans text-[10px]">cancelled</span>}
                        {!invoice.cancelled && invoice.isOrderNumber && (
                          <span className="font-sans text-[10px] text-amber-600 dark:text-amber-400">
                            order · ERP pending
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {cancelledFound.length > 0 && (
                <p className="mt-1 text-xs text-destructive">
                  {cancelledFound.length === 1
                    ? `Invoice ${cancelledFound[0].invoiceNumber} was cancelled and can't be added.`
                    : `Invoices ${cancelledFound.map((invoice) => invoice.invoiceNumber).join(", ")} were cancelled and can't be added.`}
                </p>
              )}
              <FieldError message={errors.invoices} />
            </div>

            <div>
              <FieldLabel>Customer name</FieldLabel>
              <Input
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  setNameTouched(true);
                }}
                placeholder="e.g. Nisansala"
              />
              {nameResolution.status === "ambiguous" && !customerName.trim() && (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  Customer name cannot be determined — the invoices have different names. Enter it manually.
                </p>
              )}
              <FieldError message={errors.name} />
            </div>

            <div>
              <FieldLabel>Merchant</FieldLabel>
              <Select
                value={merchant}
                onValueChange={(value) => {
                  setMerchant(value);
                  setMerchantTouched(true);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {CONSULTATION_MERCHANT_OPTIONS.map((option) => (
                    <SelectItem key={option.label} value={option.label}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!merchantTouched && suggestedMerchant && merchant === suggestedMerchant && (
                <p className="mt-1 text-xs text-muted-foreground">Auto-filled from the order — change if needed.</p>
              )}
              <FieldError message={errors.merchant} />
            </div>

            <div>
              <FieldLabel optional>Physical review update</FieldLabel>
              <Input value={review} onChange={(e) => setReview(e.target.value)} placeholder="Leave blank if none" />
            </div>

            <div className="flex items-start pt-5">
              <Button onClick={handleAdd} disabled={submitting} className="w-full xl:w-auto">
                {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
                Add
              </Button>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Invoices for the contact number on the selected date load automatically — click one to leave it out.
            Type extra invoices separated by / or a space. Each invoice gets its own row under the customer.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-border/50 pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <span className="size-2 rounded-full bg-emerald-500" aria-hidden />
            Live · {formatConsultationMonth(month)}
            <span className="font-normal text-muted-foreground">· refreshes every 10 seconds</span>
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadMonth(month)}
            disabled={loadingRows}
            title="Reload this month's customers"
          >
            <RefreshCw className={cn("mr-2 size-4", loadingRows && "animate-spin")} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {/* Scroll box so the header row stays visible; inner table container must not clip it. */}
          <div className="max-h-[70vh] overflow-auto [&_[data-slot=table-container]]:overflow-visible">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={cn(STICKY_HEAD, "w-10")} />
                  <TableHead className={STICKY_HEAD}>Date</TableHead>
                  <TableHead className={STICKY_HEAD}>Customer</TableHead>
                  <TableHead className={STICKY_HEAD}>Merchant</TableHead>
                  <TableHead className={STICKY_HEAD}>Contact number</TableHead>
                  <TableHead className={STICKY_HEAD}>Invoice number</TableHead>
                  <TableHead className={cn(STICKY_HEAD, "min-w-[260px]")}>Physical review update</TableHead>
                  <TableHead className={cn(STICKY_HEAD, "w-12")} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      <p className="font-medium text-foreground">
                        No customers for {formatConsultationMonth(month)} yet
                      </p>
                      <p className="mt-1">Use the form above to add the first one.</p>
                    </TableCell>
                  </TableRow>
                )}
                {/* One block per customer: shared details span all of their invoice rows. */}
                {pagedGroups.map((group, groupIndex) =>
                  group.rows.map((row, rowIndex) => {
                    const duplicate = duplicateInvoices.has(row.invoiceNumber.toUpperCase());
                    const oddFormat = !CONSULTATION_INVOICE_PATTERN.test(row.invoiceNumber);
                    const span = group.rows.length;
                    const isHead = rowIndex === 0;
                    return (
                      <TableRow
                        key={row.id}
                        className={cn(
                          "hover:bg-transparent",
                          isHead && groupIndex > 0 && "border-t-2 border-t-border",
                          !isHead && "border-b-0",
                        )}
                      >
                        {isHead && (
                          <>
                            <TableCell rowSpan={span} className="align-top text-xs text-muted-foreground tabular-nums">
                              {groupOffset + groupIndex + 1}
                            </TableCell>
                            <TableCell rowSpan={span} className="align-top whitespace-nowrap text-sm">
                              {formatAppCalendarDate(group.head.consultationDate, group.head.consultationDate)}
                            </TableCell>
                            <TableCell rowSpan={span} className="align-top font-medium">
                              {group.head.customerName}
                            </TableCell>
                            <TableCell rowSpan={span} className="align-top text-sm">
                              {group.head.merchantName}
                            </TableCell>
                            <TableCell rowSpan={span} className="align-top text-sm tabular-nums">
                              {group.head.contactNumber}
                            </TableCell>
                          </>
                        )}
                        <TableCell
                          className={cn(
                            "font-mono text-xs",
                            duplicate && "bg-rose-500/15",
                            !duplicate && oddFormat && "bg-amber-500/15",
                          )}
                        >
                          {row.invoiceNumber}
                        </TableCell>
                        {isHead && (
                          <TableCell rowSpan={span} className="align-top">
                            <ReviewCell row={group.head} onSaved={updateRows} />
                          </TableCell>
                        )}
                        {isHead && (
                          <TableCell rowSpan={span} className="align-top">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-destructive"
                              onClick={() => setPendingDelete(group)}
                              aria-label={`Delete ${group.head.customerName}`}
                              title="Delete customer"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  }),
                )}
              </TableBody>
            </Table>
          </div>
          {groups.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 px-4 py-3 text-sm text-muted-foreground">
              <div>
                Showing customers {groupOffset + 1}-{groupOffset + pagedGroups.length} of {groups.length}
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={String(pageSize)}
                  onValueChange={(value) => {
                    setPageSize(Number(value) as PageSize);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-9 w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {option} / page
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage <= 1}
                  onClick={() => setPage(Math.max(1, safePage - 1))}
                >
                  Previous
                </Button>
                <span className="min-w-[88px] text-center">
                  Page {safePage} of {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage >= pageCount}
                  onClick={() => setPage(Math.min(pageCount, safePage + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-4 border-t border-border/50 px-4 py-2.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-sm border border-amber-500/40 bg-amber-500/20" />
              Invoice number doesn&apos;t look like 400-000123
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-sm border border-rose-500/40 bg-rose-500/20" />
              Same invoice entered twice this month
            </span>
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.head.customerName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the customer and{" "}
              {pendingDelete && pendingDelete.rows.length > 1
                ? `all ${pendingDelete.rows.length} invoices (${pendingDelete.rows.map((row) => row.invoiceNumber).join(", ")})`
                : `invoice ${pendingDelete?.head.invoiceNumber ?? ""}`}{" "}
              from the log. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={deleting}
            >
              {deleting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
