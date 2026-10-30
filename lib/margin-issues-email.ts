import * as XLSX from "xlsx-js-style";

import { builtinTemplateByKey, MARGIN_ISSUES_DAILY_KEY } from "@/lib/email-templates/catalog";
import { escapeEmailHtml, parseEmailAddressList, renderEmailTemplatePlaceholders } from "@/lib/email-templates/render";
import { formatAppDateTime, formatAppDateShort } from "@/lib/format-datetime";
import { sendErpSyncFailureAlertEmail } from "@/lib/maileroo";
import { prisma } from "@/lib/prisma";
import {
  discountSummaryText,
  loadMarginIssuesReport,
  ROP_FULFILLMENT_BANDS,
  type MarginIssueSummaryRow,
  type MarginIssuesReport,
  type RopFulfillmentSummaryRow,
} from "@/lib/margin-issues";

function discountHtml(row: MarginIssueSummaryRow): string {
  return escapeEmailHtml(discountSummaryText(row)).replace(/\n/g, "<br>");
}

const CELL_LINE_HEIGHT_POINTS = 15;
const CELL_PADDING_POINTS = 8;

function maxLineLength(value: string): number {
  return Math.max(1, ...value.split(/\r?\n/).map((line) => line.length));
}

function wrappedLineCount(value: string, charsPerLine: number): number {
  return value.split(/\r?\n/).reduce((total, line) => total + Math.max(1, Math.ceil(line.length / Math.max(1, charsPerLine))), 0);
}

function columnWidthLimit(header: string): number {
  if (header.includes("Discount")) return 72;
  if (header === "Brand List") return 52;
  if (header === "Brand" || header === "Item Name") return 36;
  if (header.includes("Price")) return 22;
  return 30;
}

function adaptiveColumnWidths(values: Record<string, unknown>[], headers: string[]): number[] {
  return headers.map((header) => {
    const longest = Math.max(header.length, ...values.map((value) => maxLineLength(String(value[header] ?? ""))));
    return Math.max(12, Math.min(columnWidthLimit(header), longest + 2));
  });
}

function adaptiveRowHeight(record: Record<string, unknown>, headers: string[], widths: number[]): number {
  const lines = Math.max(...headers.map((header, index) => wrappedLineCount(String(record[header] ?? ""), Math.max(8, widths[index]! - 5))));
  return Math.max(20, CELL_PADDING_POINTS + lines * CELL_LINE_HEIGHT_POINTS);
}

function summaryRowsHtml(report: MarginIssuesReport): string {
  const rowHtml = (row: MarginIssueSummaryRow, edge: "top" | "middle" | "bottom", discountRowSpan = 0) => {
    const border = row.isGroup
      ? "border-top:2px solid #88a86f;border-left:1px solid #88a86f;border-right:1px solid #88a86f;"
      : `border-left:1px solid #c8d3e1;border-right:1px solid #c8d3e1;${edge === "bottom" ? "border-bottom:2px solid #88a86f;" : ""}`;
    const discountCell = discountRowSpan > 0
      ? `<td rowspan="${discountRowSpan}" style="padding:7px;border-left:1px solid #88a86f;border-right:1px solid #88a86f;border-top:2px solid #88a86f;border-bottom:2px solid #88a86f;background:#d9ead3;font-size:11px;line-height:1.35;white-space:nowrap;vertical-align:middle;">${discountHtml(row)}</td>`
      : "";
    return `<tr style="${row.isGroup ? "background:#d9ead3;font-weight:700;" : "background:#f5f8fb;"}">
    <td style="padding:7px;border-top:1px solid #c8d3e1;${border}${row.isGroup ? "color:#17365d;" : "padding-left:24px;"}">${escapeEmailHtml(row.label)}</td>
    <td style="padding:7px;border-top:1px solid #c8d3e1;${border}text-align:right;">${row.numberOfSkus}</td>
    <td style="padding:7px;border-top:1px solid #c8d3e1;${border}text-align:right;background:#e2f0d9;">${row.stockAvailable.toLocaleString()}</td>
    <td style="padding:7px;border-top:1px solid #c8d3e1;${border}">${escapeEmailHtml(row.brands || "-")}</td>
    ${discountCell}
  </tr>`;
  };
  const groupedRows: string[] = [];
  for (let index = 0; index < report.summary.length; index += 1) {
    const group = report.summary[index];
    if (!group.isGroup) continue;
    const children = report.summary.filter((row) => !row.isGroup && row.groupKey === group.groupKey);
    groupedRows.push(`<tbody>${rowHtml(group, "top", children.length + 1)}${children.map((row, childIndex) => rowHtml(row, childIndex === children.length - 1 ? "bottom" : "middle")).join("")}</tbody>`);
  }
  const total = report.total;
  return `${groupedRows.join("")}<tbody><tr style="background:#e2f0d9;font-weight:700;">
    <td style="padding:7px;border:1px solid #9dbb89;">${escapeEmailHtml(total.label)}</td>
    <td style="padding:7px;border:1px solid #9dbb89;text-align:right;">${total.numberOfSkus}</td>
    <td style="padding:7px;border:1px solid #9dbb89;text-align:right;">${total.stockAvailable.toLocaleString()}</td>
    <td style="padding:7px;border:1px solid #9dbb89;">${escapeEmailHtml(total.brands || "-")}</td>
    <td style="padding:7px;border:1px solid #9dbb89;font-size:11px;line-height:1.35;white-space:nowrap;">${discountHtml(total)}</td>
  </tr></tbody>`;
}

function ropFulfillmentRowsHtml(report: MarginIssuesReport): string {
  const cell = (value: number, index: number, isTotal = false) => {
    const fill = isTotal ? "#e2f0d9" : ["#fce4d6", "#fff2cc", "#d9ead3", "#c6e0b4"][index];
    return `<td style="padding:7px;border:1px solid #b8c7d9;text-align:right;background:${fill};">${value.toLocaleString()}</td>`;
  };
  const rowHtml = (row: RopFulfillmentSummaryRow, isTotal = false) => `<tr style="${isTotal ? "background:#e2f0d9;font-weight:700;" : "background:#f5f8fb;"}">
    <td style="padding:7px;border:1px solid #b8c7d9;${isTotal ? "color:#17365d;" : "padding-left:24px;"}">${escapeEmailHtml(row.priority)}</td>
    ${ROP_FULFILLMENT_BANDS.map((band, index) => cell(row.counts[band.key], index, isTotal)).join("")}
  </tr>`;
  return `<h3 style="margin:24px 0 8px;padding:8px 12px;background:#4f6070;border-left:5px solid #4472c4;color:#d9e8ff;font-size:16px;">ROP Fulfillment</h3>
  <table style="border-collapse:collapse;width:100%;border:1px solid #b8c7d9;font-size:13px;">
    <thead><tr style="background:#17365d;color:#fff;">
      <th style="padding:8px;border:1px solid #b8c7d9;text-align:left;">Priority</th>
      ${ROP_FULFILLMENT_BANDS.map((band) => `<th style="padding:8px;border:1px solid #b8c7d9;">${escapeEmailHtml(band.label)}</th>`).join("")}
    </tr></thead>
    <tbody>${report.ropFulfillment.rows.map((row) => rowHtml(row)).join("")}${rowHtml(report.ropFulfillment.total, true)}</tbody>
  </table>`;
}

export function buildMarginIssuesEmailPreview(report: MarginIssuesReport): { summaryTableHtml: string; skuCount: number; stockAvailable: number } {
  const marginTableHtml = `<h3 style="margin:8px 0;background:#4f6070;border-left:5px solid #4472c4;padding:8px 12px;color:#d9e8ff;font-size:16px;">Margin Issues</h3>
  <table style="border-collapse:collapse;width:100%;border:1px solid #b8c7d9;font-size:13px;">
    <thead><tr style="background:#17365d;color:#fff;">
      <th style="padding:8px;border:1px solid #b8c7d9;text-align:left;">Margin</th>
      <th style="padding:8px;border:1px solid #b8c7d9;">Number of SKUs</th>
      <th style="padding:8px;border:1px solid #b8c7d9;">Stock Available</th>
      <th style="padding:8px;border:1px solid #b8c7d9;text-align:left;">Brand List</th>
      <th style="padding:8px;border:1px solid #b8c7d9;text-align:left;">Discount 5-25%</th>
    </tr></thead>${summaryRowsHtml(report)}</table>`;
  return { summaryTableHtml: `${marginTableHtml}${ropFulfillmentRowsHtml(report)}`, skuCount: report.details.length, stockAvailable: report.total.stockAvailable };
}

function styleSheet(sheet: XLSX.WorkSheet, values: Record<string, unknown>[], groupColumn = "Margin") {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  const headers = values.length ? Object.keys(values[0]!) : [];
  const headerStyle = { fill: { fgColor: { rgb: "17365D" } }, font: { bold: true, color: { rgb: "FFFFFF" } }, alignment: { horizontal: "center", vertical: "center", wrapText: true } };
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const header = sheet[XLSX.utils.encode_cell({ r: 0, c: column })];
    if (header) header.s = headerStyle;
  }
  for (let row = 1; row <= range.e.r; row += 1) {
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (!cell) continue;
      const header = headers[column] ?? "";
      cell.s = {
        font: { name: "Aptos", size: 10, color: { rgb: "1F2937" } },
        alignment: {
          vertical: "center",
          horizontal: ["Number of SKUs", "Stock Available", "Total ROP", "Margin %", "Latest Purchase Price", "Standard Selling Price"].includes(header) ? "right" : "left",
          wrapText: header === "Brand List" || header.includes("Discount") || header === "Brand",
          indent: ["Number of SKUs", "Stock Available", "Total ROP", "Margin %", "Latest Purchase Price", "Standard Selling Price"].includes(header) ? 0 : 1,
        },
        border: { bottom: { style: "hair", color: "D9E2F3" } },
      };
    }
  }
  const groupIndex = groupColumn === "Margin" ? headers.indexOf(groupColumn) : -1;
  if (groupIndex >= 0) {
    for (let row = 1; row <= range.e.r; row += 1) {
      const label = String(sheet[XLSX.utils.encode_cell({ r: row, c: groupIndex })]?.v ?? "");
      if (label && (label === "Grand Total" || !label.startsWith("  "))) {
        for (let column = range.s.c; column <= range.e.c; column += 1) {
          const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
          if (cell) cell.s = { ...(cell.s ?? {}), fill: { fgColor: { rgb: label === "Grand Total" ? "E2F0D9" : "D9EAD3" } }, font: { ...(cell.s?.font ?? {}), bold: true, color: { rgb: "17365D" } }, border: { ...(cell.s?.border ?? {}), top: { style: "medium", color: "88A86F" }, left: { style: "thin", color: "88A86F" }, right: { style: "thin", color: "88A86F" } } };
        }
      }
    }

    const groupStarts: number[] = [];
    for (let row = 1; row <= range.e.r; row += 1) {
      const label = String(sheet[XLSX.utils.encode_cell({ r: row, c: groupIndex })]?.v ?? "");
      if (label && (label === "Grand Total" || !label.startsWith("  "))) groupStarts.push(row);
    }
    for (const start of groupStarts) {
      let end = start;
      while (end + 1 <= range.e.r) {
        const nextLabel = String(sheet[XLSX.utils.encode_cell({ r: end + 1, c: groupIndex })]?.v ?? "");
        if (!nextLabel.startsWith("  ")) break;
        end += 1;
      }
      for (let row = start; row <= end; row += 1) {
        const childRow = row !== start;
        for (let column = range.s.c; column <= range.e.c; column += 1) {
          const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
          if (!cell) continue;
          cell.s = {
            ...(cell.s ?? {}),
            ...(childRow ? { fill: { fgColor: { rgb: "F5F8FB" } } } : {}),
            border: {
              ...(cell.s?.border ?? {}),
              left: { style: "thin", color: "88A86F" },
              right: { style: "thin", color: "88A86F" },
              ...(row === start ? { top: { style: "medium", color: "88A86F" } } : {}),
              ...(row === end ? { bottom: { style: "medium", color: "88A86F" } } : {}),
            },
          };
        }
      }
    }
  }
  sheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  const widths = adaptiveColumnWidths(values, headers);
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  if (groupColumn !== "Margin") {
    sheet["!rows"] = [{ hpt: 25 }, ...values.map((value) => ({ hpt: adaptiveRowHeight(value, headers, widths) }))];
  }
}

export function buildMarginIssuesWorkbook(report: MarginIssuesReport): Buffer {
  const book = XLSX.utils.book_new();
  const summaryValue = (row: MarginIssueSummaryRow) => ({
    Margin: row.label,
    "Number of SKUs": row.numberOfSkus,
    "Stock Available": row.stockAvailable,
    "Brand List": row.brands,
    "Discount 5-25%": discountSummaryText(row),
  });
  const summaryValues: Array<Record<string, unknown>> = report.summary.concat(report.total).map(summaryValue);
  const summarySheet = XLSX.utils.json_to_sheet(summaryValues);
  styleSheet(summarySheet, summaryValues);
  const summaryHeaders = Object.keys(summaryValues[0] ?? {});
  const summaryWidths = adaptiveColumnWidths(summaryValues, summaryHeaders);
  const summaryHeights = summaryValues.map((value, index) => {
    const record = index === summaryValues.length - 1 ? value : { ...value, "Discount 5-25%": "" };
    return adaptiveRowHeight(record, summaryHeaders, summaryWidths);
  });
  summarySheet["!rows"] = [{ hpt: 25 }, ...summaryHeights.map((hpt) => ({ hpt }))];
  for (let row = 1; row <= summaryValues.length; row += 1) {
    const cell = summarySheet[`E${row + 1}`];
    if (cell) {
      const label = String(summaryValues[row - 1]?.Margin ?? "");
      if (!label) continue;
      cell.s = {
        ...(cell.s ?? {}),
        alignment: { wrapText: true, vertical: "top" },
        fill: { fgColor: { rgb: label === "Grand Total" ? "E2F0D9" : label.startsWith("  ") ? "F5F8FB" : "D9EAD3" } },
        font: { ...(cell.s?.font ?? {}), bold: !label.startsWith("  "), color: { rgb: "17365D" } },
      };
    }
  }
  const summaryMerges: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }> = [];
  for (let summaryIndex = 0; summaryIndex < report.summary.length; summaryIndex += 1) {
    const group = report.summary[summaryIndex];
    if (!group.isGroup) continue;
    let endIndex = summaryIndex;
    while (endIndex + 1 < report.summary.length && report.summary[endIndex + 1]?.groupKey === group.groupKey && !report.summary[endIndex + 1]?.isGroup) {
      endIndex += 1;
    }
    const startRow = summaryIndex + 1;
    const endRow = endIndex + 1;
    if (endRow <= startRow) continue;
    const requiredHeight = CELL_PADDING_POINTS + wrappedLineCount(discountSummaryText(group), Math.max(8, summaryWidths[4]! - 5)) * CELL_LINE_HEIGHT_POINTS;
    const currentHeight = summaryHeights.slice(startRow - 1, endRow).reduce((sum, height) => sum + height, 0);
    if (requiredHeight > currentHeight) {
      const extraPerRow = (requiredHeight - currentHeight) / (endRow - startRow + 1);
      for (let row = startRow; row <= endRow; row += 1) {
        summaryHeights[row - 1] = (summaryHeights[row - 1] ?? 20) + extraPerRow;
      }
      summarySheet["!rows"] = [{ hpt: 25 }, ...summaryHeights.map((hpt) => ({ hpt }))];
    }
    for (let row = startRow; row <= endRow; row += 1) {
      const cell = summarySheet[`E${row + 1}`];
      if (!cell) continue;
      cell.s = {
        ...(cell.s ?? {}),
        fill: { fgColor: { rgb: "D9EAD3" } },
        font: { ...(cell.s?.font ?? {}), bold: true, color: { rgb: "17365D" } },
        alignment: { wrapText: true, vertical: "center", horizontal: "left", indent: 1 },
      };
    }
    summaryMerges.push({ s: { r: startRow, c: 4 }, e: { r: endRow, c: 4 } });
  }
  summarySheet["!merges"] = summaryMerges;
  for (let row = 1; row <= summaryValues.length; row += 1) {
    for (const column of [1, 2]) {
      const cell = summarySheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (cell) cell.z = "#,##0";
    }
  }
  XLSX.utils.book_append_sheet(book, summarySheet, "Margin Issues");

  const ropValues: Array<Record<string, unknown>> = report.ropFulfillment.rows.map((row) => ({
    Priority: row.priority,
    [ROP_FULFILLMENT_BANDS[0].label]: row.counts[ROP_FULFILLMENT_BANDS[0].key],
    [ROP_FULFILLMENT_BANDS[1].label]: row.counts[ROP_FULFILLMENT_BANDS[1].key],
    [ROP_FULFILLMENT_BANDS[2].label]: row.counts[ROP_FULFILLMENT_BANDS[2].key],
    [ROP_FULFILLMENT_BANDS[3].label]: row.counts[ROP_FULFILLMENT_BANDS[3].key],
  }));
  ropValues.push({
    Priority: report.ropFulfillment.total.priority,
    [ROP_FULFILLMENT_BANDS[0].label]: report.ropFulfillment.total.counts[ROP_FULFILLMENT_BANDS[0].key],
    [ROP_FULFILLMENT_BANDS[1].label]: report.ropFulfillment.total.counts[ROP_FULFILLMENT_BANDS[1].key],
    [ROP_FULFILLMENT_BANDS[2].label]: report.ropFulfillment.total.counts[ROP_FULFILLMENT_BANDS[2].key],
    [ROP_FULFILLMENT_BANDS[3].label]: report.ropFulfillment.total.counts[ROP_FULFILLMENT_BANDS[3].key],
  });
  const ropSheet = XLSX.utils.json_to_sheet(ropValues);
  styleSheet(ropSheet, ropValues, "");
  const ropHeaders = Object.keys(ropValues[0] ?? {});
  const ropRange = XLSX.utils.decode_range(ropSheet["!ref"] ?? "A1");
  const ropBandFills = ["FCE4D6", "FFF2CC", "D9EAD3", "C6E0B4"];
  for (let row = 1; row <= ropRange.e.r; row += 1) {
    const isTotal = row === ropRange.e.r;
    for (let column = 0; column <= ropRange.e.c; column += 1) {
      const cell = ropSheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (!cell) continue;
      const bandIndex = column - 1;
      const fill = isTotal ? "E2F0D9" : bandIndex >= 0 && bandIndex < ropBandFills.length ? ropBandFills[bandIndex] : "F5F8FB";
      cell.s = {
        ...(cell.s ?? {}),
        fill: { fgColor: { rgb: fill } },
        font: { ...(cell.s?.font ?? {}), bold: isTotal, color: { rgb: "17365D" } },
        alignment: { ...(cell.s?.alignment ?? {}), horizontal: column === 0 ? "left" : "right", vertical: "center" },
        border: { ...(cell.s?.border ?? {}), bottom: { style: isTotal ? "medium" : "hair", color: isTotal ? "88A86F" : "D9E2F3" } },
      };
      if (column > 0) cell.z = "#,##0";
    }
  }
  ropSheet["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(ropHeaders.length - 1)}${ropValues.length + 1}` };
  XLSX.utils.book_append_sheet(book, ropSheet, "ROP Fulfillment");

  const detailValues = report.details.map((row) => ({
    SKU: row.sku,
    Priority: row.priority,
    Brand: row.brand,
    "Margin Bucket": row.marginBucket,
    "Margin %": row.marginPct == null ? "" : row.marginPct / 100,
    "Latest Purchase Price": row.latestPurchasePrice,
    "Latest Purchase Date": row.latestPurchaseDate ?? "",
    "Standard Selling Price": row.standardSellingPrice ?? "",
    "Stock Available": row.stockAvailable,
    "Total ROP": row.totalRop,
    "Discount 0%": row.discountOutcomes[0] ?? "",
    "Discount 5%": row.discountOutcomes[5] ?? "",
    "Discount 10%": row.discountOutcomes[10] ?? "",
    "Discount 15%": row.discountOutcomes[15] ?? "",
    "Discount 20%": row.discountOutcomes[20] ?? "",
    "Discount 25%": row.discountOutcomes[25] ?? "",
  }));
  const detailSheet = XLSX.utils.json_to_sheet(detailValues);
  styleSheet(detailSheet, detailValues, "Margin Bucket");
  if (detailValues.length) {
    const marginColumn = Object.keys(detailValues[0]!).indexOf("Margin %");
    for (let row = 1; row <= detailValues.length; row += 1) detailSheet[XLSX.utils.encode_cell({ r: row, c: marginColumn })].z = "0.0%";
  }
  if (detailValues.length) {
    detailSheet["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(Object.keys(detailValues[0]!).length - 1)}${detailValues.length + 1}` };
    const detailHeaders = Object.keys(detailValues[0]!);
    for (let row = 1; row <= detailValues.length; row += 1) {
      const stripe = row % 2 === 0 ? "F7FAFC" : "FFFFFF";
      for (let column = 0; column < detailHeaders.length; column += 1) {
        const cell = detailSheet[XLSX.utils.encode_cell({ r: row, c: column })];
        if (cell) cell.s = { ...(cell.s ?? {}), fill: { fgColor: { rgb: stripe } } };
      }
      for (const header of ["Latest Purchase Price", "Standard Selling Price"]) {
        const column = detailHeaders.indexOf(header);
        if (column >= 0) detailSheet[XLSX.utils.encode_cell({ r: row, c: column })].z = "#,##0.00";
      }
      for (const header of ["Stock Available", "Total ROP"]) {
        const column = detailHeaders.indexOf(header);
        if (column >= 0) detailSheet[XLSX.utils.encode_cell({ r: row, c: column })].z = "#,##0";
      }

      const bucketColumn = detailHeaders.indexOf("Margin Bucket");
      if (bucketColumn >= 0) {
        const cell = detailSheet[XLSX.utils.encode_cell({ r: row, c: bucketColumn })];
        const bucket = String(cell?.v ?? "");
        const fill = bucket === "0-20" ? "FCE4D6" : bucket === "20-25" ? "FFF2CC" : bucket === "25-30" ? "FFF2CC" : bucket === "30-35" ? "E2F0D9" : bucket === "35-40" ? "D9EAD3" : bucket === "40-plus" ? "C6E0B4" : stripe;
        if (cell) cell.s = { ...(cell.s ?? {}), fill: { fgColor: { rgb: fill } }, font: { ...(cell.s?.font ?? {}), bold: true, color: { rgb: "17365D" } } };
      }

      for (const header of detailHeaders.filter((value) => value.startsWith("Discount "))) {
        const column = detailHeaders.indexOf(header);
        const cell = detailSheet[XLSX.utils.encode_cell({ r: row, c: column })];
        const outcome = String(cell?.v ?? "");
        const fill = outcome.startsWith("Loss") ? "F4CCCC" : outcome.startsWith("Break-even") ? "FFF2CC" : outcome.startsWith("Profit <5%") ? "FCE4D6" : outcome.startsWith("Profit 5-10%") ? "FFF2CC" : outcome.startsWith("Profit 10%+") ? "E2F0D9" : stripe;
        if (cell) cell.s = { ...(cell.s ?? {}), fill: { fgColor: { rgb: fill } }, alignment: { ...(cell.s?.alignment ?? {}), horizontal: "center", vertical: "center", wrapText: true } };
      }
    }
  }
  XLSX.utils.book_append_sheet(book, detailSheet, "SKU Details");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function runMarginIssuesDailyEmail(input: { companyId: string; reportDate: string; preview?: boolean }) {
  const company = await prisma.company.findUnique({ where: { id: input.companyId }, select: { id: true, name: true } });
  if (!company) return { status: "skipped_no_company" as const, companyId: input.companyId };
  const builtin = builtinTemplateByKey(MARGIN_ISSUES_DAILY_KEY)!;
  const stored = await prisma.emailTemplate.findUnique({ where: { companyId_key: { companyId: company.id, key: MARGIN_ISSUES_DAILY_KEY } } });
  const toEmails = parseEmailAddressList(stored?.recipients ?? builtin.recipients);
  if (toEmails.length === 0) return { status: "skipped_no_recipients" as const, companyId: company.id, companyName: company.name };

  const report = await loadMarginIssuesReport(company.id, input.reportDate);
  const preview = buildMarginIssuesEmailPreview(report);
  const vars = {
    companyName: company.name,
    reportDate: input.reportDate,
    generatedAt: formatAppDateTime(new Date()),
    summaryTableHtml: preview.summaryTableHtml,
    skuCount: String(preview.skuCount),
    stockAvailable: String(preview.stockAvailable),
  };
  const subject = renderEmailTemplatePlaceholders(stored?.subject || builtin.subject, vars);
  if (input.preview) return { status: "preview" as const, companyId: company.id, companyName: company.name, subject, skuCount: report.details.length };

  const xlsx = buildMarginIssuesWorkbook(report);
  const result = await sendErpSyncFailureAlertEmail({
    toEmails,
    ccEmails: parseEmailAddressList(stored?.ccRecipients ?? builtin.ccRecipients),
    subject,
    html: renderEmailTemplatePlaceholders(stored?.bodyHtml || builtin.bodyHtml, vars),
    plain: `Margin issues report for ${input.reportDate}: ${report.details.length} SKUs`,
    attachments: [{ fileName: `margin-issues-${formatAppDateShort(new Date(input.reportDate))}.xlsx`, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", contentBase64: xlsx.toString("base64") }],
  });
  if (!result.success) throw new Error(result.message ?? "Failed to send margin issues email");
  return { status: "sent" as const, companyId: company.id, companyName: company.name, subject, skuCount: report.details.length };
}
