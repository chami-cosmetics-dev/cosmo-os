"""Customer-level and item-wise Adapt vs Dump 3 / Contact Master match rates."""
from __future__ import annotations

import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

csv.field_size_limit(32 * 1024 * 1024)

LINE_DIR = Path(r"C:\Users\Bad-Boy\Downloads\ADAPT DB\ADAPT DB")
INVOICE_FILE = Path(r"C:\Users\Bad-Boy\Downloads\Archive (5)\invoice_data_headers.csv")
SALES_CSV = Path(r"C:\dev\cosmo-os\tmp\full-history-export\sales.csv")
CONTACT_CSV = Path(r"C:\dev\cosmo-os\tmp\full-history-export\adapt-invoice-contacts.csv")
OUT = Path(r"C:\dev\cosmo-os\tmp\full-history-export\adapt-customer-history-accuracy.json")


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
        return str(int(n)) if n.is_integer() else str(n)
    except ValueError:
        return text


def canon_phone(value: str) -> str:
    digits = re.sub(r"\D", "", value or "")
    if digits.startswith("00"):
        digits = digits[2:]
    if digits.startswith("94") and len(digits) >= 11:
        digits = "0" + digits[2:]
        if digits.startswith("00") and len(digits) == 11:
            digits = "0" + digits[2:]
    if len(digits) == 9:
        digits = "0" + digits
    if len(digits) == 12 and digits.startswith("940"):
        digits = "0" + digits[3:]
    return digits


def norm_name(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip()).casefold()


def item_key(sku: str, title: str, quantity: str, price: str) -> tuple:
    title = re.sub(r"[\r\n]+", "\n", (title or "").strip())
    return ((sku or "").strip(), title, qty(quantity), money(price))


def pct(n: int, d: int) -> float:
    return round(100.0 * n / d, 2) if d else 0.0


def load_contacts():
    by_invoice = {}
    with CONTACT_CSV.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            invoice = (row.get("invoice_no") or "").strip()
            if invoice:
                by_invoice[invoice] = {
                    "contact_id": (row.get("contact_id") or "").strip(),
                    "name": (row.get("customer_name") or "").strip(),
                    "phone": canon_phone(row.get("phone") or ""),
                }
    return by_invoice


def load_original_invoices(needed: set[str]):
    found = {}
    with INVOICE_FILE.open(encoding="utf-8-sig", newline="", errors="replace") as handle:
        reader = csv.reader(handle)
        headers = [h.strip().strip('"') for h in next(reader)]
        idx = {h.lower(): i for i, h in enumerate(headers)}

        def get(row, *names):
            for name in names:
                i = idx.get(name.lower())
                if i is None or i >= len(row):
                    continue
                return (row[i] or "").strip()
            return ""

        for row in reader:
            invoice = get(row, "sales_invoice_no")
            if not invoice or invoice not in needed or invoice in found:
                continue
            found[invoice] = {
                "customer_master_id": get(row, "customer_master_id"),
                "phone": canon_phone(get(row, "customer_tp") or get(row, "customer_tp_raw")),
                "name": get(row, "attention_name"),
                "email": get(row, "customer_email").lower(),
            }
    return found


def load_original_items(needed: set[str]):
    by_invoice = defaultdict(Counter)
    for path in sorted(LINE_DIR.glob("*/Untitled.csv")):
        with path.open(encoding="utf-8-sig", newline="") as handle:
            for row in csv.DictReader(handle):
                invoice = (row.get("sales_invoice_no") or "").strip()
                if invoice not in needed:
                    continue
                code = (row.get("item_code") or "").strip().lower()
                if code in {"coupon", "shipping", "fee"}:
                    continue
                by_invoice[invoice][
                    item_key(row.get("item_code") or "", row.get("item_name") or "", row.get("quantity") or "", row.get("unit_price") or "")
                ] += 1
    return by_invoice


def load_dump3_items():
    by_invoice = defaultdict(Counter)
    names = {}
    with SALES_CSV.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            if row.get("DATA_SOURCE") != "Adapt history":
                continue
            invoice = (row.get("INVOICE_NO") or "").strip()
            names[invoice] = (row.get("CUSTOMER_NAME") or "").strip()
            by_invoice[invoice][
                item_key(row.get("SKU") or "", row.get("PRODUCT_TITLE") or "", row.get("QUANTITY") or "", row.get("UNIT_PRICE") or "")
            ] += 1
    return by_invoice, names


def counters_equal(a: Counter, b: Counter) -> bool:
    return a == b


def match_count(a: Counter, b: Counter) -> tuple[int, int]:
    matched = sum(min(a[k], b.get(k, 0)) for k in a)
    return matched, sum(a.values())


def main():
    print("contacts", flush=True)
    contacts = load_contacts()
    needed = set(contacts)
    print(f"  {len(contacts)} dump/DB invoices", flush=True)

    print("original invoices", flush=True)
    orig_inv = load_original_invoices(needed)
    print(f"  {len(orig_inv)} matched in Adapt invoice file", flush=True)

    print("original items", flush=True)
    orig_items = load_original_items(needed)
    print("dump3 items", flush=True)
    dump_items, dump_names = load_dump3_items()

    # --- invoice-level identity ---
    phone_match = name_exact = name_norm = 0
    phone_compared = name_compared = 0
    for invoice, contact in contacts.items():
        src = orig_inv.get(invoice)
        if not src:
            continue
        if src["phone"] or contact["phone"]:
            phone_compared += 1
            if src["phone"] and contact["phone"] and src["phone"] == contact["phone"]:
                phone_match += 1
        dump_name = dump_names.get(invoice) or contact["name"]
        if src["name"] or dump_name:
            name_compared += 1
            if src["name"].strip() == dump_name.strip():
                name_exact += 1
            if norm_name(src["name"]) == norm_name(dump_name):
                name_norm += 1

    # --- item-wise per invoice ---
    item_matched = item_total = 0
    invoices_items_perfect = 0
    invoices_with_items = 0
    for invoice in needed:
        src = orig_items.get(invoice, Counter())
        dst = dump_items.get(invoice, Counter())
        matched, total = match_count(src, dst)
        item_matched += matched
        item_total += total
        if total or sum(dst.values()):
            invoices_with_items += 1
            if counters_equal(src, dst):
                invoices_items_perfect += 1

    # --- Adapt customer (customer_master_id, else phone) ---
    adapt_cust_invoices = defaultdict(set)
    for invoice, src in orig_inv.items():
        key = src["customer_master_id"] or (f"phone:{src['phone']}" if src["phone"] else f"inv:{invoice}")
        adapt_cust_invoices[key].add(invoice)

    intact = 0
    split = 0
    item_perfect_customers = 0
    item_matched_c = item_total_c = 0
    customers_with_items = 0
    split_examples = []
    for cust, invoices in adapt_cust_invoices.items():
        contact_ids = {contacts[i]["contact_id"] for i in invoices if i in contacts}
        src_items = Counter()
        dst_items = Counter()
        for invoice in invoices:
            src_items.update(orig_items.get(invoice, Counter()))
            dst_items.update(dump_items.get(invoice, Counter()))
        matched, total = match_count(src_items, dst_items)
        item_matched_c += matched
        item_total_c += total
        if total:
            customers_with_items += 1
            if counters_equal(src_items, dst_items):
                item_perfect_customers += 1
        if len(contact_ids) == 1:
            intact += 1
        else:
            split += 1
            if len(split_examples) < 8:
                split_examples.append({"adapt_customer": cust, "contacts": len(contact_ids), "invoices": len(invoices)})

    # --- Cosmo contact history vs Adapt invoices on that contact ---
    contact_invoices = defaultdict(set)
    for invoice, contact in contacts.items():
        contact_invoices[contact["contact_id"]].add(invoice)

    contact_item_perfect = 0
    contact_item_matched = contact_item_total = 0
    contacts_with_items = 0
    for contact_id, invoices in contact_invoices.items():
        src_items = Counter()
        dst_items = Counter()
        for invoice in invoices:
            src_items.update(orig_items.get(invoice, Counter()))
            dst_items.update(dump_items.get(invoice, Counter()))
        matched, total = match_count(src_items, dst_items)
        contact_item_matched += matched
        contact_item_total += total
        if total:
            contacts_with_items += 1
            if counters_equal(src_items, dst_items):
                contact_item_perfect += 1

    adapt_customers = len(adapt_cust_invoices)
    report = {
        "invoices_in_dump_and_db": len(contacts),
        "invoices_found_in_adapt_header_file": len(orig_inv),
        "customer_identity": {
            "phone_match_pct": pct(phone_match, phone_compared),
            "phone_matched": phone_match,
            "phone_compared": phone_compared,
            "name_exact_pct": pct(name_exact, name_compared),
            "name_normalized_pct": pct(name_norm, name_compared),
            "name_compared": name_compared,
        },
        "customer_purchase_history": {
            "adapt_customers_with_imported_invoices": adapt_customers,
            "history_kept_on_one_cosmo_contact_pct": pct(intact, adapt_customers),
            "intact_customers": intact,
            "split_across_contacts": split,
            "item_lines_matching_pct": pct(item_matched_c, item_total_c),
            "customers_with_perfect_item_set_pct": pct(item_perfect_customers, customers_with_items),
            "customers_with_items": customers_with_items,
            "split_examples": split_examples,
        },
        "item_wise_purchase_history": {
            "by_invoice_line_match_pct": pct(item_matched, item_total),
            "invoices_with_perfect_item_set_pct": pct(invoices_items_perfect, invoices_with_items),
            "invoices_with_items": invoices_with_items,
            "matched_lines": item_matched,
            "original_product_lines": item_total,
            "by_cosmo_contact_line_match_pct": pct(contact_item_matched, contact_item_total),
            "cosmo_contacts_with_perfect_item_set_pct": pct(contact_item_perfect, contacts_with_items),
            "cosmo_contacts_with_adapt_items": contacts_with_items,
        },
        "note": (
            "Customer purchase history: Adapt customer_master_id (else phone) invoice set vs Cosmo Contact Master. "
            "Intact = all of that person's imported invoices sit on one contact. "
            "Item-wise ignores coupon/shipping/fee lines. Newline differences in titles are treated as the same item."
        ),
    }
    OUT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
