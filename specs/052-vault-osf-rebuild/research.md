# Phase 0 Research: Supplement Vault OSF

All findings below were verified against the live Supplement Vault ERPs on
2026-09-08 and against the buyer's manual workbook
(`order supporting report-07.09.2026`). No open NEEDS CLARIFICATION items remain.

## R-001: Which ERP holds which business unit

**Decision**
- **SV** → ERP1 `supplement-vault-lk-01`, company `SupplementVault.lk`, stock
  from warehouse `Main Warehouse - SV-1` only.
- **ORI** → ERP2 `supplement-vault-lk-02`, company `Origins (PVT) LTD`, stock
  from `Main Warehouse - Origins`.
- **AE** → ERP2, company `AE (PVT) LTD`, stock from `Main Warehouse - AE`.
- `Origins Online` (SV-2) in ERP2 is excluded entirely.

**Rationale**: Confirmed by listing warehouses in both instances. ERP1 hosts
only `SupplementVault.lk`; ERP2 hosts all three of Origins, AE and Origins
Online. The user confirmed Origins Online was created by mistake and is not a
business unit.

**Consequence worth noting**: SV *stock* is main-warehouse only, but SV *sales*
are company-wide, so SV retail shop sales (GCC, Pepiliyana, Kiribathgoda,
Maharagama, Cool Planet Nugegoda, OGF Shop) count toward the sale column while
their stock does not appear in the stock column. This is what the buyer asked
for — they order for the main warehouse but want total demand — but it means the
two columns are deliberately not like-for-like.

**Alternatives considered**: Rolling all SV-1 warehouses into the stock column
was rejected by the user; shop stock is not available to fulfil wholesale
reorders.

---

## R-002: Reading invoice line items from ERPNext

**Decision**: Use the parent+child "fields-only join" pattern — request child
table columns inside the parent doctype's `fields` array with parent-level
filters only, exactly as `lib/osf/erp-purchases.ts` already does for
`Purchase Receipt`.

```
/api/resource/Sales Invoice
  ?fields=["name","posting_date","company","is_return",
           "`tabSales Invoice Item`.item_code",
           "`tabSales Invoice Item`.qty",
           "`tabSales Invoice Item`.net_amount"]
  &filters=[["docstatus","=",1],["posting_date",">=",...],["posting_date","<=",...]]
```

**Rationale**: Verified live against both ERPs for `Sales Invoice` and
`Purchase Invoice`; both returned one row per line with parent fields repeated.
The child doctypes are not directly queryable by these API users, so this is the
only working shape and it is already battle-tested in this codebase.

**Alternatives considered**: Frappe query reports (`Item-wise Purchase Invoice
History`, which the user pointed at) return the right data but are an unstable
interface — column order and report parameters change between ERPNext versions,
and the endpoint requires report-level permissions. The raw resource API gives
the same numbers with a contract we control.

---

## R-003: Netting returns out of the sale count

**Decision**: Filter `docstatus = 1` and sum `qty` across all lines, including
return invoices. Do not special-case `is_return`.

**Rationale**: Verified that ERP1 return invoices carry `is_return = 1` with
negative line quantities (`ACC-SINV-SV100-2026-00015` → `NW052-1` qty `-1`).
Summing signed quantities therefore nets returns automatically. Cancelled
documents carry `docstatus = 2` and are excluded by the filter; drafts are
`docstatus = 0` and likewise excluded.

**Alternatives considered**: Fetching returns separately and subtracting was
rejected as redundant and easy to double-count.

---

## R-004: Pagination volume for a multi-month line scan

**Decision**: Page the sales and purchase scans **one month at a time** per ERP
company, rather than one scan across the whole April-to-date window. Keep the
existing 500-row page size; the per-month partition keeps each query well inside
the page-count guard and makes bucketing trivial since every row in a batch
already belongs to a known month.

**Rationale**: `lib/osf/erp-purchases.ts` guards at 500 rows × 60 pages =
30,000 lines. A single scan of six months of retail sales invoice lines across
SV can plausibly exceed that, and the current code silently stops at the cap
rather than failing — which would understate sales with no visible error. Month
partitioning bounds each query and turns a silent truncation into an
impossible-by-construction case.

**Consequence**: More round trips (months × companies × 2 doctypes). Fetch them
with bounded concurrency and expect generation to take longer than the current
Cosmo OSF.

**Alternatives considered**: Raising `MAX_PAGES` was rejected because it treats
the symptom; the truncation would still be silent, just later.

---

## R-005: Source for MRP and discounted price

**Decision**: MRP is the ERP1 `Item Price` row on the `Standard Selling` price
list. Discounted Price is that MRP reduced by the single applicable ERP1
`Pricing Rule` where `apply_on = "Item Code"`, `selling = 1`, `disable = 0`, the
as-of date falls within `valid_from`/`valid_upto`, and the item appears in the
rule's `items` child table. When no such rule applies, Discounted Price is blank.

**Rationale**: Verified end-to-end. ERP1 exposes only `Standard Selling` and
`Standard Buying`, and `Standard Selling` equals `Item.standard_rate`
(`BG005-1` = 23,500 on both). `NW004-2` sells at 9,500 and is listed in
`PRLE-0015 "Tabloid 10% - SEPT"` (`apply_on = Item Code`, 10%); 9,500 × 0.9 =
8,550, which is exactly the Discounted Price in the buyer's manual workbook.
Items with no rule show 0 in the manual sheet (`BV001-1`, `RE001-1`), matching
"blank" in the generated file.

**Explicitly excluded**: rules with `apply_on = "Transaction"` (5% Cash Discount,
LOYAL CS 10%/15%, STAFFDC, DIR100), any `coupon_code_based` rule, and rules with
`apply_on` of `Item Group` or `Brand` — the user specified item-wise rules only.
Disabled rules (`disable = 1`) and expired rules are skipped.

**Alternatives considered**: Creating a second "Discounted Price" price list in
ERP1 was offered and rejected — the team already expresses discounts as pricing
rules and does not want a parallel structure to maintain.

**Open data-hygiene assumption**: If two item-code rules ever cover the same item
on the same date, take the larger discount. ERPNext would use `priority`, but
every rule currently has an empty priority so there is nothing to sort on.

---

## R-006: Excluding internal transfers from purchases

**Decision**: Count only `Purchase Invoice` lines whose `supplier` or
`supplier_name` matches an entry in the Vault OS `Supplier` table, reusing
`buildSupplierAllowlist` / `isAllowedSupplier` from `lib/osf/erp-purchases.ts`.
Purchase value is the line `net_amount` (excludes tax).

**Rationale**: This is what the user asked for and it is already implemented and
tested for the Cosmo flow. Inspection of ERP2 suppliers shows no supplier has
`is_internal_supplier` set, so a doctype- or flag-based filter would catch
nothing. Real suppliers sit in the `Distributor` group (`SV001`–`SV036`) while
non-stock noise sits elsewhere (`DIALOG BILL` in Local, `Hutch bill` in
Electrical, `Payable` in Services) — the Vault OS supplier list already draws
that line, and drawing it in one place keeps ERP and OS in agreement.

**Alternatives considered**: Filtering on `supplier_group = "Distributor"` was
rejected as an ERP-side convention that the OS cannot enforce; the OS supplier
table is the authoritative list per the spec.

---

## R-007: Document type for latest price and latest supplier

**Decision**: Use `Purchase Invoice` for both the monthly purchase grid and the
latest price / latest supplier columns, scanning both ERPs and letting the most
recent `posting_date` win.

**Rationale**: The existing Cosmo flow reads `Purchase Receipt`. Using two
different doctypes in one workbook would let the "latest price" disagree with
the last month that shows purchase value, which is exactly the kind of
discrepancy the buyer would have to chase manually. The user pointed at the
item-wise *Purchase Invoice* history as their source of truth, so Purchase
Invoice is the tenant's costing document.

**Alternatives considered**: Keeping `Purchase Receipt` for the latest-price
columns to reuse `fetchLastPurchaseByItem` verbatim was rejected for the
consistency reason above. The reducer logic is still worth mirroring closely.

---

## R-008: Row source for the workbook

**Decision**: One row per ERP1 `Item` with `disabled = 0` and
`is_stock_item = 1`, left-joined to the Vault OS `ProductItem` on SKU for
Priority Status.

**Rationale**: The user chose ERP1 items as the row source. The
`is_stock_item` filter is required — live ERP1 sales invoices contain
`DELIVERY-CHARGES` and `TEST` line items that must never become catalog rows.
Priority Status is not an ERP field; it lives on `ProductItem.erp1ProductPriority`
and is maintained in Vault OS.

**Consequence**: An ERP1 item with no matching `ProductItem` still appears, with
a blank Priority Status. This is correct — the buyer needs to see the item — but
it makes unmatched SKUs visible, which is useful.

**Alternatives considered**: Keeping `buildCatalogRows` (OS `ProductItem`) was
rejected by the user; items live in the ERP first and reach the OS catalog only
if they are web-listed.

---

## R-009: Where the ERP company name lives

**Decision**: Add a nullable `erpCompany` text column to `OsfColumnConfig`.

**Rationale**: Stock is scoped by warehouse, which the column config already
models via `directWarehouses` + `erpnextInstanceId`. Sales and purchases are
scoped by ERP **company**, which has no representation anywhere in the schema
today. Deriving the company from the warehouse name suffix (`- SV-1`, `- AE`,
`- Origins`) would be a brittle string convention. A nullable column is additive,
leaves every Cosmo row untouched, and keeps all three scopes for a business unit
declared in one place.

**Alternatives considered**: A separate `OsfColumnErpCompany` join table was
rejected as over-modelling for a one-to-one string; a hardcoded map in
`lib/vault-osf/columns.ts` was rejected because it would make the mapping
invisible to the settings UI the team already uses to manage columns.

---

## R-010: Storing the manually imported April/May history

**Decision**: New `OsfMonthlySalesHistory` model keyed by
`(companyId, sku, columnKey, month)` holding a unit quantity. Generation prefers
live ERP figures for any month that has ERP data and falls back to this table
otherwise; a month with neither renders blank.

**Rationale**: April and May predate every invoice in both ERPs (earliest
posting date in either instance is 2026-06-01), so there is no source to read
them from. Reusing the `columnKey` convention already used by `ProductOsfRop`
keeps the import template shape identical in spirit to the ROP template the team
already knows.

**Alternatives considered**: Back-dating invoices into the ERP was offered and
rejected by the user. Storing a general-purpose monthly sales cache for all
months was rejected — caching live-readable data invites staleness bugs for no
benefit at this scale.

---

## R-011: Blank versus zero

**Decision**: Emit an empty cell (not `0`) for: a month with no loaded history,
an unset reorder point, the reorder quantity derived from an unset reorder
point, a month with no purchases, a discounted price with no applicable rule,
and months of cover when max sale is zero or unavailable.

**Rationale**: The manual workbook writes `0` throughout, but `0` conflates "no
data loaded yet" with "genuinely nothing happened". That distinction matters
most for April and May, which are structurally empty until the import lands, and
for reorder points, which are blank until the team uploads them — showing `0`
there would make every SKU look fully stocked against a zero threshold.

**Alternatives considered**: Matching the manual sheet's `0` exactly was
rejected; it would also break the max-sale calculation, which must ignore
unloaded months rather than treat them as zero-sale months.
