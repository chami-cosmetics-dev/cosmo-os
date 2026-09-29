import csv
import json
import re
from collections import defaultdict
from pathlib import Path

csv.field_size_limit(32 * 1024 * 1024)

INVOICE_FILE = Path(r"C:\Users\Bad-Boy\Downloads\Archive (5)\invoice_data_headers.csv")
CONTACT_CSV = Path(r"C:\dev\cosmo-os\tmp\full-history-export\adapt-invoice-contacts.csv")


def canon_phone(value: str) -> str:
    digits = re.sub(r"\D", "", value or "")
    if digits.startswith("00"):
        digits = digits[2:]
    if digits.startswith("94") and len(digits) >= 11:
        digits = "0" + digits[2:]
    if len(digits) == 9:
        digits = "0" + digits
    if len(digits) == 12 and digits.startswith("940"):
        digits = "0" + digits[3:]
    return digits


contacts = {}
with CONTACT_CSV.open(encoding="utf-8-sig", newline="") as handle:
    for row in csv.DictReader(handle):
        contacts[(row.get("invoice_no") or "").strip()] = (row.get("contact_id") or "").strip()

needed = set(contacts)
cust_phones = defaultdict(set)
cust_invoices = defaultdict(set)
cust_contacts = defaultdict(set)

with INVOICE_FILE.open(encoding="utf-8-sig", newline="", errors="replace") as handle:
    reader = csv.reader(handle)
    headers = [h.strip().strip('"') for h in next(reader)]
    idx = {h.lower(): i for i, h in enumerate(headers)}
    i_inv = idx["sales_invoice_no"]
    i_cust = idx["customer_master_id"]
    i_phone = idx["customer_tp"]
    i_raw = idx.get("customer_tp_raw")
    seen = set()
    for row in reader:
        if i_inv >= len(row):
            continue
        invoice = row[i_inv].strip()
        if invoice not in needed or invoice in seen:
            continue
        seen.add(invoice)
        cust = row[i_cust].strip() if i_cust < len(row) else ""
        phone = canon_phone(row[i_phone] if i_phone < len(row) else "")
        if not phone and i_raw is not None and i_raw < len(row):
            phone = canon_phone(row[i_raw])
        key = cust or (f"phone:{phone}" if phone else f"inv:{invoice}")
        cust_invoices[key].add(invoice)
        if phone:
            cust_phones[key].add(phone)
        if invoice in contacts:
            cust_contacts[key].add(contacts[invoice])

shared = []
real_intact = real_split = 0
real_customers = 0
phone_customers = 0

for key, invoices in cust_invoices.items():
    phones = cust_phones[key]
    n_contacts = len(cust_contacts[key])
    if len(phones) >= 10 or len(invoices) >= 200:
        shared.append((key, len(invoices), len(phones), n_contacts))
        continue
    real_customers += 1
    if n_contacts == 1:
        real_intact += 1
    else:
        real_split += 1

print("shared_adapt_ids", len(shared))
print("top_shared", sorted(shared, key=lambda x: -x[1])[:12])
print("real_customers", real_customers, "intact", real_intact, "split", real_split)
print("real_intact_pct", round(100 * real_intact / real_customers, 2) if real_customers else 0)

# Phone-level: one Adapt phone should map to one Cosmo contact
phone_invoices = defaultdict(set)
phone_contacts = defaultdict(set)
inv_phone = {}
with INVOICE_FILE.open(encoding="utf-8-sig", newline="", errors="replace") as handle:
    reader = csv.reader(handle)
    headers = [h.strip().strip('"') for h in next(reader)]
    idx = {h.lower(): i for i, h in enumerate(headers)}
    i_inv = idx["sales_invoice_no"]
    i_phone = idx["customer_tp"]
    i_raw = idx.get("customer_tp_raw")
    seen = set()
    for row in reader:
        if i_inv >= len(row):
            continue
        invoice = row[i_inv].strip()
        if invoice not in needed or invoice in seen:
            continue
        seen.add(invoice)
        phone = canon_phone(row[i_phone] if i_phone < len(row) else "")
        if not phone and i_raw is not None and i_raw < len(row):
            phone = canon_phone(row[i_raw])
        if phone:
            phone_invoices[phone].add(invoice)
            phone_contacts[phone].add(contacts[invoice])

p_intact = p_split = 0
for phone, invoices in phone_invoices.items():
    phone_customers += 1
    if len(phone_contacts[phone]) == 1:
        p_intact += 1
    else:
        p_split += 1

print("phone_customers", phone_customers)
print("phone_intact", p_intact, "split", p_split)
print("phone_intact_pct", round(100 * p_intact / phone_customers, 2) if phone_customers else 0)

# invoices whose Adapt phone matches Cosmo contact phone — already have 99.47
# share of invoices belonging to intact phone histories
inv_intact = sum(len(phone_invoices[p]) for p in phone_invoices if len(phone_contacts[p]) == 1)
inv_all = sum(len(v) for v in phone_invoices.values())
print("invoice_share_on_intact_phone_history_pct", round(100 * inv_intact / inv_all, 2) if inv_all else 0)
print("invoices_with_phone", inv_all)
