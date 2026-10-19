"use client";

import { useCallback, useMemo, useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { notify } from "@/lib/notify";

type PayableLine = {
  supplierId: string;
  supplierName: string | null;
  company: string;
  poNumber: string | null;
  amount: number;
  total: number;
  poDate: string | null;
  dueDate: string | null;
  daysPastDue: number | null;
  remark: string | null;
  erpSlot: "ERP1" | "ERP2" | null;
  erpLabel: string | null;
  outstanding: number;
  currency: string | null;
};

type PayableGroup = {
  supplierId: string;
  supplierName: string | null;
  totalOutstanding: number;
  currency: string | null;
  lines: PayableLine[];
};

type PayablesResponse = {
  reportDate: string;
  refreshedAt: string | null;
  lastAttemptAt: string | null;
  groups: PayableGroup[];
  errors: string[];
};

function today() {
  return formatAppIsoDate(new Date());
}

function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "0";
  return (Math.round(value * 100) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function dateTime(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
function isConsignmentSupplier(name: string | null) {
  return /consign/i.test(name ?? "");
}

function PayableTable({ label, groups }: { label: string; groups: PayableGroup[] }) {
  return <section className="space-y-2">
    <h2 className="text-sm font-semibold">{label}</h2>
    <div className="max-h-[60vh] overflow-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-muted/50 text-left"><tr>
          {['Supplier', 'Company', 'PO Number', 'Amount', 'Total', 'PO Date', 'Due Date', 'Days Past Due', 'Remark'].map((header) => <th key={header} className={`p-2 font-medium ${['Amount', 'Total', 'Days Past Due'].includes(header) ? 'text-right' : ''}`}>{header}</th>)}
        </tr></thead>
        <tbody>{groups.flatMap((group) => group.lines.map((line, index) => <tr key={`${group.supplierId}-${line.company}-${line.erpSlot ?? ''}-${index}`} className="border-t">
          <td className="p-2"><div className="font-medium">{group.supplierName ?? group.supplierId}</div><div className="text-xs text-muted-foreground">{group.supplierId}</div></td>
          <td className="p-2">{line.company || '-'}</td><td className="p-2">{line.poNumber ?? '-'}</td><td className="p-2 text-right tabular-nums">{money(line.amount)}</td><td className="p-2 text-right tabular-nums">{money(line.total)}</td><td className="p-2 whitespace-nowrap">{line.poDate ?? '-'}</td><td className="p-2 whitespace-nowrap">{line.dueDate ?? '-'}</td><td className="p-2 text-right tabular-nums">{line.daysPastDue ?? '-'}</td><td className="p-2">{line.remark ?? '-'}</td>
        </tr>))}</tbody>
      </table>
    </div>
  </section>;
}

export function SupplierPayablesPanel() {
  const [reportDate, setReportDate] = useState(today());
  const [query, setQuery] = useState("");
  const [supplier, setSupplier] = useState("");
  const [company, setCompany] = useState("");
  const [data, setData] = useState<PayablesResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/finance/supplier-payables/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportDate }),
      });
      const json = await res.json();
      if (!res.ok) {
        notify.error(json.error ?? "Failed to refresh supplier payables");
        return;
      }
      setData(json);
      if (json.errors?.length) {
        notify.error("Refresh completed with ERP errors; last good balances were kept where available");
      } else {
        notify.success("Supplier payables refreshed");
      }
    } catch {
      notify.error("Failed to refresh supplier payables");
    } finally {
      setRefreshing(false);
    }
  }, [reportDate]);

  const exportRows = useCallback(async () => {
    setExporting(true);
    try {
      const res = await fetch(
        `/api/admin/finance/supplier-payables/export?reportDate=${encodeURIComponent(reportDate)}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
          notify.error("Failed to export supplier payables");
        return;
      }
      const link = document.createElement("a");
      link.href = URL.createObjectURL(await res.blob());
      link.download = `supplier-payables-${reportDate}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      notify.error("Failed to export supplier payables");
    } finally {
      setExporting(false);
    }
  }, [reportDate]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const groups = data?.groups ?? [];
    if (!q && !supplier && !company) return groups;
    return groups.filter(
      (group) =>
        (!supplier || group.supplierId === supplier) &&
        (!company || group.lines.some((line) => line.company === company)) &&
        (!q ||
          group.supplierId.toLowerCase().includes(q) ||
          (group.supplierName ?? "").toLowerCase().includes(q) ||
          group.lines.some((line) => line.company.toLowerCase().includes(q))),
    );
  }, [data?.groups, query, supplier, company]);

  const suppliers = useMemo(
    () =>
      [...new Map((data?.groups ?? []).map((group) => [group.supplierId, group.supplierName ?? group.supplierId])).entries()]
        .sort((a, b) => a[1].localeCompare(b[1])),
    [data?.groups],
  );
  const companies = useMemo(
    () => [...new Set((data?.groups ?? []).flatMap((group) => group.lines.map((line) => line.company)))].sort(),
    [data?.groups],
  );

  const totalOutstanding = useMemo(
    () => filteredGroups.reduce((sum, group) => sum + group.totalOutstanding, 0),
    [filteredGroups],
  );
  const payableSections = useMemo(() => [
    { label: "Normal", groups: filteredGroups.filter((group) => !isConsignmentSupplier(group.supplierName)) },
    { label: "Consignment", groups: filteredGroups.filter((group) => isConsignmentSupplier(group.supplierName)) },
  ].filter((section) => section.groups.length), [filteredGroups]);
  const busy = refreshing || exporting;

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Supplier Payable Outstanding</h1>
        <p className="text-sm text-muted-foreground">
          ERP Accounts Payable Summary outstanding values by supplier and company.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Report date</span>
          <Input
            type="date"
            value={reportDate}
            disabled={busy}
            onChange={(event) => setReportDate(event.target.value)}
            className="w-[160px]"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Search</span>
          <Input
            value={query}
            disabled={busy}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Supplier or company..."
            className="w-[240px]"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Supplier</span>
          <select
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
            value={supplier}
            disabled={busy}
            onChange={(event) => setSupplier(event.target.value)}
          >
            <option value="">All suppliers</option>
            {suppliers.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Company</span>
          <select
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
            value={company}
            disabled={busy}
            onChange={(event) => setCompany(event.target.value)}
          >
            <option value="">All companies</option>
            {companies.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <Button variant="outline" disabled={busy} onClick={() => void refresh()}>
          {refreshing ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
          Generate Report
        </Button>
        <Button variant="outline" disabled={busy || !filteredGroups.length} onClick={() => void exportRows()}>
          {exporting ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
          Export
        </Button>
      </div>

      <div className="text-sm text-muted-foreground flex flex-wrap gap-4">
        <span>
          Suppliers: <strong className="text-foreground">{filteredGroups.length}</strong>
        </span>
        <span>
          Outstanding: <strong className="text-foreground">{money(totalOutstanding)}</strong>
        </span>
        <span>
          Last refresh: <strong className="text-foreground">{dateTime(data?.refreshedAt ?? null)}</strong>
        </span>
        <span>
          Last attempt: <strong className="text-foreground">{dateTime(data?.lastAttemptAt ?? null)}</strong>
        </span>
      </div>

      {data?.errors?.length ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {data.errors.map((error, index) => (
            <div key={`${error}-${index}`}>{error}</div>
          ))}
        </div>
      ) : null}

      {filteredGroups.length === 0 && !busy ? <div className="rounded-md border p-4 text-muted-foreground">No report generated for this date. Click Generate Report to fetch from ERP.</div> : null}
      {payableSections.map((section) => <PayableTable key={section.label} label={section.label} groups={section.groups} />)}
      {busy ? <div className="rounded-md border p-4 text-muted-foreground">Loading supplier payables...</div> : null}
    </div>
  );
}
