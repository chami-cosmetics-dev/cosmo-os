"""Build the combined Adapt + Cosmo Dump 3 Excel workbook."""
from __future__ import annotations

import csv
import json
from pathlib import Path

import xlsxwriter

ROOT = Path(__file__).resolve().parents[1]
EXPORT_DIR = ROOT / "tmp" / "full-history-export"
SALES_CSV = EXPORT_DIR / "sales.csv"
INVOICES_CSV = EXPORT_DIR / "invoices.csv"
STATS_JSON = EXPORT_DIR / "stats.json"
OUT_XLSX = Path.home() / "Downloads" / "cosmo-full-sales-history-2019-to-2026-09-28.xlsx"

SALES_NUM_HEADERS = {
    "QUANTITY",
    "UNIT_PRICE",
    "UNIT_PRICE_TOTAL",
    "DISCOUNTED_PRICE",
    "AFTER_DISCOUNT_TOTAL",
    "GRAND_TOTAL",
    "POS_SALE",
}
INVOICE_INT_HEADERS = {"YEAR", "LINE_ITEMS", "POS_SALE"}
INVOICE_MONEY_HEADERS = {"INVOICE_TOTAL", "LINE_TOTAL"}
SALES_INT_HEADERS = {"QUANTITY", "POS_SALE"}

WIDTHS = {
    "INVOICE_NO": 16,
    "ERP_INVOICE_ID": 16,
    "SOURCE_NAME": 14,
    "MERCHANT_COUPON_CODE": 18,
    "COUPON_CODE": 16,
    "INVOICE_DATE": 14,
    "LOCATION_NAME": 22,
    "CUSTOMER_NAME": 24,
    "SKU": 16,
    "BARCODE": 16,
    "BRAND": 16,
    "PRODUCT_TITLE": 42,
    "MERCHANT_NAME": 20,
    "PAYMENT_GATEWAY": 18,
    "DATA_SOURCE": 16,
    "CATALOG_MATCH": 18,
    "YEAR": 10,
}


def to_number(value: str):
    text = (value or "").strip()
    if text == "":
        return None
    try:
        if "." in text:
            return float(text)
        return int(text)
    except ValueError:
        try:
            return float(text)
        except ValueError:
            return text


def count_data_rows(path: Path) -> int:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return max(sum(1 for _ in handle) - 1, 0)


def write_csv_sheet(workbook, worksheet, path: Path, money_headers: set[str], int_headers: set[str], formats):
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle)
        headers = next(reader)
        for col, header in enumerate(headers):
            worksheet.write(0, col, header, formats["header"])
            worksheet.set_column(col, col, WIDTHS.get(header, 14))
        worksheet.set_row(0, 22)
        money_cols = {i for i, header in enumerate(headers) if header in money_headers}
        int_cols = {i for i, header in enumerate(headers) if header in int_headers}
        row_num = 0
        for row in reader:
            row_num += 1
            for col, raw in enumerate(row):
                if col in money_cols or col in int_cols:
                    value = to_number(raw)
                    if value is None or value == "":
                        worksheet.write_blank(row_num, col, None, formats["text"])
                    elif col in money_cols:
                        worksheet.write_number(row_num, col, float(value), formats["money"])
                    else:
                        worksheet.write_number(row_num, col, float(value), formats["integer"])
                else:
                    worksheet.write_string(row_num, col, raw or "", formats["text"])
            if row_num % 50000 == 0:
                print(f"  wrote {row_num} rows to {worksheet.name}", flush=True)
    last_col = len(headers) - 1
    last_row = row_num
    worksheet.freeze_panes(1, 0)
    if last_row >= 1:
        worksheet.autofilter(0, 0, last_row, last_col)
    return last_row + 1


def build_summary(workbook, worksheet, formats):
    worksheet.merge_range("A1:F1", "Cosmetics.lk full sales history", formats["title"])
    worksheet.merge_range(
        "A2:F2",
        "Product line items from Adapt history and Cosmo OS Dump 3. Hidden Invoices sheet has one row per invoice for unique counts.",
        formats["text"],
    )
    headers = ["YEAR", "SOURCE", "INVOICES", "LINE_ITEMS", "LINE_VALUE_LKR", "INVOICE_TOTAL_LKR"]
    for col, header in enumerate(headers):
        worksheet.write(3, col, header, formats["header"])
        worksheet.set_column(col, col, [12, 16, 14, 14, 18, 20][col])
    worksheet.set_row(3, 22)

    years = list(range(2019, 2027))
    sources = ["Adapt history", "Cosmo OS"]
    row = 4
    adapt_rows = []
    cosmo_rows = []
    for year in years:
        year_start = row
        for source in sources:
            excel_row = row + 1
            worksheet.write_number(row, 0, year, formats["integer"])
            worksheet.write_string(row, 1, source, formats["text"])
            worksheet.write_formula(
                row, 2, f'=COUNTIFS(Invoices!$A:$A,$B{excel_row},Invoices!$B:$B,$A{excel_row})', formats["integer_formula"]
            )
            worksheet.write_formula(
                row, 3, f'=SUMIFS(Invoices!$G:$G,Invoices!$A:$A,$B{excel_row},Invoices!$B:$B,$A{excel_row})', formats["integer_formula"]
            )
            worksheet.write_formula(
                row, 4, f'=SUMIFS(Invoices!$F:$F,Invoices!$A:$A,$B{excel_row},Invoices!$B:$B,$A{excel_row})', formats["money_formula"]
            )
            worksheet.write_formula(
                row, 5, f'=SUMIFS(Invoices!$E:$E,Invoices!$A:$A,$B{excel_row},Invoices!$B:$B,$A{excel_row})', formats["money_formula"]
            )
            if source == "Adapt history":
                adapt_rows.append(excel_row)
            else:
                cosmo_rows.append(excel_row)
            row += 1
        excel_row = row + 1
        worksheet.write_number(row, 0, year, formats["bold_int"])
        worksheet.write_string(row, 1, "Total", formats["bold"])
        worksheet.write_formula(row, 2, f"=C{year_start + 1}+C{year_start + 2}", formats["bold_int"])
        worksheet.write_formula(row, 3, f"=D{year_start + 1}+D{year_start + 2}", formats["bold_int"])
        worksheet.write_formula(row, 4, f"=E{year_start + 1}+E{year_start + 2}", formats["bold_money"])
        worksheet.write_formula(row, 5, f"=F{year_start + 1}+F{year_start + 2}", formats["bold_money"])
        row += 1

    excel_row = row + 1
    worksheet.write_string(row, 0, "All years", formats["yellow_bold"])
    worksheet.write_string(row, 1, "Adapt history", formats["yellow_bold"])
    worksheet.write_formula(row, 2, "=" + "+".join(f"C{r}" for r in adapt_rows), formats["yellow_int"])
    worksheet.write_formula(row, 3, "=" + "+".join(f"D{r}" for r in adapt_rows), formats["yellow_int"])
    worksheet.write_formula(row, 4, "=" + "+".join(f"E{r}" for r in adapt_rows), formats["yellow_money"])
    worksheet.write_formula(row, 5, "=" + "+".join(f"F{r}" for r in adapt_rows), formats["yellow_money"])
    adapt_total = excel_row
    row += 1

    excel_row = row + 1
    worksheet.write_string(row, 0, "All years", formats["yellow_bold"])
    worksheet.write_string(row, 1, "Cosmo OS", formats["yellow_bold"])
    worksheet.write_formula(row, 2, "=" + "+".join(f"C{r}" for r in cosmo_rows), formats["yellow_int"])
    worksheet.write_formula(row, 3, "=" + "+".join(f"D{r}" for r in cosmo_rows), formats["yellow_int"])
    worksheet.write_formula(row, 4, "=" + "+".join(f"E{r}" for r in cosmo_rows), formats["yellow_money"])
    worksheet.write_formula(row, 5, "=" + "+".join(f"F{r}" for r in cosmo_rows), formats["yellow_money"])
    cosmo_total = excel_row
    row += 1

    worksheet.write_string(row, 0, "All years", formats["total_text"])
    worksheet.write_string(row, 1, "Total", formats["total_text"])
    worksheet.write_formula(row, 2, f"=C{adapt_total}+C{cosmo_total}", formats["total_int"])
    worksheet.write_formula(row, 3, f"=D{adapt_total}+D{cosmo_total}", formats["total_int"])
    worksheet.write_formula(row, 4, f"=E{adapt_total}+E{cosmo_total}", formats["total_money"])
    worksheet.write_formula(row, 5, f"=F{adapt_total}+F{cosmo_total}", formats["total_money"])
    row += 2
    worksheet.merge_range(
        row,
        0,
        row + 1,
        5,
        "LINE_VALUE_LKR sums product line totals (AFTER_DISCOUNT_TOTAL). "
        "INVOICE_TOTAL_LKR sums Adapt ttlAmount / Cosmo order totalPrice once per invoice. "
        "They differ because shipping, coupon, fee lines and invoice-level adjustments are not product rows.",
        formats["wrap"],
    )
    worksheet.freeze_panes(4, 0)
    worksheet.hide_gridlines(2)


def build_notes(worksheet, stats: dict, formats):
    lines = [
        "Notes",
        "",
        "Workbook matches Dump 3 invoice item-wise columns (utility download, no CUSTOMER_EMAIL / CUSTOMER_PHONE), plus DATA_SOURCE and CATALOG_MATCH.",
        "One row per product line item. Dates are YYYY-MM-DD in Asia/Colombo.",
        "",
        "Adapt history",
        f"- Invoices read: {stats.get('adapt_invoices_read')}",
        f"- Product lines: {stats.get('adapt_product_lines')}",
        f"- Coupon lines excluded from rows, used for MERCHANT_COUPON_CODE: {stats.get('adapt_coupon_lines')}",
        f"- Shipping lines excluded; Store Pick - Up sets POS_SALE=1: {stats.get('adapt_shipping_lines')}",
        f"- Fee / promotion lines excluded: {stats.get('adapt_fee_lines')}",
        f"- Catalog exact SKU match: {stats.get('adapt_catalog_exact')}",
        f"- Catalog *OI mapped to _1 variant (spot-check before trusting barcode/brand): {stats.get('adapt_catalog_oi')}",
        f"- No catalog match: {stats.get('adapt_catalog_none')}",
        "- SOURCE_NAME is adapt. STATUS=Completed and PAYMENT_STATUS=paid are assumptions (finished invoices only were imported).",
        "- DISCOUNTED_PRICE and AFTER_DISCOUNT_TOTAL equal unit price and line total; Adapt prices already include discount on ~98% of invoices.",
        "- Blank for Adapt: ERP_INVOICE_ID, COUPON_CODE, FULFILLMENT_STATUS, KOKO_REF_NUMBER, CREATED_BY, DELIVERED_BY, DELIVERY_COMPLETED_DATE.",
        "- GRAND_TOTAL is the Adapt invoice total (repeated on each product line of that invoice).",
        "",
        "Cosmo OS",
        f"- Orders read: {stats.get('cosmo_orders_read')}",
        f"- Line items: {stats.get('cosmo_product_lines')}",
        "- Rows use the same Dump 3 invoice-item mapping as /api/admin/reports/orders?report=invoice-item, including ERP lookups for ERPNext pricing and missing coupons.",
        "- Cancelled / voided orders are included, same as Dump 3. Filter STATUS to exclude them.",
        "- Nothing was written back to production. Dump shipping/coupon persist paths were not used.",
        "",
        "Overlap: Adapt runs 2019-08-08 through 2026-07-01. Cosmo OS starts 2026-06-17. Both sources are kept; use DATA_SOURCE to split.",
    ]
    worksheet.set_column(0, 0, 140)
    for idx, line in enumerate(lines):
        fmt = formats["title"] if idx == 0 else formats["wrap"]
        worksheet.write_string(idx, 0, line, fmt)
    worksheet.set_row(0, 22)


def make_formats(workbook):
    font = {"font_name": "Arial", "font_size": 10}
    return {
        "text": workbook.add_format({**font}),
        "wrap": workbook.add_format({**font, "text_wrap": True, "valign": "top"}),
        "title": workbook.add_format({**font, "bold": True, "font_size": 14}),
        "header": workbook.add_format({**font, "bold": True, "font_color": "white", "bg_color": "#1F4E79", "align": "center", "valign": "vcenter", "text_wrap": True, "border": 1}),
        "money": workbook.add_format({**font, "num_format": '#,##0.00;(#,##0.00);"-"'}),
        "integer": workbook.add_format({**font, "num_format": '#,##0;(#,##0);"-"'}),
        "integer_formula": workbook.add_format({**font, "font_color": "#008000", "num_format": '#,##0;(#,##0);"-"'}),
        "money_formula": workbook.add_format({**font, "font_color": "#008000", "num_format": '#,##0.00;(#,##0.00);"-"'}),
        "bold": workbook.add_format({**font, "bold": True, "bg_color": "#D6EAF8"}),
        "bold_int": workbook.add_format({**font, "bold": True, "bg_color": "#D6EAF8", "num_format": '#,##0;(#,##0);"-"'}),
        "bold_money": workbook.add_format({**font, "bold": True, "bg_color": "#D6EAF8", "num_format": '#,##0.00;(#,##0.00);"-"'}),
        "yellow_bold": workbook.add_format({**font, "bold": True, "bg_color": "#FFF2CC"}),
        "yellow_int": workbook.add_format({**font, "bold": True, "bg_color": "#FFF2CC", "num_format": '#,##0;(#,##0);"-"'}),
        "yellow_money": workbook.add_format({**font, "bold": True, "bg_color": "#FFF2CC", "num_format": '#,##0.00;(#,##0.00);"-"'}),
        "total_text": workbook.add_format({**font, "bold": True, "font_color": "white", "bg_color": "#1F4E79"}),
        "total_int": workbook.add_format({**font, "bold": True, "font_color": "white", "bg_color": "#1F4E79", "num_format": '#,##0;(#,##0);"-"'}),
        "total_money": workbook.add_format({**font, "bold": True, "font_color": "white", "bg_color": "#1F4E79", "num_format": '#,##0.00;(#,##0.00);"-"'}),
    }


def main():
    if not SALES_CSV.exists() or not INVOICES_CSV.exists():
        raise SystemExit(f"Missing CSV export in {EXPORT_DIR}")
    stats = json.loads(STATS_JSON.read_text(encoding="utf-8")) if STATS_JSON.exists() else {}
    OUT_XLSX.parent.mkdir(parents=True, exist_ok=True)
    print(f"Building {OUT_XLSX}", flush=True)
    workbook = xlsxwriter.Workbook(str(OUT_XLSX), {"constant_memory": False, "strings_to_urls": False})
    formats = make_formats(workbook)

    ws_summary = workbook.add_worksheet("Summary")
    build_summary(workbook, ws_summary, formats)

    ws_sales = workbook.add_worksheet("Sales lines")
    print("Writing Sales lines", flush=True)
    write_csv_sheet(workbook, ws_sales, SALES_CSV, SALES_NUM_HEADERS - SALES_INT_HEADERS, SALES_INT_HEADERS, formats)

    ws_notes = workbook.add_worksheet("Notes")
    build_notes(ws_notes, stats, formats)

    ws_invoices = workbook.add_worksheet("Invoices")
    print("Writing Invoices", flush=True)
    write_csv_sheet(workbook, ws_invoices, INVOICES_CSV, INVOICE_MONEY_HEADERS, INVOICE_INT_HEADERS, formats)
    ws_invoices.hide()

    workbook.close()
    print("Done", flush=True)


if __name__ == "__main__":
    main()
