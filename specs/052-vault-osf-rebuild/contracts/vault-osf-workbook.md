# Contract: Vault OSF Workbook Layout

**Feature**: `052-vault-osf-rebuild`
**Date**: 2026-09-09

Single **Main** sheet. No Cosmo buyer sheets, no Info sheet Cosmo extras
(`% of ROP`, OGF, margins). A short Info sheet may list `asOfDate`, sales
window, ERP instances used, and row count.

Two header rows: section band (row 1) + column header (row 2). Data from row 3.

## Column blocks (left to right)

Identity → ROP → Stock → Manual notes → repeating month groups (sales then
purchases) → pricing → derived → reorder quantity → latest supplier.

### Identity

| Header | Source | Blank when |
|--------|--------|------------|
| Variant SKU | ERP1 `Item.name` | never (row key) |
| SKU | ERP1 `Item.item_code` | never |
| Barcode | ERP1 barcode / OS barcode | unknown |
| Priority Status | `ProductItem.erp1ProductPriority` | unmatched OS row |
| Country | ERP1 `country_of_origin` | unset |
| Category | ERP1 `item_group` | unset |
| Brand | ERP1 `brand` | unset |
| Item | ERP1 `item_name` | unset |

No spacer column E.

### ROP

Section: `ROP`

| Header | Source |
|--------|--------|
| SV | `ProductOsfRop` for `sv` |
| ORI | `ori` |
| AE | `ae` |
| Total ROP | sum of set values |

Headers MUST NOT carry percentage shares. Unset ROP → blank, not 0.

### Stock

Section: `Stock ({asOfDate})`

| Header | Source |
|--------|--------|
| SV | ERP1 Bin, `Main Warehouse - SV-1` |
| ORI | ERP2 Bin, `Main Warehouse - Origins` |
| AE | ERP2 Bin, `Main Warehouse - AE` |
| Total | sum |

Warehouse with no bin row → `0` (item exists, qty is zero). Origins Online
warehouses are never queried.

Dropped vs the manual sheet: New Malinda, New USA, Buffer stock.

### Manual notes

| Header | Value |
|--------|-------|
| remark | empty |
| AK1 | empty |
| AK2 | empty |

### Per-month sales group

One group per month from April of the reporting year through the as-of month.

Section: `{MONTH NAME}` for completed months; `{MONTH NAME} {asOfDate}` for the
current (truncated) month. Example: `SEPTEMBER 07.09.2026`.

| Header | Source |
|--------|--------|
| SV / ORI / AE | ERP Sales Invoice signed qty for that company, else imported history |
| Total {Month} | sum of the three; blank if all three blank |

Current month covers 1st through `asOfDate` inclusive. Returns net via negative
qty. Empty history → blank cells, not 0.

### Per-month purchase pair

Immediately after each month's sales group (or as a trailing pair-per-month
block after all sales groups — implementer picks one and keeps it consistent;
prefer **after each sales group** so April sales sit next to April purchases).

| Header | Source |
|--------|--------|
| Purch Qty | Sum of allowlisted Purchase Invoice line qty |
| Purch Value | Sum of line `net_amount` (ex-tax) |

No supplier allowlist match → blank. Internal / intercompany lines excluded.

### Pricing

| Header | Source |
|--------|--------|
| MRP | ERP1 Standard Selling |
| Discounted Price | MRP × (1 − item-code pricing rule %). Blank if no applicable rule |

Transaction / coupon / item-group / brand rules ignored. Disabled or out-of-date
rules ignored. Two item-code rules on the same SKU → larger discount.

Dropped: Average 5M block (AX–BA in the sample).

### Derived

| Header | Rule | Blank when |
|--------|------|------------|
| Max sale | max of month totals that have data | no month has data |
| AVE | total stock / max sale | max sale null or 0 |

### Reorder quantity

Section: `Reorder Quantity`

| Header | Rule | Blank when |
|--------|------|------------|
| SV / ORI / AE | ROP − stock (signed; negatives kept) | that unit's ROP unset |
| Total | sum of the three | all three blank |

Unlike Cosmo `TOTAL ORDER QTY`, this is **not** floored at zero.

### Latest supplier

| Header | Source |
|--------|--------|
| Latest price | Newest allowlisted Purchase Invoice line rate across both ERPs |
| Latest price suppliers | `supplier_name` (fallback `supplier`) of that line |

---

## Explicitly absent (must not appear)

New Malinda, New USA, Buffer stock, spacer E, AVER sales 5M / per-location 5M
averages, `% of ROP`, `70% OF TOTAL ROP`, `70% OF TOTAL ROP AVAILABILITY`,
`OGF Price`, margin %, `Last Purchase Date`, `Days Since Last Purchase`,
`Purchased (last 30d)`, Cosmo identity extras (`ERP1 Priority` / `ERP2 Priority`
as separate columns, `Shop Availability`, `Image Src`, `Site Status`).
Priority Status is the single identity status column.

---

## Numeric formatting

- Sale counts, stock, purch qty: integers when whole
- AVE: enough decimals to show cover (Excel number, not percent)
- Money: LKR amounts as numbers, not text
- Blank is an empty cell, never the string `"0"` standing in for missing data
