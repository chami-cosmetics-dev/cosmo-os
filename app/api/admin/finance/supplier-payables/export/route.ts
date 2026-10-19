import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx-js-style";

import { loadCachedSupplierPayables } from "@/lib/supplier-payables";
import { defaultSupplierPayablesReportDate } from "@/lib/supplier-payables";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";
function isConsignmentSupplier(name: string) { return /consign/i.test(name); }

export async function GET(request: NextRequest) {
  const context = await getCurrentUserContext();
  if (!context?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(context, "finance.supplier_payables.read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const companyId = context.user.companyId;
  if (!companyId) return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  const reportDate = request.nextUrl.searchParams.get("reportDate") ?? defaultSupplierPayablesReportDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) return NextResponse.json({ error: "Invalid reportDate" }, { status: 400 });

  const loaded = await loadCachedSupplierPayables(companyId, reportDate);
  const toRow = (group: (typeof loaded.groups)[number], line: (typeof loaded.groups)[number]["lines"][number]) =>
    ({
      Supplier: line.supplierName ?? line.supplierId,
      "Supplier ID": line.supplierId,
      Company: line.company,
      "Item Code": line.itemCode ?? "",
      "Item Name": line.itemName ?? "",
      "ERP Source": line.erpSlot ?? line.erpLabel ?? "",
      "PO Number": line.poNumber ?? "",
      Amount: line.amount,
      Total: line.total,
      "PO Date": line.poDate ?? "",
      "Due Date": line.dueDate ?? "",
      "Days Past Due": line.daysPastDue ?? "",
      Remark: line.remark ?? "",
      Currency: line.currency ?? "",
    });
  const normalRows = loaded.groups.filter((group) => !isConsignmentSupplier(group.supplierName ?? "")).flatMap((group) =>
    group.lines.map((line) => {
      const row = toRow(group, line);
      return Object.fromEntries(Object.entries(row).filter(([key]) => key !== "Item Code" && key !== "Item Name"));
    }),
  );
  const consignmentRows = loaded.groups.filter((group) => isConsignmentSupplier(group.supplierName ?? "")).flatMap((group) => group.lines.map((line) => {
    const row = toRow(group, line);
    return Object.fromEntries(Object.entries(row).filter(([key]) => key !== "Item Code" && key !== "Item Name"));
  }));
  const consignmentItemMap = new Map<string, {
    Supplier: string;
    "Supplier ID": string;
    Company: string;
    "Item Code": string;
    "Item Name": string;
    "ERP Source": string;
    "PO Number": string;
    "Line Count": number;
    "Available Stock": number;
  }>();
  for (const group of loaded.groups.filter((candidate) => isConsignmentSupplier(candidate.supplierName ?? ""))) {
    for (const line of group.lines) {
      const items = line.itemLines?.length ? line.itemLines : [{ itemCode: line.itemCode, itemName: line.itemName, poNumber: line.poNumber, quantity: 1, amount: line.amount, availableStock: 0 }];
      for (const item of items) {
      const itemCode = item.itemCode ?? "";
      const itemName = item.itemName ?? "";
      const key = [line.supplierId, line.company, line.erpSlot ?? line.erpLabel ?? "", item.poNumber ?? line.poNumber ?? "", itemCode, itemName].join("\u0000");
      const existing = consignmentItemMap.get(key);
      if (existing) {
        existing["Line Count"] += item.quantity;
        existing["Available Stock"] = item.availableStock;
      } else {
        consignmentItemMap.set(key, {
          Supplier: line.supplierName ?? line.supplierId,
          "Supplier ID": line.supplierId,
          Company: line.company,
          "Item Code": itemCode,
          "Item Name": itemName,
          "ERP Source": line.erpSlot ?? line.erpLabel ?? "",
          "PO Number": item.poNumber ?? line.poNumber ?? "",
          "Line Count": item.quantity,
          "Available Stock": item.availableStock,
        });
      }
      }
    }
  }
  const consignmentItemRows = [...consignmentItemMap.values()];
  const workbook = XLSX.utils.book_new();
  const styleSheet = (sheet: XLSX.WorkSheet, rows: unknown[]) => {
    const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
    const headerStyle = { fill: { fgColor: { rgb: "17365D" } }, font: { bold: true, color: { rgb: "FFFFFF" } }, alignment: { horizontal: "center", vertical: "center" } };
    for (let column = range.s.c; column <= range.e.c; column += 1) { const header = sheet[XLSX.utils.encode_cell({ r: 0, c: column })]; if (header) header.s = headerStyle; }
    sheet["!cols"] = rows.length ? Object.keys(rows[0] as object).map((key) => ({ wch: Math.max(14, Math.min(24, key.length + 3)) })) : [];
  };
  const sheet = XLSX.utils.json_to_sheet(normalRows);
  styleSheet(sheet, normalRows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Normal");
  const consignmentSheet = XLSX.utils.json_to_sheet(consignmentRows);
  styleSheet(consignmentSheet, consignmentRows);
  XLSX.utils.book_append_sheet(workbook, consignmentSheet, "Consignment");
  const consignmentItemSheet = XLSX.utils.json_to_sheet(consignmentItemRows);
  styleSheet(consignmentItemSheet, consignmentItemRows);
  XLSX.utils.book_append_sheet(workbook, consignmentItemSheet, "Consignment Items");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="supplier-payables-${reportDate}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
