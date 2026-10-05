import * as XLSX from "xlsx";

import type { CallQueueReportRow } from "@/lib/customer-insight/call-queue-report";
import { formatAppIsoDate } from "@/lib/format-datetime";

export function buildCallQueueSalesReportWorkbook(input: {
  rows: CallQueueReportRow[];
}): { buffer: Buffer; filename: string } {
  const emptyRow = {
    Merchant: "",
    Name: "",
    Phone: "",
    "Assigned date": "",
    Status: "",
    Category: "",
    "Loyalty stage": "",
    "Lifetime at assign": "",
    "Sales after assign": "",
    "Sales after contact": "",
    "First contact after assign": "",
  };

  const sheetRows =
    input.rows.length > 0
      ? input.rows.map((row) => ({
          Merchant: row.merchantLabel,
          Name: row.name,
          Phone: row.phoneNumber ?? "",
          "Assigned date": row.assignedAt,
          Status: row.status,
          Category: row.category ?? "",
          "Loyalty stage": row.loyaltyStage ?? "",
          "Lifetime at assign": row.lifetimeTotalAtAssign,
          "Sales after assign": row.salesAfterAssignment,
          "Sales after contact": row.salesAfterContact,
          "First contact after assign": row.firstContactAfterAssignAt ?? "",
        }))
      : [emptyRow];

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(sheetRows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Sales report");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const filename = `call-queue-sales-report-${formatAppIsoDate(new Date())}.xlsx`;
  return { buffer, filename };
}
