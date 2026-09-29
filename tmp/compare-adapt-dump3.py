"""Compare original Adapt CSVs vs Dump 3 Adapt rows."""
from __future__ import annotations

import csv
import json
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

csv.field_size_limit(32 * 1024 * 1024)

LINE_DIR = Path(r"C:\Users\Bad-Boy\Downloads\ADAPT DB\ADAPT DB")
INVOICE_FILE = Path(r"C:\Users\Bad-Boy\Downloads\Archive (5)\invoice_data_headers.csv")
SALES_CSV = Path(r"C:\dev\cosmo-os\tmp\full-history-export\sales.csv")
OUT = Path(r"C:\dev\cosmo-os\tmp\full-history-export\adapt-accuracy.json")

NON_PRODUCT = {"coupon", "shipping", "fee"}


def money(value: str) -> str:
    text = (value or "").strip().replace(",", "")
    if text == "":
        return ""
    try:
        return f"{float(text):.2f}"
    except ValueError:
        return text


def qty(value: str) -> str:
    text = (value or "").strip()
    if text == "":
        return ""
    try:
        n = float(text)
        if n.is_integer():
            return str(int(n))
        return str(n)
    except ValueError:
        return text


def parse_adapt_date(raw: str) -> str:
    text = (raw or "").strip()
    if not text:
        return ""
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})", text)
    if m:
        day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return f"{year:04d}-{month:02d}-{day:02d}"
    return text[:10]


def line_key(invoice: str, sku: str, title: str, quantity: str, price: str) -> tuple:
    return (
        (invoice or "").strip(),
        (sku or "").strip(),
        (title or "").strip(),
        qty(quantity),
        money(price),
    )


def norm_name(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip()).casefold()


def load_original_product_lines():
    by_invoice: dict[str, Counter] = defaultdict(Counter)
    meta = Counter()
    coupon_by_invoice: dict[str, str] = {}
    pickup_invoices: set[str] = set()
    files = sorted(LINE_DIR.glob("*/Untitled.csv"))
    for path in files:
        print(f"reading {path}", flush=True)
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                meta["rows"] += 1
                invoice = (row.get("sales_invoice_no") or "").strip()
                code = (row.get("item_code") or "").strip()
                name = (row.get("item_name") or "").strip()
                kind = code.lower()
                if kind == "coupon":
                    meta["coupon"] += 1
                    if invoice and name and invoice not in coupon_by_invoice:
                        coupon_by_invoice[invoice] = name
                    continue
                if kind == "shipping":
                    meta["shipping"] += 1
                    if re.search(r"store\s*pick", name, re.I):
                        pickup_invoices.add(invoice)
                    continue
                if kind == "fee":
                    meta["fee"] += 1
                    continue
                meta["product"] += 1
                by_invoice[invoice][line_key(invoice, code, name, row.get("quantity") or "", row.get("unit_price") or "")] += 1
    return by_invoice, coupon_by_invoice, pickup_invoices, meta


def load_dump3_adapt():
    by_invoice: dict[str, Counter] = defaultdict(Counter)
    invoice_fields: dict[str, dict[str, str]] = {}
    rows = 0
    print("reading dump3 sales.csv Adapt rows", flush=True)
    with SALES_CSV.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            if row.get("DATA_SOURCE") != "Adapt history":
                continue
            rows += 1
            invoice = (row.get("INVOICE_NO") or "").strip()
            by_invoice[invoice][line_key(
                invoice,
                row.get("SKU") or "",
                row.get("PRODUCT_TITLE") or "",
                row.get("QUANTITY") or "",
                row.get("UNIT_PRICE") or "",
            )] += 1
            if invoice not in invoice_fields:
                invoice_fields[invoice] = {
                    "invoice_date": (row.get("INVOICE_DATE") or "").strip(),
                    "location_name": (row.get("LOCATION_NAME") or "").strip(),
                    "customer_name": (row.get("CUSTOMER_NAME") or "").strip(),
                    "grand_total": money(row.get("GRAND_TOTAL") or ""),
                    "payment_gateway": (row.get("PAYMENT_GATEWAY") or "").strip(),
                    "merchant_name": (row.get("MERCHANT_NAME") or "").strip(),
                    "merchant_coupon": (row.get("MERCHANT_COUPON_CODE") or "").strip(),
                    "pos_sale": (row.get("POS_SALE") or "").strip(),
                    "source_name": (row.get("SOURCE_NAME") or "").strip(),
                    "status": (row.get("STATUS") or "").strip(),
                    "payment_status": (row.get("PAYMENT_STATUS") or "").strip(),
                    "unit_price_total_sample": money(row.get("UNIT_PRICE_TOTAL") or ""),
                    "discounted_price_sample": money(row.get("DISCOUNTED_PRICE") or ""),
                    "after_discount_sample": money(row.get("AFTER_DISCOUNT_TOTAL") or ""),
                }
    return by_invoice, invoice_fields, rows


def load_original_invoices(needed: set[str]):
    print("reading invoice_data_headers.csv", flush=True)
    found: dict[str, dict[str, str]] = {}
    rows = 0
    parse_errors = 0
    with INVOICE_FILE.open("r", encoding="utf-8-sig", newline="", errors="replace") as handle:
        reader = csv.reader(handle)
        try:
            headers = next(reader)
        except StopIteration:
            return found, rows, parse_errors
        headers = [h.strip().strip('"') for h in headers]
        idx = {h.lower(): i for i, h in enumerate(headers)}

        def get(row: list[str], *names: str) -> str:
            for name in names:
                i = idx.get(name.lower())
                if i is None or i >= len(row):
                    continue
                return (row[i] or "").strip()
            return ""

        for row in reader:
            rows += 1
            if rows % 40000 == 0:
                print(f"  invoice headers {rows}, matched {len(found)}", flush=True)
            invoice = get(row, "sales_invoice_no")
            if not invoice or invoice not in needed:
                continue
            if invoice in found:
                continue
            found[invoice] = {
                "invoice_date": parse_adapt_date(get(row, "invoice_date")),
                "location_name": get(row, "location_name"),
                "customer_name": get(row, "attention_name"),
                "grand_total": money(get(row, "ttl_amount")),
                "payment_gateway": get(row, "in_payment_type_name") or get(row, "payment_methode"),
                "merchant_name": get(row, "KnownName", "knownname", "known_name"),
                "pos_flag": get(row, "pos_flag"),
            }
    return found, rows, parse_errors


def match_counters(src: Counter, dst: Counter):
    matched = 0
    source_total = sum(src.values())
    dump_total = sum(dst.values())
    for key, count in src.items():
        matched += min(count, dst.get(key, 0))
    extra = dump_total - matched
    missing = source_total - matched
    return {
        "source_lines": source_total,
        "dump_lines": dump_total,
        "matched_lines": matched,
        "missing_in_dump": missing,
        "extra_in_dump": extra,
    }


def pct(n: int, d: int) -> float:
    return round(100.0 * n / d, 2) if d else 0.0


def main():
    orig_lines, orig_coupons, orig_pickup, line_meta = load_original_product_lines()
    dump_lines, dump_invoices, dump_row_count = load_dump3_adapt()
    dump_invoice_nos = set(dump_invoices)
    orig_invoices, header_rows, _ = load_original_invoices(dump_invoice_nos)

    overlap = set(orig_lines) & dump_invoice_nos
    src_all = Counter()
    dst_all = Counter()
    for inv in overlap:
        src_all.update(orig_lines[inv])
        dst_all.update(dump_lines[inv])
    line_match = match_counters(src_all, dst_all)

    field_stats = {
        "invoice_date": Counter(),
        "location_name": Counter(),
        "grand_total": Counter(),
        "payment_gateway": Counter(),
        "merchant_name": Counter(),
        "customer_name_exact": Counter(),
        "customer_name_norm": Counter(),
        "merchant_coupon": Counter(),
        "pos_sale": Counter(),
        "source_name": Counter(),
        "unit_price_times_qty": Counter(),
    }

    coupon_ok = coupon_blank_ok = coupon_wrong = coupon_missing = 0
    pos_ok = pos_wrong = 0
    derived_ok = 0
    derived_rows = 0

    with SALES_CSV.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            if row.get("DATA_SOURCE") != "Adapt history":
                continue
            qty_n = float(row["QUANTITY"] or 0)
            unit = float(row["UNIT_PRICE"] or 0)
            expected_total = money(str(qty_n * unit))
            derived_rows += 1
            if money(row.get("UNIT_PRICE_TOTAL") or "") == expected_total:
                derived_ok += 1
            if money(row.get("DISCOUNTED_PRICE") or "") == money(row.get("UNIT_PRICE") or ""):
                field_stats["unit_price_times_qty"]["discount_eq_unit"] += 1
            if money(row.get("AFTER_DISCOUNT_TOTAL") or "") == expected_total:
                field_stats["unit_price_times_qty"]["after_eq_line"] += 1

    for invoice, dump in dump_invoices.items():
        src = orig_invoices.get(invoice)
        if not src:
            field_stats["invoice_date"]["no_source"] += 1
            continue
        for field in ("invoice_date", "location_name", "grand_total", "payment_gateway", "merchant_name"):
            left = (src.get(field) or "").strip()
            right = (dump.get(field) or "").strip()
            if field == "grand_total":
                left, right = money(left), money(right)
            if left == right:
                field_stats[field]["match"] += 1
            elif not left and not right:
                field_stats[field]["both_blank"] += 1
            elif not left:
                field_stats[field]["source_blank"] += 1
            elif not right:
                field_stats[field]["dump_blank"] += 1
            else:
                field_stats[field]["mismatch"] += 1
        left_name, right_name = src.get("customer_name") or "", dump.get("customer_name") or ""
        if left_name.strip() == right_name.strip():
            field_stats["customer_name_exact"]["match"] += 1
        else:
            field_stats["customer_name_exact"]["mismatch"] += 1
        if norm_name(left_name) == norm_name(right_name):
            field_stats["customer_name_norm"]["match"] += 1
        else:
            field_stats["customer_name_norm"]["mismatch"] += 1

        expected_coupon = orig_coupons.get(invoice, "")
        actual_coupon = dump.get("merchant_coupon") or ""
        if expected_coupon:
            if actual_coupon == expected_coupon:
                coupon_ok += 1
            elif not actual_coupon:
                coupon_missing += 1
            else:
                coupon_wrong += 1
        else:
            if not actual_coupon:
                coupon_blank_ok += 1
            else:
                coupon_wrong += 1

        expected_pos = "1" if invoice in orig_pickup else "0"
        actual_pos = dump.get("pos_sale") or "0"
        if expected_pos == actual_pos:
            pos_ok += 1
        else:
            pos_wrong += 1

        if dump.get("source_name") == "adapt":
            field_stats["source_name"]["match"] += 1
        else:
            field_stats["source_name"]["mismatch"] += 1

    compared_invoices = sum(field_stats["invoice_date"][k] for k in ("match", "mismatch", "source_blank", "dump_blank", "both_blank"))
    core_fields = ["invoice_date", "location_name", "grand_total", "payment_gateway", "merchant_name"]
    core_match = sum(field_stats[f]["match"] + field_stats[f]["both_blank"] for f in core_fields)
    core_total = compared_invoices * len(core_fields)

    product_in_overlap = line_match["source_lines"]
    product_accuracy = pct(line_match["matched_lines"], product_in_overlap)

    orig_product_all = line_meta["product"]
    coverage_vs_all_files = pct(line_match["matched_lines"], orig_product_all)

    dump_only_invoices = sorted(dump_invoice_nos - set(orig_lines))[:10]
    orig_only_invoices = sorted(set(orig_lines) - dump_invoice_nos)

    report = {
        "original_line_files": {
            **dict(line_meta),
            "invoices_with_product_lines": len(orig_lines),
            "invoices_with_coupon_line": len(orig_coupons),
            "invoices_with_store_pickup": len(orig_pickup),
        },
        "dump3_adapt": {
            "product_rows": dump_row_count,
            "invoices": len(dump_invoices),
        },
        "invoice_header_file_rows_read": header_rows,
        "invoice_headers_matched_to_dump": len(orig_invoices),
        "overlap_invoices": len(overlap),
        "dump_invoices_missing_from_line_files": len(dump_invoice_nos - set(orig_lines)),
        "line_file_invoices_missing_from_dump": len(orig_only_invoices),
        "product_line_match_on_overlap": line_match,
        "product_line_accuracy_pct_on_overlap": product_accuracy,
        "product_line_coverage_pct_vs_all_original_product_rows": coverage_vs_all_files,
        "invoice_field_accuracy": {
            field: {
                **dict(stats),
                "accuracy_pct": pct(stats["match"] + stats["both_blank"], sum(stats[k] for k in stats if k != "no_source") or 1),
            }
            for field, stats in field_stats.items()
            if field not in {"unit_price_times_qty", "source_name", "customer_name_exact", "customer_name_norm", "merchant_coupon", "pos_sale"}
        },
        "customer_name_exact_pct": pct(field_stats["customer_name_exact"]["match"], sum(field_stats["customer_name_exact"].values())),
        "customer_name_normalized_pct": pct(field_stats["customer_name_norm"]["match"], sum(field_stats["customer_name_norm"].values())),
        "merchant_coupon_pct": pct(coupon_ok + coupon_blank_ok, coupon_ok + coupon_blank_ok + coupon_wrong + coupon_missing),
        "merchant_coupon_detail": {
            "match_when_present": coupon_ok,
            "blank_when_absent": coupon_blank_ok,
            "missing": coupon_missing,
            "wrong": coupon_wrong,
        },
        "pos_sale_pct": pct(pos_ok, pos_ok + pos_wrong),
        "source_name_adapt_pct": pct(field_stats["source_name"]["match"], sum(field_stats["source_name"].values())),
        "derived_qty_times_price_pct": pct(derived_ok, derived_rows),
        "discounted_eq_unit_pct": pct(field_stats["unit_price_times_qty"]["discount_eq_unit"], derived_rows),
        "after_discount_eq_line_pct": pct(field_stats["unit_price_times_qty"]["after_eq_line"], derived_rows),
        "core_invoice_fields_accuracy_pct": pct(core_match, core_total),
        "compared_invoices_with_header_source": compared_invoices,
        "sample_dump_only_invoices": dump_only_invoices,
        "line_file_invoices_not_in_dump_count": len(orig_only_invoices),
    }

    # Weighted overall: product line identity + core invoice fields + coupon + pos + derived totals
    weights = [
        (line_match["matched_lines"], product_in_overlap),
        (core_match, core_total),
        (coupon_ok + coupon_blank_ok, coupon_ok + coupon_blank_ok + coupon_wrong + coupon_missing),
        (pos_ok, pos_ok + pos_wrong),
        (derived_ok, derived_rows),
    ]
    overall_n = sum(a for a, b in weights if b)
    overall_d = sum(b for a, b in weights if b)
    report["overall_imported_adapt_accuracy_pct"] = pct(overall_n, overall_d)
    report["note"] = (
        "Product lines matched on invoice_no + sku + title + qty + unit_price. "
        "Customer name compared to Adapt attention_name; Dump 3 uses Contact Master, so that field can differ after later edits. "
        "Barcode/brand are catalog lookups, not Adapt columns, so they are excluded from this accuracy score."
    )
    OUT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
