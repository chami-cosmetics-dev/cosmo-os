import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx-js-style";

import {
  buildIntercompanyReport,
  buildIntercompanyTallyDifferences,
  companyKey,
  intercompanyMatrixValue,
  isCancelledIntercompanyDocument,
  type IntercompanyInvoice,
  type IntercompanyMaterialIssue,
  type IntercompanyPurchaseReceipt,
  type IntercompanyStockReturn,
} from "@/lib/grn-intercompany-report";
import { buildGrnCompanyResolver } from "@/lib/grn-company-resolver";
import { autoMatchBackfillIntercompanyGrn, autoMatchIntercompanyGrn } from "@/lib/grn";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseDateParam(value: string | null, endOfDay = false) {
  if (!value) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function erpPayload(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return null;
  const top = rawPayload as Record<string, unknown>;
  const nested = top.data;
  return nested && typeof nested === "object" && !Array.isArray(nested)
    ? (nested as Record<string, unknown>)
    : top;
}

function erpCompany(rawPayload: unknown) {
  const value = erpPayload(rawPayload)?.company;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function activeRows<T extends { name: string; docstatus: number | null; status?: string | null; amendedFrom?: string | null }>(rows: T[], amendedNames: ReadonlySet<string> = new Set()) {
  return rows.filter((row) => !isCancelledIntercompanyDocument(row) && !amendedNames.has(row.name.trim().toUpperCase()));
}

function filenameDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function reportDate(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

const screenshotPairFills = new Map<string, string>([
  ["AJS|COS", "FFFF00"],
  ["AJS|PEVI", "9DC3E6"],
  ["AJS|SPK", "00B050"],
  ["CHAMI|COS", "00B050"],
  ["CHAMI|PEVI", "D6B4D8"],
  ["COS|DRO", "7F7F7F"],
  ["COS|LMJ", "A5A5A5"],
  ["COS|LWK", "E267C5"],
  ["COS|MNK", "A9D18E"],
  ["COS|PEVI", "4472C4"],
  ["COS|SPK", "ED7D31"],
  ["DRO|MNK", "70AD47"],
  ["DRO|SPK", "C65911"],
  ["LMJ|PEVI", "00B0A6"],
  ["LWK|MNK", "FF8080"],
  ["LWK|PEVI", "FFD966"],
  ["LWK|SPK", "FF0066"],
  ["MNK|PEVI", "7030A0"],
  ["MNK|SPK", "00B0F0"],
  ["PEVI|SPK", "FF6666"],
]);

const fallbackPairFills = [
  "FFF2CC",
  "C6E0B4",
  "BDD7EE",
  "F8CBAD",
  "D9E1F2",
  "E4DFEC",
  "F4B183",
  "A9D18E",
  "9DC3E6",
  "FFD966",
];

function companyPairKey(first: string, second: string) {
  return [first.trim().toUpperCase(), second.trim().toUpperCase()].sort().join("|");
}

function companyPairFill(first: string, second: string) {
  const key = companyPairKey(first, second);
  const screenshotFill = screenshotPairFills.get(key);
  if (screenshotFill) return screenshotFill;
  let hash = 0;
  for (const character of key) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return fallbackPairFills[hash % fallbackPairFills.length];
}

function buildWorkbook(report: ReturnType<typeof buildIntercompanyReport>) {
  const workbook = XLSX.utils.book_new();
  const { companies } = report.matrix;
  const summaryRows: Array<Array<string | number>> = [
    ["Row Labels", ...companies.map((company) => company.label), "Grand Total"],
    ...companies.map((company) => [
      company.label,
      ...companies.map((counterparty) => {
        const value = intercompanyMatrixValue(report.matrix, company.name, counterparty.name);
        return value === 0 ? "" : value;
      }),
      report.matrix.rowTotals.get(companyKey(company.name)) ?? 0,
    ]),
    [
      "Grand Total",
      ...companies.map((company) => report.matrix.columnTotals.get(companyKey(company.name)) ?? 0),
      report.matrix.grandTotal,
    ],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  const summaryRange = XLSX.utils.decode_range(summarySheet["!ref"] ?? "A1");
  const headerStyle = {
    fill: { fgColor: { rgb: "17365D" } },
    font: { bold: true, color: { rgb: "FFFFFF" } },
    alignment: { horizontal: "center", vertical: "center" },
  };
  const summaryHeaderStyle = {
    fill: { fgColor: { rgb: "FFFFFF" } },
    font: { bold: true, color: { rgb: "000000" } },
    alignment: { horizontal: "center", vertical: "center" },
  };
  const totalStyle = {
    fill: { fgColor: { rgb: "D9EAF7" } },
    font: { bold: true },
    numFmt: "#,##0.00;[Red]-#,##0.00",
  };
  const border = {
    top: { style: "thin", color: { rgb: "B7C9DC" } },
    bottom: { style: "thin", color: { rgb: "B7C9DC" } },
    left: { style: "thin", color: { rgb: "B7C9DC" } },
    right: { style: "thin", color: { rgb: "B7C9DC" } },
  };
  for (let row = summaryRange.s.r; row <= summaryRange.e.r; row += 1) {
    for (let column = summaryRange.s.c; column <= summaryRange.e.c; column += 1) {
      const cell = summarySheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (!cell) continue;
      if (row === 0) {
        cell.s = { ...summaryHeaderStyle, border };
      } else if (row === summaryRange.e.r) {
        cell.s = { ...totalStyle, border };
      } else if (column === 0) {
        cell.s = { font: { bold: true }, border };
      } else if (column === summaryRange.e.c) {
        cell.s = {
          font: { bold: true },
          numFmt: "#,##0.00;[Red]-#,##0.00",
          border,
        };
      } else {
        const hasValue = typeof cell.v === "number" && cell.v !== 0;
        const fill = hasValue
          ? companyPairFill(companies[row - 1].label, companies[column - 1].label)
          : null;
        cell.s = {
          ...(fill ? { fill: { fgColor: { rgb: fill } } } : {}),
          numFmt: "#,##0.00;[Red]-#,##0.00",
          border,
        };
      }
    }
  }
  summarySheet["!freeze"] = { xSplit: 1, ySplit: 1 };
  summarySheet["!autofilter"] = { ref: XLSX.utils.encode_range(summaryRange) };
  summarySheet["!cols"] = [{ wch: 18 }, ...companies.map(() => ({ wch: 15 })), { wch: 16 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Intercompany Summary");

  const differenceRows = buildIntercompanyTallyDifferences(report.lines).map((row) => ({
    "Receiving Company": row.receivingCompanyLabel,
    "Receiving Company Name": row.receivingCompany,
    "Supplier Company": row.supplierCompanyLabel,
    "Supplier Company Name": row.supplierCompany,
    "PR Linked PI Value": row.prLinkedPiValue,
    "SSR Return Value (PI / Material Issue)": row.ssrLinkedPiReturnValue,
    Difference: row.difference,
    Status: row.status,
  }));
  const differenceSheet = XLSX.utils.json_to_sheet(differenceRows, {
    header: [
      "Receiving Company",
      "Receiving Company Name",
      "Supplier Company",
      "Supplier Company Name",
      "PR Linked PI Value",
      "SSR Return Value (PI / Material Issue)",
      "Difference",
      "Status",
    ],
  });
  const differenceRange = XLSX.utils.decode_range(differenceSheet["!ref"] ?? "A1:H1");
  for (let column = differenceRange.s.c; column <= differenceRange.e.c; column += 1) {
    const header = differenceSheet[XLSX.utils.encode_cell({ r: 0, c: column })];
    if (header) header.s = { ...headerStyle, border };
    for (let row = 1; row <= differenceRange.e.r; row += 1) {
      const cell = differenceSheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (!cell) continue;
      const status = differenceSheet[XLSX.utils.encode_cell({ r: row, c: 7 })]?.v;
      const statusFill = status === "Matched" ? "C6EFCE" : "FFC7CE";
      cell.s = {
        border,
        ...(column >= 4 && column <= 6 ? { numFmt: "#,##0.00;[Red]-#,##0.00" } : {}),
        ...(column === 6 || column === 7
          ? { fill: { fgColor: { rgb: statusFill } }, font: { bold: true } }
          : {}),
      };
    }
  }
  differenceSheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  differenceSheet["!autofilter"] = { ref: XLSX.utils.encode_range(differenceRange) };
  differenceSheet["!cols"] = [
    { wch: 20 },
    { wch: 34 },
    { wch: 20 },
    { wch: 34 },
    { wch: 22 },
    { wch: 28 },
    { wch: 18 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(workbook, differenceSheet, "Tally Difference");

  const detailRows = report.lines.map((line) => ({
    Company: line.companyLabel,
    "Company Name": line.company,
    Counterparty: line.counterpartyLabel,
    "Counterparty Name": line.counterparty,
    Side: line.side,
    Status: line.status,
    "Source Document": line.purchaseInvoice,
    "PR / SSR": line.reference,
    "Posting Date": reportDate(line.postingDate),
    SKU: line.itemCode,
    "Item Name": line.itemName ?? "",
    Qty: line.qty,
    Rate: line.rate,
    Amount: line.amount,
  }));
  const detailSheet = XLSX.utils.json_to_sheet(detailRows, {
    header: [
      "Company",
      "Company Name",
      "Counterparty",
      "Counterparty Name",
      "Side",
      "Status",
      "Source Document",
      "PR / SSR",
      "Posting Date",
      "SKU",
      "Item Name",
      "Qty",
      "Rate",
      "Amount",
    ],
  });
  const detailRange = XLSX.utils.decode_range(detailSheet["!ref"] ?? "A1:N1");
  for (let column = detailRange.s.c; column <= detailRange.e.c; column += 1) {
    const header = detailSheet[XLSX.utils.encode_cell({ r: 0, c: column })];
    if (header) header.s = { ...headerStyle, border };
    for (let row = 1; row <= detailRange.e.r; row += 1) {
      const cell = detailSheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (!cell) continue;
      cell.s = {
        border,
        ...(column >= 11 ? { numFmt: column === 11 ? "#,##0.######" : "#,##0.00;[Red]-#,##0.00" } : {}),
      };
    }
  }
  detailSheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  detailSheet["!autofilter"] = { ref: XLSX.utils.encode_range(detailRange) };
  detailSheet["!cols"] = [
    { wch: 12 }, { wch: 34 }, { wch: 14 }, { wch: 34 }, { wch: 16 }, { wch: 14 },
    { wch: 18 }, { wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 42 }, { wch: 12 }, { wch: 14 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(workbook, detailSheet, "Tally Detail");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission("purchasing.grn.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const context = await getCurrentUserContext();
  const companyId = context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const from = parseDateParam(request.nextUrl.searchParams.get("from"));
  const to = parseDateParam(request.nextUrl.searchParams.get("to"), true);
  await Promise.all([autoMatchIntercompanyGrn(), autoMatchBackfillIntercompanyGrn()]);
  const [company, locations, liveReceipts, backfillReceipts, liveReturns, backfillReturns, liveInvoices, backfillInvoices, materialIssueLinks] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
    prisma.companyLocation.findMany({
      where: { companyId },
      select: {
        id: true,
        name: true,
        shortName: true,
        erpnextCompany: true,
        supplierPrefix: true,
        isMainCompany: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.grnPurchaseReceipt.findMany({
      where: { companyId, deletedAt: null },
      select: {
        name: true, companyLocationId: true, postingDate: true, creation: true, docstatus: true,
        status: true, amendedFrom: true, supplier: true, supplierName: true,
        supplierStockReturnName: true, rawPayload: true,
        companyLocation: { select: { erpnextCompany: true, name: true } },
        supplierStockReturnLinks: { select: { supplierStockReturn: { select: { name: true } } } },
      },
    }),
    prisma.grnBackfillPurchaseReceipt.findMany({
      where: { companyId, deletedAt: null },
      select: {
        name: true, companyLocationId: true, postingDate: true, creation: true, docstatus: true,
        status: true, amendedFrom: true, supplier: true, supplierName: true, rawPayload: true,
        companyLocation: { select: { erpnextCompany: true, name: true } },
        supplierStockReturnLinks: { select: { supplierStockReturn: { select: { name: true } } } },
      },
    }),
    prisma.grnSupplierStockReturn.findMany({
      where: { companyId, deletedAt: null },
      select: {
        name: true, returnDate: true, creation: true, docstatus: true, amendedFrom: true,
        supplier: true, supplierName: true, purchaseReceiptName: true, rawPayload: true,
        purchaseReceiptLinks: { select: { purchaseReceipt: { select: { name: true } } } },
        items: { select: { itemCode: true, qty: true } },
      },
    }),
    prisma.grnBackfillSupplierStockReturn.findMany({
      where: { companyId, deletedAt: null },
      select: {
        name: true, returnDate: true, creation: true, docstatus: true, amendedFrom: true,
        supplier: true, supplierName: true, purchaseReceiptName: true, rawPayload: true,
        purchaseReceiptLinks: { select: { purchaseReceipt: { select: { name: true } } } },
        items: { select: { itemCode: true, qty: true } },
      },
    }),
    prisma.grnPurchaseInvoice.findMany({
      where: { companyId, deletedAt: null, docstatus: { not: 2 } },
      select: {
        name: true, postingDate: true, docstatus: true, status: true, amendedFrom: true, isReturn: true,
        purchaseReceiptName: true, supplierStockReturnName: true, billNo: true,
        items: { select: { name: true, itemCode: true, itemName: true, qty: true, rate: true, amount: true, purchaseReceipt: true, supplierStockReturn: true } },
      },
    }),
    prisma.grnBackfillPurchaseInvoice.findMany({
      where: { companyId, deletedAt: null, docstatus: { not: 2 } },
      select: {
        name: true, postingDate: true, docstatus: true, status: true, amendedFrom: true, isReturn: true,
        purchaseReceiptName: true, supplierStockReturnName: true, billNo: true,
        items: { select: { name: true, itemCode: true, itemName: true, qty: true, rate: true, amount: true, purchaseReceipt: true, supplierStockReturn: true } },
      },
    }),
    prisma.grnSupplierStockReturnMaterialIssueLink.findMany({
      where: { companyId, materialIssue: { docstatus: { not: 2 } } },
      select: {
        supplierStockReturnName: true,
        materialIssue: {
          select: {
            name: true,
            postingDate: true,
            items: {
              select: {
                name: true,
                itemCode: true,
                itemName: true,
                qty: true,
                effectiveRate: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const companyResolver = buildGrnCompanyResolver(locations);
  const companyLabels = new Map(
    locations.flatMap((row) => {
      const label = companyResolver.label(row.name);
      return [
        [companyKey(row.erpnextCompany), label] as const,
        [companyKey(row.name), label] as const,
      ];
    }),
  );
  const fallbackCompanyName = company?.name ?? "Unknown company";
  const amendedPurchaseReceiptNames = new Set(
    [...liveReceipts, ...backfillReceipts]
      .map((row) => row.amendedFrom?.trim().toUpperCase())
      .filter((name): name is string => Boolean(name)),
  );
  const amendedStockReturnNames = new Set(
    [...liveReturns, ...backfillReturns]
      .map((row) => row.amendedFrom?.trim().toUpperCase())
      .filter((name): name is string => Boolean(name)),
  );
  const amendedInvoiceNames = new Set(
    [...liveInvoices, ...backfillInvoices]
      .map((row) => row.amendedFrom?.trim().toUpperCase())
      .filter((name): name is string => Boolean(name)),
  );
  const purchaseReceipts: IntercompanyPurchaseReceipt[] = [
    ...activeRows(liveReceipts, amendedPurchaseReceiptNames).map((row) => ({
      name: row.name,
      companyName: companyResolver.displayName({
        documentName: row.name,
        rawCompany: erpCompany(row.rawPayload) ?? row.companyLocation?.erpnextCompany,
        companyLocationId: row.companyLocationId,
        fallback: row.companyLocation?.name ?? fallbackCompanyName,
      }),
      counterpartyCompanyName:
        companyResolver.resolveSupplierLocation(row.supplier, row.supplierName)?.name ?? null,
      date: row.creation ?? row.postingDate,
      cancelled: false,
      linkedStockReturnNames: [
        row.supplierStockReturnName,
        ...row.supplierStockReturnLinks.map((link) => link.supplierStockReturn.name),
      ].filter((name): name is string => Boolean(name)),
    })),
    ...activeRows(backfillReceipts, amendedPurchaseReceiptNames).map((row) => ({
      name: row.name,
      companyName: companyResolver.displayName({
        documentName: row.name,
        rawCompany: erpCompany(row.rawPayload) ?? row.companyLocation?.erpnextCompany,
        companyLocationId: row.companyLocationId,
        fallback: row.companyLocation?.name ?? fallbackCompanyName,
      }),
      counterpartyCompanyName:
        companyResolver.resolveSupplierLocation(row.supplier, row.supplierName)?.name ?? null,
      date: row.creation ?? row.postingDate,
      cancelled: false,
      linkedStockReturnNames: row.supplierStockReturnLinks.map((link) => link.supplierStockReturn.name),
    })),
  ];
  const stockReturns: IntercompanyStockReturn[] = [
    ...activeRows(liveReturns, amendedStockReturnNames).map((row) => ({
      name: row.name,
      companyName: companyResolver.displayName({
        documentName: row.name,
        rawCompany: erpCompany(row.rawPayload),
        fallback: fallbackCompanyName,
      }),
      counterpartyCompanyName:
        companyResolver.resolveSupplierLocation(row.supplier, row.supplierName)?.name ?? null,
      date: row.returnDate ?? row.creation,
      cancelled: false,
      linkedPurchaseReceiptNames: [
        row.purchaseReceiptName,
        ...row.purchaseReceiptLinks.map((link) => link.purchaseReceipt.name),
      ].filter((name): name is string => Boolean(name)),
      items: row.items.map((item) => ({ itemCode: item.itemCode, qty: Number(item.qty) })),
    })),
    ...activeRows(backfillReturns, amendedStockReturnNames).map((row) => ({
      name: row.name,
      companyName: companyResolver.displayName({
        documentName: row.name,
        rawCompany: erpCompany(row.rawPayload),
        fallback: fallbackCompanyName,
      }),
      counterpartyCompanyName:
        companyResolver.resolveSupplierLocation(row.supplier, row.supplierName)?.name ?? null,
      date: row.returnDate ?? row.creation,
      cancelled: false,
      linkedPurchaseReceiptNames: [
        row.purchaseReceiptName,
        ...row.purchaseReceiptLinks.map((link) => link.purchaseReceipt.name),
      ].filter((name): name is string => Boolean(name)),
      items: row.items.map((item) => ({ itemCode: item.itemCode, qty: Number(item.qty) })),
    })),
  ];
  const invoices: IntercompanyInvoice[] = activeRows([...liveInvoices, ...backfillInvoices], amendedInvoiceNames).map((row) => ({
    name: row.name,
    postingDate: row.postingDate,
    isReturn: row.isReturn,
    purchaseReceiptName: row.purchaseReceiptName,
    supplierStockReturnName: row.supplierStockReturnName,
    billNo: row.billNo,
    items: row.items.map((item) => ({
      id: item.name,
      itemCode: item.itemCode,
      itemName: item.itemName,
      qty: Number(item.qty),
      rate: Number(item.rate),
      amount: Number(item.amount),
      purchaseReceipt: item.purchaseReceipt,
      supplierStockReturn: item.supplierStockReturn,
    })),
  }));

  const materialIssues: IntercompanyMaterialIssue[] = materialIssueLinks.map((link) => ({
    name: link.materialIssue.name,
    postingDate: link.materialIssue.postingDate,
    supplierStockReturnName: link.supplierStockReturnName,
    items: link.materialIssue.items.map((item) => ({
      id: item.name,
      itemCode: item.itemCode,
      itemName: item.itemName,
      qty: Number(item.qty),
      effectiveRate: item.effectiveRate == null ? null : Number(item.effectiveRate),
    })),
  }));

  const report = buildIntercompanyReport({ purchaseReceipts, stockReturns, invoices, materialIssues, companyLabels, from, to });
  const buffer = buildWorkbook(report);
  const stamp = `${request.nextUrl.searchParams.get("from") ?? filenameDate(new Date())}-to-${request.nextUrl.searchParams.get("to") ?? filenameDate(new Date())}`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="grn-intercompany-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
