"""Build Cosmetics ERP1+ERP2 item stock report xlsx from MCP dumps."""
from __future__ import annotations

import json
import re
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

AGENT = Path(r"C:\Users\Bad-Boy\.cursor\projects\c-dev-cosmo-os\agent-tools")
OUT = Path(r"c:\dev\cosmo-os\tmp\cosmetics-erp1-erp2-item-stock-report.xlsx")

ITEM_FILES = {
    "erp1": [
        "aa4f33a6-6204-4f61-8829-fdd07c8c1347.txt",
        "9636a7a2-bdc2-456e-ab24-9175fabfe37b.txt",
        "39333429-6849-4eb2-8fdf-9b9b70e3b9a8.txt",
    ],
    "erp2": [
        "38dedccd-95d9-40f2-821c-77f703599e1c.txt",
        "11cab512-e219-46cc-9192-ccd43c29492f.txt",
        "6262a6d9-d297-48a1-8d7f-6a1a9b3cc73f.txt",
    ],
}

ERP1_BIN_FILES = [
    "76fe0826-56ed-4900-8985-2447db670ce3.txt",
    "ab98ae3f-dfb6-4db3-ae6a-51dd5729d068.txt",
    "ece3fb72-4d87-438e-8c38-1a5bdde4e2bd.txt",
    # page 3 was inlined in tool result — saved separately below if present
]

ERP2_BIN_FILES = [
    "318f05e9-9de2-4266-b6a7-aa21d8fcfc8f.txt",
    "2d248c1e-0111-41c9-9b3e-db6be7a1e68c.txt",
    "1a7c0f02-8630-4e7b-a1d5-ad3b33e86779.txt",
    "7073a60a-87f9-4130-b016-2e25ed130ffd.txt",
    "e0c5649e-5784-4969-84f3-099d3e33f8d4.txt",
    "ecd78b59-1e54-463f-b7b9-a34d5a00bb3b.txt",
    "7b48babd-6af0-4912-84f4-f0324e5f1066.txt",
    "657f69d9-cddb-4fa9-9a41-dd4ee40ea9e2.txt",
]

# ERP1 page 3 bins were returned inline; also use Stock Balance as backup for Cosmetics.lk
ERP1_STOCK_BALANCE = "f67fba6f-ec3a-45ec-9dcc-f9e58a448caa.txt"

WAREHOUSE_COMPANY = {
    # ERP1
    "Cool Planet Nugegoda Shop Warehouse - Cosmo": "Cosmetics.lk",
    "GCC Shop Warehouse - Cosmo": "Cosmetics.lk",
    "Kiribathgoda Shop Warehouse - Cosmo": "Cosmetics.lk",
    "Maharagama Shop Warehouse - Cosmo": "Cosmetics.lk",
    "Main Warehouse - Cosmo": "Cosmetics.lk",
    "Negombo Shop Warehouse - Cosmo": "Cosmetics.lk",
    "OGF Shop Warehouse - Cosmo": "Cosmetics.lk",
    "Pepiliyana Shop Warehouse - Cosmo": "Cosmetics.lk",
    # ERP2
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
    raw = path.read_text(encoding="utf-8")
    data = json.loads(raw)
    if isinstance(data, dict) and "message" in data:
        msg = data["message"]
        if isinstance(msg, dict) and "result" in msg:
            return msg["result"]
        return msg
    return data


def common_sku(sku: str) -> str:
    m = re.match(r"^(.*)_\d+$", sku.strip())
    return (m.group(1).strip() if m else sku.strip()) or sku.strip()


def num(v) -> float:
    try:
        n = float(v or 0)
        return n if n == n else 0.0
    except (TypeError, ValueError):
        return 0.0


def load_items(files: list[str]) -> dict[str, dict]:
    by_sku: dict[str, dict] = {}
    for name in files:
        rows = load_json(AGENT / name)
        for r in rows:
            sku = (r.get("item_code") or "").strip()
            if not sku:
                continue
            by_sku[sku] = r
    return by_sku


def load_bins(files: list[str]) -> list[dict]:
    out: list[dict] = []
    for name in files:
        p = AGENT / name
        if not p.exists():
            continue
        rows = load_json(p)
        if isinstance(rows, list):
            out.extend(rows)
    return out


def merge_priority(a: str | None, b: str | None) -> str:
    a = (a or "").strip()
    b = (b or "").strip()
    if a and b and a.lower() != b.lower():
        return f"{a} / {b}"
    return a or b


def merge_vat(a: str | None, b: str | None) -> str:
    a = (a or "").strip()
    b = (b or "").strip()
    if a and b and a.lower() != b.lower():
        return f"{a} / {b}"
    return a or b


def pick_rate(erp1: float, erp2: float) -> float:
    """Prefer ERP1 when set; else ERP2."""
    if erp1 > 0:
        return erp1
    return erp2 if erp2 > 0 else 0.0


def pick_purchase(erp1: float, erp2: float) -> float:
    if erp1 > 0:
        return erp1
    return erp2 if erp2 > 0 else 0.0


def main() -> None:
    erp1_items = load_items(ITEM_FILES["erp1"])
    erp2_items = load_items(ITEM_FILES["erp2"])
    print(f"ERP1 items: {len(erp1_items)}, ERP2 items: {len(erp2_items)}")

    # stock[sku][company] = qty
    stock: dict[str, dict[str, float]] = {}

    def add_qty(sku: str, company: str, qty: float) -> None:
        if not sku or not company:
            return
        stock.setdefault(sku, {})
        stock[sku][company] = stock[sku].get(company, 0.0) + qty

    # ERP1 bins pages 0-2 + stock balance (covers all Cosmetics.lk warehouses)
    for row in load_bins(ERP1_BIN_FILES):
        sku = (row.get("item_code") or "").strip()
        wh = (row.get("warehouse") or "").strip()
        company = WAREHOUSE_COMPANY.get(wh)
        if not company:
            continue
        add_qty(sku, company, num(row.get("actual_qty")))

    # ERP1 page 3 (SMB…ZGTS) — written beside script if present
    p3 = Path(__file__).with_name("erp1-bins-page3.json")
    if p3.exists():
        for row in json.loads(p3.read_text(encoding="utf-8")):
            sku = (row.get("item_code") or "").strip()
            wh = (row.get("warehouse") or "").strip()
            company = WAREHOUSE_COMPANY.get(wh)
            if company:
                add_qty(sku, company, num(row.get("actual_qty")))
    else:
        # Rebuild Cosmetics.lk from Stock Balance (complete, no overlap issue if we
        # zero Cosmetics.lk from partial bins first)
        # Prefer stock balance as authoritative for Cosmetics.lk
        stock_cosmo: dict[str, float] = {}
        for row in load_json(AGENT / ERP1_STOCK_BALANCE):
            if not isinstance(row, dict):
                continue
            sku = (row.get("item_code") or "").strip()
            if not sku:
                continue
            stock_cosmo[sku] = stock_cosmo.get(sku, 0.0) + num(row.get("bal_qty"))
        for sku, qty in stock_cosmo.items():
            stock.setdefault(sku, {})
            stock[sku]["Cosmetics.lk"] = qty

    for row in load_bins(ERP2_BIN_FILES):
        sku = (row.get("item_code") or "").strip()
        wh = (row.get("warehouse") or "").strip()
        company = WAREHOUSE_COMPANY.get(wh)
        if not company:
            print(f"WARN unknown warehouse: {wh}")
            continue
        add_qty(sku, company, num(row.get("actual_qty")))

    # ERP2 last page was inline — load if saved
    p8 = Path(__file__).with_name("erp2-bins-page8.json")
    if p8.exists():
        for row in json.loads(p8.read_text(encoding="utf-8-sig")):
            sku = (row.get("item_code") or "").strip()
            wh = (row.get("warehouse") or "").strip()
            company = WAREHOUSE_COMPANY.get(wh)
            if company:
                add_qty(sku, company, num(row.get("actual_qty")))

    sales_path = Path(__file__).with_name("sle-sales") / "sales-by-sku.json"
    sales_by_sku: dict[str, dict] = {}
    if sales_path.exists():
        sales_by_sku = json.loads(sales_path.read_text(encoding="utf-8"))
    print(f"Sales SKUs loaded: {len(sales_by_sku)}")

    all_skus = sorted(
        set(erp1_items) | set(erp2_items) | set(stock) | set(sales_by_sku),
        key=lambda s: s.upper(),
    )
    print(f"Unique SKUs: {len(all_skus)}")

    wb = Workbook()
    # Whole-company sheet first (no per-company stock columns)
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
        "Jul Sale",
        "Aug Sale",
        "Sep Sale",
        "Max Sale (3mo)",
        "Month of Max Sale",
        "Months Cover",
        "Days Cover",
        "Total Amount",
        "Total Value",
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

    def style_header(sheet, hdrs):
        for col, h in enumerate(hdrs, 1):
            cell = sheet.cell(1, col, h)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(wrap_text=True, horizontal="center", vertical="center")
            cell.border = thin
        sheet.row_dimensions[1].height = 32
        sheet.freeze_panes = "C2"
        sheet.auto_filter.ref = f"A1:{get_column_letter(len(hdrs))}1"

    style_header(ws, headers)

    # Col map Whole Company (1-based):
    # 1 Common 2 Variant 3 Desc 4 Priority 5 VAT 6 Std 7 Latest
    # 8 Total Qty 9 Jul 10 Aug 11 Sep 12 Max 13 Months 14 Days 15 Amount 16 ERP1 17 ERP2
    for i, sku in enumerate(all_skus):
        row = i + 2
        i1 = erp1_items.get(sku)
        i2 = erp2_items.get(sku)
        desc = ""
        if i1 and i2:
            desc = i1.get("item_name") or i2.get("item_name") or ""
        else:
            desc = (i1 or i2 or {}).get("item_name") or ""

        priority = merge_priority(
            (i1 or {}).get("custom_product_priority"),
            (i2 or {}).get("custom_product_priority"),
        )
        vat = merge_vat(
            (i1 or {}).get("custom_tax_status"),
            (i2 or {}).get("custom_tax_status"),
        )
        std = pick_rate(num((i1 or {}).get("standard_rate")), num((i2 or {}).get("standard_rate")))
        purchase = pick_purchase(
            num((i1 or {}).get("last_purchase_rate")),
            num((i2 or {}).get("last_purchase_rate")),
        )
        co_stock = stock.get(sku, {})
        total_qty = sum(co_stock.get(c, 0.0) for c, _ in COMPANY_COLS)
        s = sales_by_sku.get(sku, {})
        jul = float(s.get("jul") or 0)
        aug = float(s.get("aug") or 0)
        sep = float(s.get("sep") or 0)
        max_sale = float(s.get("max") or 0)
        if max_sale <= 0:
            max_sale = max(jul, aug, sep)
        max_month = (s.get("max_month") or "").strip()
        if not max_month and max_sale > 0:
            tied = []
            if jul == max_sale:
                tied.append("Jul 2026")
            if aug == max_sale:
                tied.append("Aug 2026")
            if sep == max_sale:
                tied.append("Sep 2026")
            max_month = " / ".join(tied)

        values = [
            common_sku(sku),
            sku,
            desc,
            priority,
            vat,
            std,
            purchase,
            total_qty,
            jul,
            aug,
            sep,
            max_sale,
            max_month,
            None,  # Months Cover formula
            None,  # Days Cover formula
            None,  # Total Amount formula
            None,  # Total Value formula
            "Yes" if i1 else "No",
            "Yes" if i2 else "No",
        ]
        for col, val in enumerate(values, 1):
            cell = ws.cell(row, col, val)
            cell.font = body_font
            cell.border = thin
            if col in (6, 7, 16, 17):
                cell.number_format = money_fmt
            elif col in (8, 9, 10, 11, 12):
                cell.number_format = qty_fmt
            elif col in (14, 15):
                cell.number_format = cover_fmt

        # Months Cover = Total Qty / Max Sale (col L)
        ws.cell(row, 14, f'=IF(L{row}=0,"",H{row}/L{row})')
        ws.cell(row, 14).font = body_font
        ws.cell(row, 14).border = thin
        ws.cell(row, 14).number_format = cover_fmt
        # Days Cover = Total Qty * 30 / Max Sale
        ws.cell(row, 15, f'=IF(L{row}=0,"",H{row}*30/L{row})')
        ws.cell(row, 15).font = body_font
        ws.cell(row, 15).border = thin
        ws.cell(row, 15).number_format = cover_fmt
        # Total Amount = Latest Purchased Price * Total Qty
        ws.cell(row, 16, f"=G{row}*H{row}")
        ws.cell(row, 16).font = body_font
        ws.cell(row, 16).border = thin
        ws.cell(row, 16).number_format = money_fmt
        # Total Value = Standard Price * Total Qty
        ws.cell(row, 17, f"=F{row}*H{row}")
        ws.cell(row, 17).font = body_font
        ws.cell(row, 17).border = thin
        ws.cell(row, 17).number_format = money_fmt

    # Detail sheet with company stock columns
    detail = wb.create_sheet("By Company")
    detail_headers = [
        "Common SKU",
        "Variant SKU",
        "Description",
        "Priority",
        "VAT Status",
        "Standard Price",
        "Latest Purchased Price",
        *[label for _, label in COMPANY_COLS],
        "Total Qty",
        "Max Sale (3mo)",
        "Month of Max Sale",
        "Months Cover",
        "Days Cover",
        "Total Amount",
        "Total Value",
    ]
    style_header(detail, detail_headers)
    first_co = 8
    n_co = len(COMPANY_COLS)
    total_qty_col = first_co + n_co
    max_col = total_qty_col + 1
    max_month_col = max_col + 1
    months_col = max_month_col + 1
    days_col = months_col + 1
    amt_col = days_col + 1
    value_col = amt_col + 1

    for i, sku in enumerate(all_skus):
        row = i + 2
        i1 = erp1_items.get(sku)
        i2 = erp2_items.get(sku)
        if i1 and i2:
            desc = i1.get("item_name") or i2.get("item_name") or ""
        else:
            desc = (i1 or i2 or {}).get("item_name") or ""
        s = sales_by_sku.get(sku, {})
        jul = float(s.get("jul") or 0)
        aug = float(s.get("aug") or 0)
        sep = float(s.get("sep") or 0)
        max_sale = float(s.get("max") or 0)
        if max_sale <= 0:
            max_sale = max(jul, aug, sep)
        max_month = (s.get("max_month") or "").strip()
        if not max_month and max_sale > 0:
            tied = []
            if jul == max_sale:
                tied.append("Jul 2026")
            if aug == max_sale:
                tied.append("Aug 2026")
            if sep == max_sale:
                tied.append("Sep 2026")
            max_month = " / ".join(tied)

        values = [
            common_sku(sku),
            sku,
            desc,
            merge_priority(
                (i1 or {}).get("custom_product_priority"),
                (i2 or {}).get("custom_product_priority"),
            ),
            merge_vat(
                (i1 or {}).get("custom_tax_status"),
                (i2 or {}).get("custom_tax_status"),
            ),
            pick_rate(num((i1 or {}).get("standard_rate")), num((i2 or {}).get("standard_rate"))),
            pick_purchase(
                num((i1 or {}).get("last_purchase_rate")),
                num((i2 or {}).get("last_purchase_rate")),
            ),
        ]
        co_stock = stock.get(sku, {})
        for company, _label in COMPANY_COLS:
            values.append(co_stock.get(company, 0.0))
        values.extend([None, max_sale, max_month, None, None, None, None])

        for col, val in enumerate(values, 1):
            cell = detail.cell(row, col, val)
            cell.font = body_font
            cell.border = thin
            if col in (6, 7, amt_col, value_col):
                cell.number_format = money_fmt
            elif first_co <= col <= max_col:
                cell.number_format = qty_fmt
            elif col in (months_col, days_col):
                cell.number_format = cover_fmt

        start_l = get_column_letter(first_co)
        end_l = get_column_letter(first_co + n_co - 1)
        tq = get_column_letter(total_qty_col)
        mx = get_column_letter(max_col)
        detail.cell(row, total_qty_col, f"=SUM({start_l}{row}:{end_l}{row})")
        detail.cell(row, total_qty_col).font = body_font
        detail.cell(row, total_qty_col).border = thin
        detail.cell(row, total_qty_col).number_format = qty_fmt
        detail.cell(row, months_col, f'=IF({mx}{row}=0,"",{tq}{row}/{mx}{row})')
        detail.cell(row, months_col).font = body_font
        detail.cell(row, months_col).border = thin
        detail.cell(row, months_col).number_format = cover_fmt
        detail.cell(row, days_col, f'=IF({mx}{row}=0,"",{tq}{row}*30/{mx}{row})')
        detail.cell(row, days_col).font = body_font
        detail.cell(row, days_col).border = thin
        detail.cell(row, days_col).number_format = cover_fmt
        detail.cell(row, amt_col, f"=G{row}*{tq}{row}")
        detail.cell(row, amt_col).font = body_font
        detail.cell(row, amt_col).border = thin
        detail.cell(row, amt_col).number_format = money_fmt
        detail.cell(row, value_col, f"=F{row}*{tq}{row}")
        detail.cell(row, value_col).font = body_font
        detail.cell(row, value_col).border = thin
        detail.cell(row, value_col).number_format = money_fmt

    # Legend sheet
    leg = wb.create_sheet("Notes")
    notes = [
        "Cosmetics ERP1 + ERP2 item stock report (whole company)",
        "Source: cosmetics-lk-01 (ERP1) + cosmetics-lk-02 (ERP2)",
        "Items: enabled stock items (disabled=0, is_stock_item=1)",
        "Common SKU: stem before trailing _N (e.g. ACN01_1 → ACN01)",
        "Variant SKU: Item.item_code",
        "Description: Item.item_name (ERP1 preferred)",
        "Priority: custom_product_priority (ERP1 / ERP2 if both differ)",
        "VAT Status: custom_tax_status (ERP1 / ERP2 if both differ)",
        "Standard Price: Item.standard_rate (ERP1 if >0 else ERP2)",
        "Latest Purchased Price: Item.last_purchase_rate (ERP1 if >0 else ERP2)",
        "Total Qty: sum Bin.actual_qty across all companies (ERP1 Cosmetics.lk + ERP2 trading)",
        "Jul/Aug/Sep Sale: net Sales Invoice SLE qty (ERP1+ERP2), returns netted",
        "Window: 2026-07-01 to 2026-09-29 (last 3 months incl. MTD)",
        "Max Sale (3mo): max(Jul, Aug, Sep) — peak monthly demand",
        "Month of Max Sale: which month(s) hit that peak (ties joined with /)",
        "Months Cover: Total Qty / Max Sale (blank if Max Sale = 0)",
        "Days Cover: Total Qty × 30 / Max Sale (assumes 30-day month)",
        "Total Amount: Latest Purchased Price × Total Qty",
        "Total Value: Total Qty × Standard Price (standard selling)",
        "Sheet 'By Company': same rows with per-company stock columns",
        f"Generated row count: {len(all_skus)}",
    ]
    for i, line in enumerate(notes, 1):
        c = leg.cell(i, 1, line)
        c.font = Font(name="Arial", size=11, bold=(i == 1))

    widths = {
        "A": 14,
        "B": 16,
        "C": 48,
        "D": 18,
        "E": 16,
        "F": 14,
        "G": 18,
        "H": 12,
        "I": 10,
        "J": 10,
        "K": 10,
        "L": 14,
        "M": 18,
        "N": 12,
        "O": 12,
        "P": 14,
        "Q": 14,
    }
    for letter, w in widths.items():
        ws.column_dimensions[letter].width = w
        detail.column_dimensions[letter].width = w
    for col in range(8, len(detail_headers) + 1):
        detail.column_dimensions[get_column_letter(col)].width = 12
    leg.column_dimensions["A"].width = 90

    OUT.parent.mkdir(parents=True, exist_ok=True)
    wb.save(OUT)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
