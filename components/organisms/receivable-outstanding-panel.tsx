"use client";

import { useCallback, useMemo, useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { notify } from "@/lib/notify";

type Row = {
  invoiceNo: string; customer: string; company: string; erpSlot: "ERP1" | "ERP2" | null;
  currency: string | null; invoiceDate: string | null; invoiceAmount: number; outstanding: number;
  orderId: string | null; dispatchDate: string | null; shippingService: string | null;
  cosmoOrderStatus: string | null; reason: string | null; age: number | null; ageingBucket: string;
  ageing1To2: number; ageing3To4: number; ageing5To7: number; ageing8To30: number; ageing31Plus: number;
};
type ClearingAllocation = { glEntryId: string | null; postingDate: string | null; voucherType: string | null; voucherNumber: string | null; amount: number };
type ClearingOutstanding = { glEntryId: string | null; postingDate: string | null; creationTimestamp: string | null; account: string; voucherType: string | null; voucherNumber: string | null; originalIncomingAmount: number; clearedAmount: number; remainingOutstanding: number; ageInDays: number | null; unattributedOpeningBalance: boolean; allocations: ClearingAllocation[] };
type ClearingLedger = { glEntryId: string | null; postingDate: string | null; creationTimestamp: string | null; account: string; voucherType: string | null; voucherNumber: string | null; debit: number; credit: number; remarks: string | null; direction: string; allocatedAmount: number; unmatchedCredit: number };
type ClearingAccount = { accountId: string; accountName: string; company: string; erpSlot: "ERP1" | "ERP2" | null; erpLabel: string | null; currency: string | null; openingDebit: number; openingCredit: number; periodDebit: number; periodCredit: number; closingDebit: number; closingCredit: number; outstanding: number; fifoOutstanding: number; unmatchedCredits: number; reconciliationDifference: number; reconciled: boolean; reconciliationWarning: string | null; outstandingTransactions: ClearingOutstanding[]; generalLedger: ClearingLedger[] };
type Result = { reportDate: string; refreshedAt: string | null; lastAttemptAt: string | null; rows: Row[]; clearingAccounts: ClearingAccount[]; errors: string[] };

function money(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function dateTime(value: string | null) { return value ? new Date(value).toLocaleString() : "Never"; }

export function ReceivableOutstandingPanel() {
  const [reportDate, setReportDate] = useState(formatAppIsoDate(new Date()));
  const [query, setQuery] = useState("");
  const [clearingQuery, setClearingQuery] = useState("");
  const [company, setCompany] = useState("");
  const [erp, setErp] = useState("");
  const [data, setData] = useState<Result | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/finance/receivable-outstanding/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reportDate }) });
      const json = await res.json();
      if (!res.ok) { notify.error(json.error ?? "Failed to refresh receivables"); return; }
      setData(json);
      if (json.errors?.length) {
        notify.error(json.rows?.length ? "Report generated with ERP errors; last good balances were kept" : `Report was not generated: ${json.errors[0]}`);
      } else if (json.rows?.length || json.clearingAccounts?.length) {
        notify.success("Receivable report generated");
      } else {
        notify.error("Report generated no rows for this date. Check the report date and ERP data.");
      }
    } catch { notify.error("Failed to refresh receivables"); } finally { setRefreshing(false); }
  }, [reportDate]);
  const exportRows = useCallback(async () => {
    const res = await fetch(`/api/admin/finance/receivable-outstanding/export?reportDate=${encodeURIComponent(reportDate)}`, { cache: "no-store" });
    if (!res.ok) { notify.error("Failed to export receivables"); return; }
    const link = document.createElement("a"); link.href = URL.createObjectURL(await res.blob()); link.download = `receivable-outstanding-${reportDate}.xlsx`; link.click();
  }, [reportDate]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.rows ?? []).filter((row) => (!company || row.company === company) && (!erp || row.erpSlot === erp) && (!q || [row.invoiceNo, row.customer, row.shippingService].some((value) => (value ?? "").toLowerCase().includes(q))));
  }, [data?.rows, query, company, erp]);
  const companies = [...new Set([...(data?.rows ?? []).map((row) => row.company), ...(data?.clearingAccounts ?? []).map((account) => account.company)])].sort();
  const erpOptions = [...new Set([...(data?.rows ?? []).map((row) => row.erpSlot), ...(data?.clearingAccounts ?? []).map((account) => account.erpSlot)].filter((slot): slot is "ERP1" | "ERP2" => Boolean(slot)))].sort();
  const clearingAccounts = useMemo(() => {
    const q = clearingQuery.trim().toLowerCase();
    return (data?.clearingAccounts ?? []).filter((account) => (!company || account.company === company) && (!erp || account.erpSlot === erp) && (!q || [account.accountName, account.accountId, account.company, account.erpSlot].some((value) => (value ?? "").toLowerCase().includes(q))));
  }, [data?.clearingAccounts, clearingQuery, company, erp]);
  const busy = refreshing;
  const total = rows.reduce((sum, row) => sum + row.outstanding, 0);

  return <div className="space-y-4 p-6">
    <div><h1 className="text-xl font-semibold">Receivable Outstanding</h1><p className="text-sm text-muted-foreground">Invoice-wise Accounts Receivable plus FIFO-matched clearing-account balances from ERP1 and ERP2.</p></div>
    <div className="flex flex-wrap items-end gap-3">
      <label className="space-y-1 text-sm"><span className="text-muted-foreground">Report date</span><Input type="date" value={reportDate} disabled={busy} onChange={(event) => setReportDate(event.target.value)} className="w-[160px]" /></label>
      <label className="space-y-1 text-sm"><span className="text-muted-foreground">Company</span><select className="border-input bg-background h-9 rounded-md border px-2 text-sm" value={company} disabled={busy} onChange={(event) => setCompany(event.target.value)}><option value="">All companies</option>{companies.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="space-y-1 text-sm"><span className="text-muted-foreground">ERP</span><select className="border-input bg-background h-9 rounded-md border px-2 text-sm" value={erp} disabled={busy} onChange={(event) => setErp(event.target.value)}><option value="">All ERP sources</option>{erpOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="space-y-1 text-sm"><span className="text-muted-foreground">Invoice / customer</span><Input value={query} disabled={busy} onChange={(event) => setQuery(event.target.value)} placeholder="Search..." className="w-[240px]" /></label>
      <Button variant="outline" disabled={busy} onClick={() => void refresh()}>{refreshing ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />} Generate Report</Button>
      <Button variant="outline" disabled={busy || !(data?.rows.length || data?.clearingAccounts?.length)} onClick={() => void exportRows()}><Download aria-hidden /> Export</Button>
    </div>
    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground"><span>Invoices: <strong className="text-foreground">{rows.length}</strong></span><span>Total outstanding: <strong className="text-foreground">{money(total)}</strong></span><span>Last refresh: <strong className="text-foreground">{dateTime(data?.refreshedAt ?? null)}</strong></span></div>
    {data?.errors?.length ? <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{data.errors.map((error, index) => <div key={`${error}-${index}`}>{error}</div>)}</div> : null}
    <div className="max-h-[calc(100vh-180px)] overflow-auto rounded-md border"><table className="w-full min-w-[1400px] text-sm"><thead className="bg-muted/50 text-left"><tr>{["Customer", "Company", "ERP", "Invoice No", "Invoice Date", "Invoice Amount", "Outstanding", "Dispatch Date", "Shipping Service", "Cosmo Order Status", "Reason", "Age", "1 to 2 Days", "3 to 4 Days", "5 to 7 Days", "08 to 30 Days", "Above 01 Month"].map((header) => <th key={header} className="p-2 font-medium">{header}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={`${row.erpSlot}-${row.company}-${row.invoiceNo}`} className="border-t"><td className="p-2">{row.customer}</td><td className="p-2">{row.company}</td><td className="p-2">{row.erpSlot ?? "-"}</td><td className="p-2">{row.invoiceNo}</td><td className="p-2 whitespace-nowrap">{row.invoiceDate ?? "-"}</td><td className="p-2 text-right">{money(row.invoiceAmount)}</td><td className="p-2 text-right font-medium">{money(row.outstanding)}</td><td className="p-2 whitespace-nowrap">{row.dispatchDate ?? "-"}</td><td className="p-2">{row.shippingService ?? "-"}</td><td className="p-2">{row.cosmoOrderStatus ?? "-"}</td><td className="p-2">{row.reason ?? "-"}</td><td className="p-2 text-right">{row.age ?? "-"}</td><td className="p-2 text-right">{money(row.ageing1To2)}</td><td className="p-2 text-right">{money(row.ageing3To4)}</td><td className="p-2 text-right">{money(row.ageing5To7)}</td><td className="p-2 text-right">{money(row.ageing8To30)}</td><td className="p-2 text-right">{money(row.ageing31Plus)}</td></tr>)}{!rows.length && !busy ? <tr><td colSpan={17} className="p-4 text-muted-foreground">No receivable invoices for this date.</td></tr> : null}{busy ? <tr><td colSpan={17} className="p-4 text-muted-foreground">Loading receivables...</td></tr> : null}</tbody></table></div>
    <section className="space-y-3 rounded-md border p-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">Clearing Account Outstanding</h2><p className="text-sm text-muted-foreground">Trial Balance balances with FIFO-inferred General Ledger outstanding transactions.</p></div><Input value={clearingQuery} disabled={busy} onChange={(event) => setClearingQuery(event.target.value)} placeholder="Search clearing account..." className="w-[260px]" /></div>
      <div className="overflow-auto rounded-md border"><table className="w-full min-w-[1100px] text-sm"><thead className="bg-muted/50 text-left"><tr>{["Clearing Account", "Company", "ERP", "Currency", "Outstanding", "FIFO Outstanding", "Unmatched Credits", "Reconciliation", "Warning"].map((header) => <th key={header} className="p-2 font-medium">{header}</th>)}</tr></thead><tbody>{clearingAccounts.map((account) => <tr key={`${account.erpSlot}-${account.company}-${account.accountId}`} className="border-t align-top"><td className="p-2"><details><summary className="cursor-pointer font-medium text-primary">{account.accountName}</summary><div className="mt-3 space-y-3"><div className="text-xs text-muted-foreground">Closing balance: {money(account.closingDebit - account.closingCredit)}</div><div className="overflow-auto rounded border"><table className="w-full min-w-[1000px] text-xs"><thead className="bg-muted/50"><tr>{["Posting Date", "Voucher Type", "Voucher Number", "Original Incoming", "Cleared", "Remaining", "Age", "Opening Balance", "Allocated Outgoing"].map((header) => <th key={header} className="p-2 text-left">{header}</th>)}</tr></thead><tbody>{account.outstandingTransactions.map((entry, index) => <tr key={`${entry.glEntryId ?? "opening"}-${index}`} className="border-t"><td className="p-2">{entry.postingDate ?? "-"}</td><td className="p-2">{entry.voucherType ?? "-"}</td><td className="p-2">{entry.voucherNumber ?? "-"}</td><td className="p-2 text-right">{money(entry.originalIncomingAmount)}</td><td className="p-2 text-right">{money(entry.clearedAmount)}</td><td className="p-2 text-right font-medium">{money(entry.remainingOutstanding)}</td><td className="p-2 text-right">{entry.ageInDays ?? "-"}</td><td className="p-2">{entry.unattributedOpeningBalance ? "Yes" : "No"}</td><td className="p-2">{entry.allocations.map((allocation) => `${allocation.voucherNumber ?? allocation.glEntryId ?? "-"}: ${money(allocation.amount)}`).join(", ") || "-"}</td></tr>)}{!account.outstandingTransactions.length ? <tr><td colSpan={9} className="p-2 text-muted-foreground">No FIFO outstanding incoming transactions.</td></tr> : null}</tbody></table></div><details><summary className="cursor-pointer text-xs font-medium">Full General Ledger ({account.generalLedger.length})</summary><div className="mt-2 max-h-80 overflow-auto rounded border"><table className="w-full min-w-[1000px] text-xs"><thead className="bg-muted/50"><tr>{["GL Entry ID", "Posting Date", "Voucher Type", "Voucher Number", "Debit", "Credit", "Direction", "Allocated", "Unmatched Credit", "Remarks"].map((header) => <th key={header} className="p-2 text-left">{header}</th>)}</tr></thead><tbody>{account.generalLedger.map((entry, index) => <tr key={`${entry.glEntryId ?? "entry"}-${index}`} className="border-t"><td className="p-2">{entry.glEntryId ?? "-"}</td><td className="p-2">{entry.postingDate ?? "-"}</td><td className="p-2">{entry.voucherType ?? "-"}</td><td className="p-2">{entry.voucherNumber ?? "-"}</td><td className="p-2 text-right">{money(entry.debit)}</td><td className="p-2 text-right">{money(entry.credit)}</td><td className="p-2">{entry.direction}</td><td className="p-2 text-right">{money(entry.allocatedAmount)}</td><td className="p-2 text-right">{money(entry.unmatchedCredit)}</td><td className="p-2">{entry.remarks ?? "-"}</td></tr>)}</tbody></table></div></details></div></details></td><td className="p-2">{account.company}</td><td className="p-2">{account.erpSlot ?? "-"}</td><td className="p-2">{account.currency ?? "-"}</td><td className="p-2 text-right font-medium">{money(account.outstanding)}</td><td className="p-2 text-right">{money(account.fifoOutstanding)}</td><td className="p-2 text-right">{money(account.unmatchedCredits)}</td><td className="p-2">{account.reconciled ? <span className="text-green-700">Reconciled</span> : <span className="text-red-700">Review</span>}</td><td className="p-2 text-xs">{account.reconciliationWarning ?? "-"}</td></tr>)}{!clearingAccounts.length && !busy ? <tr><td colSpan={9} className="p-4 text-muted-foreground">No clearing accounts found for this date.</td></tr> : null}{busy ? <tr><td colSpan={9} className="p-4 text-muted-foreground">Loading clearing accounts...</td></tr> : null}</tbody></table></div>
    </section>
  </div>;
}
