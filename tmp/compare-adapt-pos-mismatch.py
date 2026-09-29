import csv
import json
from collections import Counter, defaultdict
from pathlib import Path

csv.field_size_limit(32 * 1024 * 1024)


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


def line_key(invoice, sku, title, quantity, price):
    return (
        (invoice or "").strip(),
        (sku or "").strip(),
        (title or "").strip(),
        qty(quantity),
        money(price),
    )


dump_inv = set()
dump_pos = {}
dump_lines = defaultdict(Counter)
with Path(r"tmp/full-history-export/sales.csv").open(encoding="utf-8-sig", newline="") as handle:
    reader = csv.DictReader(handle)
    for row in reader:
        if row.get("DATA_SOURCE") != "Adapt history":
            continue
        invoice = row["INVOICE_NO"].strip()
        dump_inv.add(invoice)
        dump_pos[invoice] = row.get("POS_SALE") or "0"
        dump_lines[invoice][
            line_key(invoice, row["SKU"], row["PRODUCT_TITLE"], row["QUANTITY"], row["UNIT_PRICE"])
        ] += 1

orig_lines = defaultdict(Counter)
for path in sorted(Path(r"C:\Users\Bad-Boy\Downloads\ADAPT DB\ADAPT DB").glob("*/Untitled.csv")):
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            code = (row.get("item_code") or "").strip().lower()
            if code in {"coupon", "shipping", "fee"}:
                continue
            invoice = (row.get("sales_invoice_no") or "").strip()
            orig_lines[invoice][
                line_key(invoice, row.get("item_code"), row.get("item_name"), row.get("quantity"), row.get("unit_price"))
            ] += 1

mismatch_examples = []
mismatch_invoices = 0
for invoice in dump_inv:
    src = orig_lines[invoice]
    dst = dump_lines[invoice]
    if src == dst:
        continue
    mismatch_invoices += 1
    missing = [(k, src[k] - dst.get(k, 0)) for k in src if src[k] > dst.get(k, 0)]
    extra = [(k, dst[k] - src.get(k, 0)) for k in dst if dst[k] > src.get(k, 0)]
    if len(mismatch_examples) < 8:
        mismatch_examples.append({"invoice": invoice, "missing": missing[:3], "extra": extra[:3]})

print("mismatch_invoices", mismatch_invoices)
print(json.dumps(mismatch_examples, indent=2)[:3000])

pos = Counter()
compared = 0
with Path(r"C:\Users\Bad-Boy\Downloads\Archive (5)\invoice_data_headers.csv").open(
    encoding="utf-8-sig", newline="", errors="replace"
) as handle:
    reader = csv.reader(handle)
    headers = [h.strip().strip('"') for h in next(reader)]
    lower = {h.lower(): i for i, h in enumerate(headers)}
    i_inv = lower["sales_invoice_no"]
    i_pos = lower["pos_flag"]
    seen = set()
    for row in reader:
        if i_inv >= len(row):
            continue
        invoice = row[i_inv].strip()
        if invoice not in dump_inv or invoice in seen:
            continue
        seen.add(invoice)
        compared += 1
        flag = row[i_pos].strip() if i_pos < len(row) else ""
        dump = "1" if dump_pos.get(invoice) == "1" else "0"
        src = "1" if flag in {"1", "true", "True", "YES", "yes"} else "0"
        if src == dump:
            pos["match"] += 1
        elif src == "1" and dump == "0":
            pos["adapt_pos_dump_not"] += 1
        else:
            pos["dump_pos_adapt_not"] += 1

print("pos compared", compared, dict(pos))
print("dump pos=1 invoices", sum(1 for value in dump_pos.values() if value == "1"))
print("adapt pos=1 vs dump", pos["adapt_pos_dump_not"])
