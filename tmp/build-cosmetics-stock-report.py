"""Rebuild Cosmetics ERP1+ERP2 whole-company stock report from MCP dumps."""
from __future__ import annotations

import json
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

AGENT = Path(r"C:\Users\Bad-Boy\.cursor\projects\c-dev-cosmo-os\agent-tools")
OUT = Path(r"c:\dev\cosmo-os\tmp\cosmetics-erp1-erp2-item-stock-report.xlsx")

ITEM_FILES = {
    "erp1": [
        "50959d7c-58f2-46cc-9cf3-48a76c9c078a.txt",
        "e0215ac7-e180-40da-ab2b-24133fdef5aa.txt",
        "1be689a8-1b75-45ef-85b3-55682162c5eb.txt",
    ],
    "erp2": [
        "9c5d7e9a-efe8-4761-890f-8a9e048a6bac.txt",
        "0491feca-df27-47ba-a3a1-7f7c8e4fd515.txt",
        "6afbe834-0a5f-4ac1-b874-1053c70d1e0b.txt",
    ],
}
ERP1_STOCK = "c0f1c10b-7aa0-4ebd-801b-01b8f48b4a65.txt"
ERP2_BINS = [
    "7dc58849-3c1b-4d63-bd99-83cb14fd2f5f.txt",
    "c1d6be09-1b83-4ced-a0c5-b0ada539d236.txt",
]
ERP1_SLE = [
    "d6648734-83de-40ae-bac1-5eb621c8a6e0.txt",
    "5037de43-020c-484c-a1ee-14bf268efd42.txt",
]
ERP2_SLE = [
    "1d88aba5-9345-4aa7-a3e5-48881bdbae54.txt",
    "835d74a4-c162-4fd4-a702-8a022bd817d2.txt",
    "f0baeeff-b650-4880-9f1b-14d7f61dada0.txt",
    "e0a3c9ee-f508-4d2c-891b-f8d3d2e0d312.txt",
    "ce40a0da-bbb0-4a36-b55a-7f5d824ce1ce.txt",
    "5daad0bb-853a-4df8-9d8a-54e52c5b8a1b.txt",
]

MONTHS = [
    ("2026-08", "aug", "Aug Sale", "Aug 2026"),
    ("2026-09", "sep", "Sep Sale", "Sep 2026"),
    ("2026-10", "oct", "Oct Sale", "Oct 2026"),
]

WAREHOUSE_COMPANY = {
    "Finished Goods - CCON": "Cosmetics Consolidated",
    "Goods In Transit - CCON": "Cosmetics Consolidated",
    "Stores - CCON": "Cosmetics Consolidated",
    "Work In Progress - CCON": "Cosmetics Consolidated",
    "Main Warehouse - AJS": "AJS Trading Lanka (Pvt) Ltd",
    "Shop Warehouse - AJS": "AJS Trading Lanka (Pvt) Ltd",
    "Main Warehouse - Chami": "Chami Trading Lanka (Pvt) Ltd",
    "Shop Warehouse - Chami": "Chami Trading Lanka (Pvt) Ltd",
    "Main Warehouse - DRO": "DRO Trading (Pvt) Ltd",
    "Shop Warehouse - DRO": "DRO Trading (Pvt) Ltd",
    "Main Warehouse - DTD": "DTD Trading (Pvt) Ltd",
    "Shop Warehouse - DTD": "DTD Trading (Pvt) Ltd",
    "Main Warehouse - KAD": "KAD Trading (Pvt) Ltd",
    "Main Warehouse - LMJ": "LMJ International Lanka (Pvt) Ltd",
    "Shop Warehouse - LMJ": "LMJ International Lanka (Pvt) Ltd",
    "Main Warehouse - LWK": "LWK Enterprises (Pvt) Ltd",
    "Shop Warehouse - LWK": "LWK Enterprises (Pvt) Ltd",
    "Main Warehouse - MNK": "MNK Trading Lanka (Pvt) Ltd",
    "Shop Warehouse - MNK": "MNK Trading Lanka (Pvt) Ltd",
    "Main Warehouses - Pevi": "Pevi Trading Lanka (Pvt) Ltd",
    "Main Warehouse - SPK": "SPK Trading (Pvt) Ltd",
    "Main Warehouse - Udara": "Udara Trading Lanka (Pvt) Ltd",
    "Main Warehouse - USP": "USP Trading (Pvt) Ltd",
}

COMPANY_COLS = [
    ("Cosmetics.lk", "Cosmetics.lk"),
    ("AJS Trading Lanka (Pvt) Ltd", "AJS"),
    ("Chami Trading Lanka (Pvt) Ltd", "Chami"),
    ("DRO Trading (Pvt) Ltd", "DRO"),
    ("DTD Trading (Pvt) Ltd", "DTD"),
    ("KAD Trading (Pvt) Ltd", "KAD"),
    ("LMJ International Lanka (Pvt) Ltd", "LMJ"),
    ("LWK Enterprises (Pvt) Ltd", "LWK"),
    ("MNK Trading Lanka (Pvt) Ltd", "MNK"),
    ("Pevi Trading Lanka (Pvt) Ltd", "Pevi"),
    ("SPK Trading (Pvt) Ltd", "SPK"),
    ("Udara Trading Lanka (Pvt) Ltd", "Udara"),
    ("USP Trading (Pvt) Ltd", "USP"),
    ("Cosmetics Consolidated", "CCON"),
]


def load_json(path: Path):
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict) and "message" in data:
        msg = data["message"]
        if isinstance(msg, dict) and "result" in msg:
            return msg["result"]
        return msg
    return data


def num(value) -> float:
    try:
        n = float(value or 0)
    except (TypeError, ValueError):
        return 0.0
    return n if n == n else 0.0


def common_sku(sku: str) -> str:
    stem, sep, tail = sku.rpartition("_")
    if sep and tail.isdigit() and stem.strip():
        return stem.strip()
    return sku.strip()


def merge_text(a, b) -> str:
    a = (a or "").strip()
    b = (b or "").strip()
    if a and b and a.lower() != b.lower():
        return f"{a} / {b}"
    return a or b


def pick_positive(erp1: float, erp2: float) -> float:
    if erp1 > 0:
        return erp1
    return erp2 if erp2 > 0 else 0.0


def load_items(files: list[str]) -> dict[str, dict]:
    by_sku: dict[str, dict] = {}
    for name in files:
        for row in load_json(AGENT / name):
            sku = (row.get("item_code") or "").strip()
            if sku:
                by_sku[sku] = row
    return by_sku


def max_month_label(sales: dict[str, float]) -> tuple[float, str]:
    pairs = [(label, sales.get(key, 0.0)) for _mk, key, _hdr, label in MONTHS]
    peak = max(qty for _label, qty in pairs)
    if peak <= 0:
        return 0.0, ""
    return peak, " / ".join(label for label, qty in pairs if qty == peak)


def main() -> None:
    erp1_items = load_items(ITEM_FILES["erp1"])
    erp2_items = load_items(ITEM_FILES["erp2"])
    print(f"ERP1 items: {len(erp1_items)}, ERP2 items: {len(erp2_items)}")

    stock: dict[str, dict[str, float]] = {}

    def add_qty(sku: str, company: str, qty: float) -> None:
        if not sku or not company:
            return
        bucket = stock.setdefault(sku, {})
        bucket[company] = bucket.get(company, 0.0) + qty

    for row in load_json(AGENT / ERP1_STOCK):
        if not isinstance(row, dict):
            continue
        sku = (row.get("item_code") or "").strip()
        if not sku:
            continue
        add_qty(sku, "Cosmetics.lk", num(row.get("bal_qty")))

    unknown: set[str] = set()
    bin_rows = 0
    for name in ERP2_BINS:
        for row in load_json(AGENT / name):
            bin_rows += 1
            sku = (row.get("item_code") or "").strip()
            warehouse = (row.get("warehouse") or "").strip()
            company = WAREHOUSE_COMPANY.get(warehouse)
            if not company:
                unknown.add(warehouse)
                continue
            add_qty(sku, company, num(row.get("actual_qty")))
    print(f"ERP2 bin rows: {bin_rows}")
    if unknown:
        print("Unknown warehouses:", sorted(unknown))

    sales: dict[str, dict[str, float]] = {}
    sle_rows = 0
    for name in ERP1_SLE + ERP2_SLE:
        for row in load_json(AGENT / name):
            sle_rows += 1
            sku = (row.get("item_code") or "").strip()
            month = (row.get("posting_date") or "")[:7]
            key = next((k for mk, k, _h, _l in MONTHS if mk == month), None)
            if not sku or not key:
                continue
            bucket = sales.setdefault(sku, {})
            bucket[key] = bucket.get(key, 0.0) + (-num(row.get("actual_qty")))
    print(f"SLE rows: {sle_rows}, SKUs with sales: {len(sales)}")

    all_skus = sorted(set(erp1_items) | set(erp2_items) | set(stock) | set(sales), key=str.upper)
    print(f"Unique SKUs: {len(all_skus)}")

    wb = Workbook()
    ws = wb.active
    ws.title = "Whole Company"
    headers = [
        "Common SKU",
        "Variant SKU",
        "Description",
        "Priority",
        "VAT Status",
        "Standard Price",
        "Latest Purchased Price",
        "Total Qty",
        *[header for _mk, _k, header, _label in MONTHS],
        "Max Sale (3mo)",
        "Month of Max Sale",
        "Months Cover",
        "Days Cover",
        "Total Amount",
        "In ERP1",
        "In ERP2",
    ]

    header_font = Font(name="Arial", bold=True, color="FFFFFF", size=10)
    header_fill = PatternFill("solid", fgColor="2F5496")
    body_font = Font(name="Arial", size=10)
    thin = Border(
        left=Side(style="thin", color="D9D9D9"),
        right=Side(style="thin", color="D9D9D9"),
        top=Side(style="thin", color="D9D9D9"),
        bottom=Side(style="thin", color="D9D9D9"),
    )
    money_fmt = "#,##0.00"
    qty_fmt = "#,##0.###"
    cover_fmt = "0.00"

    def style_header(sheet, hdrs: list[str]) -> None:
        for col, header in enumerate(hdrs, 1):
            cell = sheet.cell(1, col, header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(wrap_text=True, horizontal="center", vertical="center")
            cell.border = thin
        sheet.row_dimensions[1].height = 32
        sheet.freeze_panes = "C2"
        sheet.auto_filter.ref = f"A1:{get_column_letter(len(hdrs))}1"

    def identity(sku: str) -> tuple[str, str, str, float, float, bool, bool]:
        item1 = erp1_items.get(sku)
        item2 = erp2_items.get(sku)
        source = item1 or item2 or {}
        if item1 and item2:
            desc = item1.get("item_name") or item2.get("item_name") or ""
        else:
            desc = source.get("item_name") or ""
        return (
            desc,
            merge_text(
                (item1 or {}).get("custom_product_priority"),
                (item2 or {}).get("custom_product_priority"),
            ),
            merge_text(
                (item1 or {}).get("custom_tax_status"),
                (item2 or {}).get("custom_tax_status"),
            ),
            pick_positive(num((item1 or {}).get("standard_rate")), num((item2 or {}).get("standard_rate"))),
            pick_positive(
                num((item1 or {}).get("last_purchase_rate")),
                num((item2 or {}).get("last_purchase_rate")),
            ),
            item1 is not None,
            item2 is not None,
        )

    style_header(ws, headers)
    # H total qty, I-K months, L max, M month name, N months cover, O days, P amount
    for index, sku in enumerate(all_skus):
        row = index + 2
        desc, priority, vat, standard, purchase, in1, in2 = identity(sku)
        total_qty = sum(stock.get(sku, {}).get(company, 0.0) for company, _label in COMPANY_COLS)
        month_qty = {key: float(sales.get(sku, {}).get(key, 0.0)) for _mk, key, _h, _l in MONTHS}
        peak, peak_month = max_month_label(month_qty)
        values = [
            common_sku(sku),
            sku,
            desc,
            priority,
            vat,
            standard,
            purchase,
            total_qty,
            *[month_qty[key] for _mk, key, _h, _l in MONTHS],
            peak,
            peak_month,
            None,
            None,
            None,
            "Yes" if in1 else "No",
            "Yes" if in2 else "No",
        ]
        for col, value in enumerate(values, 1):
            cell = ws.cell(row, col, value)
            cell.font = body_font
            cell.border = thin
            if col in (6, 7, 16):
                cell.number_format = money_fmt
            elif col in (8, 9, 10, 11, 12):
                cell.number_format = qty_fmt
            elif col in (14, 15):
                cell.number_format = cover_fmt
        ws.cell(row, 14, f'=IF(L{row}=0,"",H{row}/L{row})')
        ws.cell(row, 15, f'=IF(L{row}=0,"",H{row}*30/L{row})')
        ws.cell(row, 16, f"=G{row}*H{row}")
        for col in (14, 15, 16):
            ws.cell(row, col).font = body_font
            ws.cell(row, col).border = thin
        ws.cell(row, 14).number_format = cover_fmt
        ws.cell(row, 15).number_format = cover_fmt
        ws.cell(row, 16).number_format = money_fmt

    detail = wb.create_sheet("By Company")
    detail_headers = [
        "Common SKU",
        "Variant SKU",
        "Description",
        "Priority",
        "VAT Status",
        "Standard Price",
        "Latest Purchased Price",
        *[label for _company, label in COMPANY_COLS],
        "Total Qty",
        "Max Sale (3mo)",
        "Month of Max Sale",
        "Months Cover",
        "Days Cover",
        "Total Amount",
    ]
    style_header(detail, detail_headers)
    first_co = 8
    company_count = len(COMPANY_COLS)
    total_qty_col = first_co + company_count
    max_col = total_qty_col + 1
    months_col = max_col + 2
    days_col = months_col + 1
    amount_col = days_col + 1

    for index, sku in enumerate(all_skus):
        row = index + 2
        desc, priority, vat, standard, purchase, _in1, _in2 = identity(sku)
        month_qty = {key: float(sales.get(sku, {}).get(key, 0.0)) for _mk, key, _h, _l in MONTHS}
        peak, peak_month = max_month_label(month_qty)
        values = [common_sku(sku), sku, desc, priority, vat, standard, purchase]
        company_stock = stock.get(sku, {})
        for company, _label in COMPANY_COLS:
            values.append(company_stock.get(company, 0.0))
        values.extend([None, peak, peak_month, None, None, None])
        for col, value in enumerate(values, 1):
            cell = detail.cell(row, col, value)
            cell.font = body_font
            cell.border = thin
            if col in (6, 7, amount_col):
                cell.number_format = money_fmt
            elif first_co <= col <= max_col:
                cell.number_format = qty_fmt
            elif col in (months_col, days_col):
                cell.number_format = cover_fmt
        start = get_column_letter(first_co)
        end = get_column_letter(first_co + company_count - 1)
        total_letter = get_column_letter(total_qty_col)
        max_letter = get_column_letter(max_col)
        detail.cell(row, total_qty_col, f"=SUM({start}{row}:{end}{row})")
        detail.cell(row, months_col, f'=IF({max_letter}{row}=0,"",{total_letter}{row}/{max_letter}{row})')
        detail.cell(row, days_col, f'=IF({max_letter}{row}=0,"",{total_letter}{row}*30/{max_letter}{row})')
        detail.cell(row, amount_col, f"=G{row}*{total_letter}{row}")
        for col in (total_qty_col, months_col, days_col, amount_col):
            detail.cell(row, col).font = body_font
            detail.cell(row, col).border = thin
        detail.cell(row, total_qty_col).number_format = qty_fmt
        detail.cell(row, months_col).number_format = cover_fmt
        detail.cell(row, days_col).number_format = cover_fmt
        detail.cell(row, amount_col).number_format = money_fmt

    notes = wb.create_sheet("Notes")
    lines = [
        "Cosmetics ERP1 + ERP2 item stock report — refreshed 2026-10-05",
        "Source: cosmetics-lk-01 (ERP1) + cosmetics-lk-02 (ERP2)",
        "Items: enabled stock items (disabled=0, is_stock_item=1)",
        "Common SKU: stem before trailing _N (example ACN01_1 → ACN01)",
        "Description: Item.item_name (ERP1 preferred)",
        "Priority / VAT Status: ERP1 and ERP2 joined with / when they differ",
        "Standard Price and Latest Purchased Price: ERP1 when > 0, else ERP2",
        "Total Qty: Cosmetics.lk from Stock Balance bal_qty; other companies from Bin.actual_qty",
        "Sales window: 2026-08-01 to 2026-10-05 (Aug, Sep, Oct month-to-date)",
        "Oct Sale is 5 days only. Max Sale can understate a full October.",
        "Sale qty: net Sales Invoice stock ledger (returns included) across ERP1 and ERP2",
        "Max Sale (3mo): highest of Aug, Sep, Oct",
        "Month of Max Sale: month or months that hit that peak",
        "Months Cover: Total Qty / Max Sale. Blank when Max Sale is 0",
        "Days Cover: Total Qty × 30 / Max Sale",
        "Total Amount: Latest Purchased Price × Total Qty",
        "By Company sheet keeps the same cover math with stock split by company",
        f"Row count: {len(all_skus)}",
    ]
    for index, line in enumerate(lines, 1):
        cell = notes.cell(index, 1, line)
        cell.font = Font(name="Arial", size=11, bold=(index == 1))

    widths = {
        "A": 14, "B": 16, "C": 48, "D": 18, "E": 16, "F": 14, "G": 18,
        "H": 12, "I": 12, "J": 12, "K": 12, "L": 14, "M": 22, "N": 12, "O": 12, "P": 14,
    }
    for letter, width in widths.items():
        ws.column_dimensions[letter].width = width
    for col in range(1, len(detail_headers) + 1):
        detail.column_dimensions[get_column_letter(col)].width = 14 if col >= 8 else widths.get(get_column_letter(col), 14)
    detail.column_dimensions["C"].width = 48
    notes.column_dimensions["A"].width = 100

    OUT.parent.mkdir(parents=True, exist_ok=True)
    wb.save(OUT)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
