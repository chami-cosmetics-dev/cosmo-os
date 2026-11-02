import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx-js-style";

import { defaultSupplierPayablesReportDate } from "@/lib/supplier-payables";
import { loadCachedReceivables } from "@/lib/receivable-outstanding";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const context = await getCurrentUserContext();
  if (!context?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(context, "finance.receivable_outstanding.read")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = context.user.companyId;
  if (!companyId) return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  const reportDate = request.nextUrl.searchParams.get("reportDate") ?? defaultSupplierPayablesReportDate();
  const loaded = await loadCachedReceivables(companyId, reportDate);
  const rows = loaded.rows.map((row) => ({
    Customer: row.customer,
    Company: row.company,
    "Invoice No": row.invoiceNo,
    "Invoice Date": row.invoiceDate ?? "",
    "Invoice Amount": row.invoiceAmount,
    Outstanding: row.outstanding,
    Currency: row.currency ?? "",
    "Dispatch Date": row.dispatchDate ?? "",
    "Shipping Service": row.shippingService ?? "",
    "Cosmo Order Status": row.cosmoOrderStatus ?? "",
    Reason: row.reason ?? "",
    Age: row.age ?? "",
    "1 to 2 Days": row.ageing1To2,
    "3 to 4 Days": row.ageing3To4,
    "5 to 7 Days": row.ageing5To7,
    "08 to 30 Days": row.ageing8To30,
    "Above 01 Month": row.ageing31Plus,
  }));
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  const headerStyle = { fill: { fgColor: { rgb: "17365D" } }, font: { bold: true, color: { rgb: "FFFFFF" } }, alignment: { horizontal: "center", vertical: "center" } };
  const amountStyle = { fill: { fgColor: { rgb: "E2F0D9" } } };
  const ageingStyle = { fill: { fgColor: { rgb: "FFF2CC" } } };
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const header = sheet[XLSX.utils.encode_cell({ r: 0, c: column })];
    if (header) header.s = headerStyle;
    const label = String(header?.v ?? "");
    const style = ["Invoice Amount", "Outstanding"].includes(label) ? amountStyle : ["1 to 2 Days", "3 to 4 Days", "5 to 7 Days", "08 to 30 Days", "Above 01 Month"].includes(label) ? ageingStyle : null;
    if (style) for (let row = 1; row <= range.e.r; row += 1) { const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })]; if (cell) cell.s = style; }
  }
  sheet["!cols"] = rows.length ? Object.keys(rows[0]).map((key) => ({ wch: Math.max(14, Math.min(24, key.length + 3)) })) : [];
  XLSX.utils.book_append_sheet(workbook, sheet, "Receivable Outstanding");
  const clearingAccounts = loaded.clearingAccounts.map((account) => ({
    "Clearing Account": account.accountName,
    "Account ID": account.accountId,
    Company: account.company,
    ERP: account.erpSlot ?? "",
    Currency: account.currency ?? "",
    "Closing Debit": account.closingDebit,
    "Closing Credit": account.closingCredit,
    Outstanding: account.outstanding,
    "FIFO Outstanding": account.fifoOutstanding,
    "Unmatched Credits": account.unmatchedCredits,
    Reconciled: account.reconciled ? "Yes" : "No",
    "Reconciliation Difference": account.reconciliationDifference,
    Warning: account.reconciliationWarning ?? "",
  }));
  const clearingOutstanding = loaded.clearingAccounts.flatMap((account) => account.outstandingTransactions.map((row) => ({
    "Clearing Account": account.accountName,
    "Account ID": account.accountId,
    Company: account.company,
    ERP: account.erpSlot ?? "",
    "Posting Date": row.postingDate ?? "",
    "Voucher Type": row.voucherType ?? "",
    "Voucher Number": row.voucherNumber ?? "",
    "GL Entry ID": row.glEntryId ?? "",
    "Original Incoming Amount": row.originalIncomingAmount,
    "Cleared Amount": row.clearedAmount,
    "Remaining Outstanding": row.remainingOutstanding,
    "Age in Days": row.ageInDays ?? "",
    "Unattributed Opening Balance": row.unattributedOpeningBalance ? "Yes" : "No",
    Allocations: row.allocations.map((allocation) => `${allocation.voucherNumber ?? allocation.glEntryId ?? ""}: ${allocation.amount.toFixed(2)}`).join("; "),
  })));
  const clearingLedger = loaded.clearingAccounts.flatMap((account) => account.generalLedger.map((row) => ({
    "Clearing Account": account.accountName,
    "Account ID": account.accountId,
    Company: account.company,
    ERP: account.erpSlot ?? "",
    "GL Entry ID": row.glEntryId ?? "",
    "Posting Date": row.postingDate ?? "",
    Creation: row.creationTimestamp ?? "",
    Account: row.account,
    "Voucher Type": row.voucherType ?? "",
    "Voucher Number": row.voucherNumber ?? "",
    Debit: row.debit,
    Credit: row.credit,
    Remarks: row.remarks ?? "",
    Direction: row.direction,
    "Allocated Amount": row.allocatedAmount,
    "Unmatched Credit": row.unmatchedCredit,
  })));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(clearingAccounts), "Clearing Accounts");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(clearingOutstanding), "Clearing Outstanding");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(clearingLedger), "Clearing General Ledger");
  const clearingHeaderStyle = { fill: { fgColor: { rgb: "17365D" } }, font: { bold: true, color: { rgb: "FFFFFF" } }, alignment: { horizontal: "center", vertical: "center", wrapText: true } };
  for (const name of ["Clearing Accounts", "Clearing Outstanding", "Clearing General Ledger"]) {
    const worksheet = workbook.Sheets[name];
    const range = XLSX.utils.decode_range(worksheet["!ref"] ?? "A1");
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: 0, c: column })];
      if (cell) cell.s = clearingHeaderStyle;
    }
    worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };
    worksheet["!autofilter"] = { ref: XLSX.utils.encode_range(range) };
    worksheet["!cols"] = Array.from({ length: range.e.c - range.s.c + 1 }, (_, index) => ({ wch: Math.max(14, Math.min(32, String(worksheet[XLSX.utils.encode_cell({ r: 0, c: index })]?.v ?? "").length + 4)) }));
  }
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="receivable-outstanding-${reportDate}.xlsx"`, "Cache-Control": "no-store" } });
}
