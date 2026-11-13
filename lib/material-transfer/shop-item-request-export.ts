import * as XLSX from "xlsx";

import { formatAppDateTime } from "@/lib/format-datetime";
import { MAIN_COLUMNS, type ShopRequestView } from "@/lib/material-transfer/shop-item-request";

export const SHOP_REQUEST_EXPORT_HEADERS = [
  "Request ID",
  "Status",
  "Outlet",
  "Created by",
  "Created at",
  "Done by",
  "Done at",
  "Item code",
  "Item name",
  "Barcode",
  "Needed qty",
  "Shop availability",
  ...MAIN_COLUMNS.map((column) => column.label),
] as const;

function availabilityLabel(value: ShopRequestView["lines"][number]["shopAvailability"]) {
  if (value === "allowed") return "Allowed";
  if (value === "not_allowed") return "Not allowed";
  return "";
}

function stockCellText(stock: ShopRequestView["lines"][number]["stocks"][number] | undefined) {
  if (!stock) return "";
  if (stock.qty == null) return "Unknown";
  return stock.cannotTransfer ? `${stock.qty} (cannot transfer)` : String(stock.qty);
}

export function shopRequestExportRows(requests: ShopRequestView[]): Array<Record<string, string | number>> {
  const rows: Array<Record<string, string | number>> = [];
  for (const request of requests) {
    for (const line of request.lines) {
      const stockByKey = new Map(line.stocks.map((stock) => [stock.key, stock]));
      const row: Record<string, string | number> = {
        "Request ID": request.id,
        Status: request.status,
        Outlet: request.outletName,
        "Created by": request.createdByName ?? "",
        "Created at": formatAppDateTime(request.createdAt, ""),
        "Done by": request.doneByName ?? "",
        "Done at": formatAppDateTime(request.doneAt, ""),
        "Item code": line.itemCode,
        "Item name": line.itemName,
        Barcode: line.barcode,
        "Needed qty": line.neededQty,
        "Shop availability": availabilityLabel(line.shopAvailability),
      };
      for (const column of MAIN_COLUMNS) {
        row[column.label] = stockCellText(stockByKey.get(column.key));
      }
      rows.push(row);
    }
  }
  return rows;
}

export function buildShopRequestWorkbook(requests: ShopRequestView[]): Buffer {
  const sheetRows = shopRequestExportRows(requests);
  const workbook = XLSX.utils.book_new();
  const sheet =
    sheetRows.length > 0
      ? XLSX.utils.json_to_sheet(sheetRows, { header: [...SHOP_REQUEST_EXPORT_HEADERS] })
      : XLSX.utils.aoa_to_sheet([[...SHOP_REQUEST_EXPORT_HEADERS]]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Shop requests");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
