import "server-only";

import { OsfErpError, type OsfErpCredentials } from "@/lib/osf/erp-stock";

type ReportColumn = { fieldname?: string | null; label?: string | null };
type ReportResponse = { message?: { columns?: ReportColumn[]; result?: unknown[] } };

const FROM_DATE = "1900-01-01";
const CENTS_TOLERANCE = 1;

export type ClearingAccountTransaction = {
  glEntryId: string | null;
  postingDate: string | null;
  creationTimestamp: string | null;
  account: string;
  voucherType: string | null;
  voucherNumber: string | null;
  debit: number;
  credit: number;
  remarks: string | null;
  direction: "IN" | "OUT" | "BOTH";
  allocatedAmount: number;
  unmatchedCredit: number;
};

export type ClearingAllocation = {
  glEntryId: string | null;
  postingDate: string | null;
  voucherType: string | null;
  voucherNumber: string | null;
  amount: number;
};

export type ClearingOutstandingTransaction = {
  glEntryId: string | null;
  postingDate: string | null;
  creationTimestamp: string | null;
  account: string;
  voucherType: string | null;
  voucherNumber: string | null;
  originalIncomingAmount: number;
  clearedAmount: number;
  remainingOutstanding: number;
  ageInDays: number | null;
  unattributedOpeningBalance: boolean;
  allocations: ClearingAllocation[];
};

export type ClearingAccountSummary = {
  accountId: string;
  accountName: string;
  company: string;
  erpSlot: "ERP1" | "ERP2" | null;
  erpLabel: string | null;
  currency: string | null;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
  outstanding: number;
  fifoOutstanding: number;
  unmatchedCredits: number;
  reconciliationDifference: number;
  reconciled: boolean;
  reconciliationWarning: string | null;
  outstandingTransactions: ClearingOutstandingTransaction[];
  generalLedger: ClearingAccountTransaction[];
};

type ClearingAccount = {
  accountId: string;
  accountName: string;
  company: string;
  currency: string | null;
};

type FiscalYear = {
  name: string;
  yearStartDate: string | null;
};

type TrialBalance = {
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
  currency: string | null;
};

type LedgerRow = {
  glEntryId: string | null;
  postingDate: string | null;
  creationTimestamp: string | null;
  account: string;
  voucherType: string | null;
  voucherNumber: string | null;
  debit: number;
  credit: number;
  remarks: string | null;
};

function text(value: unknown): string | null {
  const result = value == null ? "" : String(value).trim();
  return result || null;
}

function number(value: unknown): number {
  const result = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(result) ? result : 0;
}

function isTruthy(value: unknown): boolean {
  return value === true || value === 1 || /^(true|yes|1)$/i.test(String(value ?? "").trim());
}

function cents(value: number): number {
  return Math.round(value * 100);
}

function money(value: number): number {
  return value / 100;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function headerKey(column: ReportColumn): string {
  return (column.fieldname ?? column.label ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function reportValue(row: unknown, columns: ReportColumn[], names: string[]): unknown {
  const wanted = names.map((name) => normalize(name).replace(/[^a-z0-9]+/g, "_"));
  if (Array.isArray(row)) {
    const index = columns.findIndex((column) => wanted.includes(headerKey(column)));
    return index >= 0 ? row[index] : null;
  }
  if (!row || typeof row !== "object") return null;
  const object = row as Record<string, unknown>;
  const entries = new Map(Object.entries(object).map(([key, value]) => [headerKey({ fieldname: key }), value]));
  for (const key of wanted) {
    const found = entries.get(key);
    if (found != null) return found;
  }
  return null;
}

function authHeaders(cfg: OsfErpCredentials): Record<string, string> {
  return { Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`, Accept: "application/json" };
}

async function getJson<T>(cfg: OsfErpCredentials, path: string): Promise<T> {
  const response = await fetch(`${cfg.baseUrl}${path}`, { headers: authHeaders(cfg), cache: "no-store" });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new OsfErpError(`ERPNext GET ${path} [${response.status}]: ${detail.slice(0, 300)}`);
  }
  return (await response.json()) as T;
}

async function runReport(cfg: OsfErpCredentials, reportName: string, filters: Record<string, unknown>): Promise<ReportResponse> {
  const path = `/api/method/frappe.desk.query_report.run?report_name=${encodeURIComponent(reportName)}&filters=${encodeURIComponent(JSON.stringify(filters))}`;
  return getJson<ReportResponse>(cfg, path);
}

async function fetchClearingAccounts(cfg: OsfErpCredentials, company: string): Promise<ClearingAccount[]> {
  const filters = JSON.stringify([
    ["company", "=", company],
    ["is_group", "=", 0],
  ]);
  const fields = JSON.stringify(["name", "account_name", "is_group", "company", "account_currency"]);
  const accounts: ClearingAccount[] = [];
  for (let start = 0; start < 10000; start += 500) {
    const path = `/api/resource/Account?filters=${encodeURIComponent(filters)}&fields=${encodeURIComponent(fields)}&limit_start=${start}&limit_page_length=500`;
    const json = await getJson<{ data?: Array<{ name?: string; account_name?: string; is_group?: boolean | number; company?: string; account_currency?: string }> }>(cfg, path);
    const rows = json.data ?? [];
    for (const row of rows) {
      if (row.is_group === true || row.is_group === 1) continue;
      const accountId = text(row.name);
      const accountName = text(row.account_name) ?? accountId;
      if (!accountId || !accountName || !/clearing account/i.test(`${accountName} ${accountId}`)) continue;
      accounts.push({ accountId, accountName, company: text(row.company) ?? company, currency: text(row.account_currency) });
    }
    if (rows.length < 500) break;
  }
  return accounts;
}

async function fetchFiscalYear(cfg: OsfErpCredentials, reportDate: string): Promise<FiscalYear> {
  const filters = JSON.stringify([
    ["year_start_date", "<=", reportDate],
    ["year_end_date", ">=", reportDate],
    ["disabled", "=", 0],
  ]);
  const fields = JSON.stringify(["name", "year_start_date", "year_end_date"]);
  const json = await getJson<{ data?: Array<{ name?: string; year_start_date?: string; disabled?: boolean | number }> }>(cfg, `/api/resource/Fiscal%20Year?filters=${encodeURIComponent(filters)}&fields=${encodeURIComponent(fields)}&limit_page_length=20`);
  const match = (json.data ?? []).find((row) => text(row.name));
  const name = text(match?.name);
  if (!name) throw new OsfErpError(`No active ERPNext fiscal year found for ${reportDate}`);
  return { name, yearStartDate: text(match?.year_start_date) };
}

function trialBalanceForAccount(response: ReportResponse, account: ClearingAccount): TrialBalance {
  const columns = response.message?.columns ?? [];
  const match = (response.message?.result ?? []).find((row) => {
    const name = text(reportValue(row, columns, ["account", "account_name", "name"]));
    return name != null && [account.accountId, account.accountName].some((candidate) => normalize(candidate) === normalize(name));
  });
  return {
    openingDebit: number(reportValue(match, columns, ["opening_debit", "opening_dr"])),
    openingCredit: number(reportValue(match, columns, ["opening_credit", "opening_cr"])),
    periodDebit: number(reportValue(match, columns, ["debit", "period_debit"])),
    periodCredit: number(reportValue(match, columns, ["credit", "period_credit"])),
    closingDebit: number(reportValue(match, columns, ["closing_debit", "closing_dr"])),
    closingCredit: number(reportValue(match, columns, ["closing_credit", "closing_cr"])),
    currency: text(reportValue(match, columns, ["currency"])) ?? account.currency,
  };
}

async function fetchLedger(cfg: OsfErpCredentials, account: ClearingAccount, company: string, reportDate: string): Promise<LedgerRow[]> {
  const response = await runReport(cfg, "General Ledger", {
    company,
    account: [account.accountId],
    from_date: FROM_DATE,
    to_date: reportDate,
    show_cancelled_entries: 0,
    include_default_book_entries: 1,
  });
  const columns = response.message?.columns ?? [];
  const rows: LedgerRow[] = [];
  for (const row of response.message?.result ?? []) {
    if (isTruthy(reportValue(row, columns, ["is_cancelled", "cancelled", "is_cancelled_entry"]))) continue;
    const glEntryId = text(reportValue(row, columns, ["name", "gl_entry", "gl_entry_id"]));
    const voucherType = text(reportValue(row, columns, ["voucher_type"]));
    const voucherNumber = text(reportValue(row, columns, ["voucher_no", "voucher_number"]));
    const accountName = text(reportValue(row, columns, ["account"])) ?? account.accountName;
    const postingDate = text(reportValue(row, columns, ["posting_date"]));
    if (postingDate && postingDate.slice(0, 10) > reportDate) continue;
    const summaryText = `${voucherType ?? ""} ${voucherNumber ?? ""} ${accountName}`;
    if (!glEntryId && /opening|closing|total/i.test(summaryText)) continue;
    const debit = number(reportValue(row, columns, ["debit"]));
    const credit = number(reportValue(row, columns, ["credit"]));
    if (!glEntryId && !voucherNumber) continue;
    if (debit === 0 && credit === 0) continue;
    rows.push({
      glEntryId,
      postingDate,
      creationTimestamp: text(reportValue(row, columns, ["creation", "creation_timestamp"])),
      account: accountName,
      voucherType,
      voucherNumber,
      debit,
      credit,
      remarks: text(reportValue(row, columns, ["remarks", "remark"])),
    });
  }
  return rows.sort((a, b) => `${a.postingDate ?? ""}|${a.creationTimestamp ?? ""}|${a.glEntryId ?? ""}`.localeCompare(`${b.postingDate ?? ""}|${b.creationTimestamp ?? ""}|${b.glEntryId ?? ""}`));
}

type FifoQueueEntry = {
  source: LedgerRow | null;
  originalCents: number;
  remainingCents: number;
  clearedCents: number;
  unattributedOpeningBalance: boolean;
  allocations: ClearingAllocation[];
};

function ageInDays(reportDate: string, postingDate: string | null): number | null {
  if (!postingDate) return null;
  const report = Date.parse(`${reportDate.slice(0, 10)}T00:00:00Z`);
  const posting = Date.parse(`${postingDate.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(report) || !Number.isFinite(posting)) return null;
  return Math.max(0, Math.floor((report - posting) / 86400000));
}

function fifo(account: ClearingAccount, balance: TrialBalance, ledger: LedgerRow[], reportDate: string, erpSlot: "ERP1" | "ERP2" | null, erpLabel: string | null): ClearingAccountSummary {
  const openingDebit = cents(balance.openingDebit);
  const openingCredit = cents(balance.openingCredit);
  const queue: FifoQueueEntry[] = [];
  if (openingDebit > 0) queue.push({ source: null, originalCents: openingDebit, remainingCents: openingDebit, clearedCents: 0, unattributedOpeningBalance: true, allocations: [] });
  let unmatchedCreditsCents = openingCredit;
  const generalLedger: ClearingAccountTransaction[] = [];

  for (const row of ledger) {
    const debitCents = cents(row.debit);
    const creditCents = cents(row.credit);
    if (debitCents > 0) queue.push({ source: row, originalCents: debitCents, remainingCents: debitCents, clearedCents: 0, unattributedOpeningBalance: false, allocations: [] });
    let creditRemaining = creditCents;
    let allocatedCents = 0;
    while (creditRemaining > 0 && queue.length > 0) {
      const first = queue[0]!;
      const amount = Math.min(creditRemaining, first.remainingCents);
      first.remainingCents -= amount;
      first.clearedCents += amount;
      creditRemaining -= amount;
      allocatedCents += amount;
      first.allocations.push({ glEntryId: row.glEntryId, postingDate: row.postingDate, voucherType: row.voucherType, voucherNumber: row.voucherNumber, amount: money(amount) });
      if (first.remainingCents <= 0) queue.shift();
    }
    unmatchedCreditsCents += creditRemaining;
    generalLedger.push({
      ...row,
      direction: debitCents > 0 && creditCents > 0 ? "BOTH" : debitCents > 0 ? "IN" : "OUT",
      allocatedAmount: money(allocatedCents),
      unmatchedCredit: money(creditRemaining),
    });
  }

  const outstandingTransactions = queue.filter((entry) => entry.remainingCents > 0).map((entry) => ({
    glEntryId: entry.source?.glEntryId ?? null,
    postingDate: entry.source?.postingDate ?? null,
    creationTimestamp: entry.source?.creationTimestamp ?? null,
    account: entry.source?.account ?? account.accountName,
    voucherType: entry.source?.voucherType ?? "Opening Balance",
    voucherNumber: entry.source?.voucherNumber ?? null,
    originalIncomingAmount: money(entry.originalCents),
    clearedAmount: money(entry.clearedCents),
    remainingOutstanding: money(entry.remainingCents),
    ageInDays: ageInDays(reportDate, entry.source?.postingDate ?? null),
    unattributedOpeningBalance: entry.unattributedOpeningBalance,
    allocations: entry.allocations,
  }));
  const fifoOutstandingCents = queue.reduce((sum, entry) => sum + entry.remainingCents, 0);
  const outstandingCents = cents(balance.closingDebit - balance.closingCredit);
  const reconciliationDifferenceCents = fifoOutstandingCents - unmatchedCreditsCents - outstandingCents;
  const reconciliationDifference = money(reconciliationDifferenceCents);
  const reconciled = Math.abs(reconciliationDifferenceCents) <= CENTS_TOLERANCE;
  const warning = reconciled
    ? outstandingTransactions.some((entry) => entry.unattributedOpeningBalance) ? "FIFO-inferred; includes an unattributed opening balance." : "FIFO-inferred allocation reconciles to Trial Balance."
    : `FIFO/Trial Balance difference: ${reconciliationDifference.toFixed(2)}. Review transaction history and opening balances.`;
  return {
    accountId: account.accountId,
    accountName: account.accountName,
    company: account.company,
    erpSlot,
    erpLabel,
    currency: balance.currency,
    openingDebit: balance.openingDebit,
    openingCredit: balance.openingCredit,
    periodDebit: balance.periodDebit,
    periodCredit: balance.periodCredit,
    closingDebit: balance.closingDebit,
    closingCredit: balance.closingCredit,
    outstanding: balance.closingDebit - balance.closingCredit,
    fifoOutstanding: money(fifoOutstandingCents),
    unmatchedCredits: money(unmatchedCreditsCents),
    reconciliationDifference,
    reconciled,
    reconciliationWarning: warning,
    outstandingTransactions,
    generalLedger,
  };
}

export async function fetchClearingAccountReport(input: {
  cfg: OsfErpCredentials;
  company: string;
  reportDate: string;
  erpSlot: "ERP1" | "ERP2" | null;
  erpLabel: string | null;
}): Promise<ClearingAccountSummary[]> {
  const accounts = await fetchClearingAccounts(input.cfg, input.company);
  if (accounts.length === 0) return [];
  const fiscalYear = await fetchFiscalYear(input.cfg, input.reportDate);
  const trialBalance = await runReport(input.cfg, "Trial Balance", {
    company: input.company,
    fiscal_year: fiscalYear.name,
    from_date: fiscalYear.yearStartDate ?? FROM_DATE,
    to_date: input.reportDate,
    include_default_book_entries: 1,
  });
  const output: ClearingAccountSummary[] = [];
  for (const account of accounts) {
    const balance = trialBalanceForAccount(trialBalance, account);
    const ledger = await fetchLedger(input.cfg, account, input.company, input.reportDate);
    output.push(fifo(account, balance, ledger, input.reportDate, input.erpSlot, input.erpLabel));
  }
  return output;
}
