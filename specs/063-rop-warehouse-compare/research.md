# Research: ROP Warehouse Compare

**Feature**: `063-rop-warehouse-compare` | **Date**: 2026-10-08

## R1 — Extend Stock Comparer in place

**Decision**: Keep page `/dashboard/purchasing/stock-comparer`, API `GET /api/admin/reports/stock-comparer`, and permission `reports.stock_comparer`. Add Shops and Compare tabs beside the existing main and brand tabs.

**Rationale**: Spec FR-001 and FR-017. Constitution V forbids a parallel page. 060 already owns this screen.

**Alternatives considered**:

- New permission or sibling page — rejected (same audience).
- Rebuild on OSF below-threshold or Item Trends — rejected (those answers are different; see R2 and R8).

## R2 — Do not reuse the OSF below-threshold list

**Decision**: Do not call `listBelowThresholdSkus` or `isBelowReorderThreshold`.

**Rationale**:

- That list compares **company total stock / total ROP**, not one warehouse.
- `isBelowReorderThreshold` is **strictly below** (`<`) and treats a blank cutoff as **70**.
- Spec is **inclusive** (`<=`) on **each watched warehouse’s own** reorder point, with a user-entered percent from 0 through 100 (including 0). Blank percent must not silently become 70.

**Alternatives considered**:

- Pass `maxPercent` into `listBelowThresholdSkus` — still the wrong grain (company total).
- Read `ProductOsfProfile.reorderThresholdPercent` as the run percent — that field is a per-SKU OSF default, not this report’s input.

## R3 — Inclusive percent test

**Decision**: Hit when reorder point `> 0` and `stock * 100 <= rop * percent`. Missing, non-finite, or `<= 0` reorder point → not a hit (`ropMissing`). Negative stock is a hit when reorder point is positive. Percent must be a finite number from 0 through 100 inclusive; otherwise `400` and the percent sections are not computed. Existing `threshold` parsing stays as it is.

`percentOfRop` may still format the displayed ratio. Inclusion uses the integer comparison above so 30% of 100 includes stock 30 and excludes 31.

**Rationale**: Spec FR-002, FR-005, and the worked example. Avoids the strict `<` helper.

**Alternatives considered**:

- `percentOfRop(stock, rop) * 100 <= percent` — same intent, float edge risk. Multiplication comparison is exact for the integer quantities OSF stores.
- Default percent 70 — rejected (spec: blank does not run the percent report).

## R4 — Watched locations

**Decision**:

1. **Cosmetics main** — the OSF column whose warehouse list contains `main warehouse - cosmo` (same match as `MAIN_COSMO_WAREHOUSE`). Stock and the website-OOS flag use **that warehouse’s bin qty only**, not a sum of other warehouses on the column. Reorder point is that column’s `ProductOsfRop.ropQty`. If no column owns that warehouse, fall back to the active `isCosmeticsLkRopColumn` column and say the main warehouse is missing for website-OOS (do not invent a zero main qty from a different bin).
2. **Both other-company warehouses** — every active stock column on the ERP2 instance (same `erpSourceFromLabel` as the current route) that is **not** a shop: `isShopOsfColumn` is false and every warehouse name fails `isShopWarehouseName`. Do not hardcode warehouse names. Expected count is two; if the tenant has a different count, include **all** matches and show the count in the run summary. One hit row per warehouse. Stock is that warehouse’s bin qty. Reorder point is the column’s `ropQty` (shared when one column lists two warehouses).

Website out of stock: Cosmetics main bin qty `<= 0`. Set the flag on a listed row even when the percent hit was an ERP2 warehouse. A main qty of 0 with a missing reorder point is **not** by itself a percent hit (existing absolute-threshold tab still lists it).

Ignore warehouse names that are company-wide totals (`all warehouses`), same as today.

**Rationale**: Spec FR-003 and FR-004. ROP lives on `ProductOsfRop` by column key, not by bin. Shop floors on ERP2 belong on the shops tab.

**Alternatives considered**:

- Sum `stockForColumn` for the percent test — wrong when a column covers more than the watched warehouse.
- Hardcode two ERP2 warehouse names — breaks when OSF columns are renamed.
- Treat every ERP2 warehouse including shops as the primary watch — rejected (spec splits shops).

## R5 — Shops tab working set

**Decision**: Shops tab lists SKUs that are in **either** the existing main-threshold `rows` **or** a Cosmetics-main percent hit. Each row shows main bin qty plus shop locations already produced by `classifyWarehouseKind` / shop-floor pick (one shop, shop floor over back room, qty `<= 0` omitted). Non-shop warehouses are not labeled as shops.

**Rationale**: Spec wants main-versus-shop for replenishment, not a full-catalog dump. Healthy main items stay off this tab. Preview on screen; export the filtered set.

**Alternatives considered**:

- All catalog SKUs — too wide; spec allows preview only as a safety valve, not as the product.
- Percent hits only — would hide threshold-0 main shortages when the user has not entered a percent.

## R6 — Any-warehouse compare

**Decision**: Optional query `focusWarehouse` = exact warehouse name from the run’s warehouse list. Hits are items at or below `ropPercent` using **that warehouse’s bin qty** and the OSF column ROP that lists it. Other locations are positive-qty warehouses **except** the focus warehouse and except `all warehouses` totals. Changing focus requires **Run** again (spec). The warehouse dropdown is filled from the same response (`warehouses`), not a second API.

If the focus warehouse has no owning column or reorder point `<= 0`, the item is not a hit and `ropMissing` is true only when that SKU is otherwise shown. With no positive reorder point, the focus list is empty aside from an explicit “reorder point missing” note for the chosen warehouse when **no** SKU has a positive ROP on that column.

**Rationale**: Spec FR-012 and FR-013. Reuses the Bin map already loaded.

**Alternatives considered**:

- Return a hit list for every warehouse in one payload — large and unused.
- Free-typed warehouse name — rejected (spec: configured stock warehouses only). Unknown name → `400`.

## R7 — Identity filters stay on the client

**Decision**: Server adds `commonSku` (`baseSku`), `erp1ProductPriority`, `erp2ProductPriority`, and `vatStatus` (`vatStatusLabel`) onto ROP-watch, shop, and focus rows. Variant SKU is the row `SKU`. The browser filters:

- Common SKU: trimmed case-insensitive substring of `commonSku`
- Variant SKU: trimmed case-insensitive substring of `SKU`
- Priority: trimmed case-insensitive equality with **either** company priority
- VAT: trimmed case-insensitive equality with `vatStatus`

Set filters AND together. Clearing them shows the full set for that tab. No refetch. Priority choices = `ERP_PRODUCT_PRIORITY_OPTIONS` plus distinct values on the payload. VAT choices = distinct `vatStatus` values on the payload. Blank priority or VAT does not match a selected filter.

Exports use the **filtered** rows of the active tab.

**Rationale**: Spec FR-008–FR-011. Catalog already has these fields via `buildCatalogRows`. Filtering in the browser matches “clear filter → full set” without another ERP pull.

**Alternatives considered**:

- Query-string filters that re-hit ERP — wasted; stock does not change.
- Group rows by common SKU and hide variants — spec asks for a filter, not a rollup. Parent filter shows each matching variant.

## R8 — Leave neighboring tools alone

**Decision**: Do not change `lib/osf/below-threshold-skus.ts`, OSF generate, Item Trends, store allocation, or Shopify Stock Showdown. Do not create transfers.

**Rationale**: Spec FR-016 and the “already available” section. Those tools keep their own rules (company-total 70%, trends, allocation, Shopify qty ≤ 3).

## R9 — API shape

**Decision**: Same GET. Keep `threshold`, `rows`, `brandViolations`, sales, and Critical. Add optional `ropPercent` and `focusWarehouse`. When `ropPercent` is absent, `ropWatch` and `focusCompare` are empty arrays and the existing threshold report still returns. When present, fill `ropWatch`, `shopCompare`, `warehouses`, and `focusCompare` (empty focus array if `focusWarehouse` omitted).

**Rationale**: One Bin pull already feeds both old tabs (060 R7). New sections ride the same call.

**Alternatives considered**:

- Second route — extra auth and a second Bin pull.
- Replace `threshold` with percent — rejected (FR-017).

## R10 — Schema / jobs / agent script

**Decision**: No Prisma models, no migrations, no background job. Skip agent-context update: this repo has no `update-agent-context` script.

**Rationale**: Constitution I. Live bins + existing `ProductOsfRop` + existing catalog fields.
