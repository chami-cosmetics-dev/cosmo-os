# Research: Store Stock Count

**Feature**: `044-stores-stock-count` | **Date**: 2026-08-24

## R1 — Permission and nav

**Decision**: New key `store.stock_count.read`. Add to `DEFAULT_PERMISSIONS`. Pin onto `stores-level-01` and `stores-level-02` via `PINNED_CUSTOM_ROLE_PERMISSIONS` (same pattern as `store.allocation.read`). Sidebar **Store** group visible if user has allocation **or** stock-count; two nav items. Page + APIs use `requireStoreStockCountAccess` mirroring `lib/store-allocation/auth.ts`.

**Rationale**: Spec audience is store users, not purchasing. Reusing `store.allocation.read` would force every allocator to see stock count and vice versa.

**Alternatives considered**:
- Reuse `store.allocation.read` — rejected (different job, coupled grants).
- Reuse `reports.stock_comparer` — rejected (Cosmetics file comparer, wrong users).

## R2 — Company picker source

**Decision**: List ERPNext **Company** doctypes from **every** configured `ErpnextInstance` for the current OS `companyId` (`getAllOsfErpInstances`). Identity is `{ instanceId, erpCompany }` (name as ERP returns it), plus `instanceLabel` for duplicate names across the two ERPs. Do **not** build the picker only from `CompanyLocation.erpnextCompany`.

**Rationale**: Spec FR-001: companies come from ERP side. OS locations can omit unused ERP companies.

**Alternatives considered**:
- OS locations only — rejected (spec: ERP companies).
- Hardcoded Cosmetics outlet list — rejected (Vault + Cosmo, four ERPs).

## R3 — “All items” catalog

**Decision**: For the ERP instance that owns the requested company, paginate `Item` with filters `disabled=0` and `is_stock_item=1` (page size 500, cap aligned with `lib/product-items/erp-priority-sync.ts` `MAX_PAGES`). Fields: `item_code`, `item_name`, `description`, `barcode`. Include zero-stock items. Merge SKUs case-insensitively (`normalizeSkuKey`).

**Rationale**: ERP item master is company-global; membership for the count list is “stock item on that ERP”, stock figures are company-scoped (R4). Matches spec “all items” including zeros so floor extras can be scanned.

**Alternatives considered**:
- OS `ProductItem` only — rejected (Shopify catalog ≠ ERP barcodes/items).
- Bins only (items that already have a bin) — rejected (never-stocked SKUs missing).
- Stock Balance report — extra report perms/shape; still weak on true zeros. Prefer Item + Bin.

## R4 — Company-wise live stock

**Decision**: Warehouses: ERP `Warehouse` where `company = erpCompany` and `is_group = 0` (and `disabled = 0` when the field exists). Stock: paginate `Bin` for those warehouses (`item_code`, `warehouse`, `actual_qty`) **without** an item-code `in` filter. Sum `actual_qty` per `item_code` for that company. Missing bin → **0** (true empty). ERP HTTP failure → stock **unavailable** (`null`), never fake 0.

**Rationale**: Spec is company-level on-hand, not an OS warehouse picker. Existing `fetchBinActualQty` batches 80 SKUs — thousands of SKUs would explode round-trips.

**Alternatives considered**:
- Reuse `fetchBinActualQty` — rejected (wrong access pattern).
- `CompanyLocationWarehouse` only — rejected (OS mapping can miss ERP warehouses; spec is ERP company).
- Stock Ledger as-at today — heavier; Bin is current on-hand.

## R5 — Barcodes

**Decision**: Union (1) Item.barcode field from the Item page and (2) paginated `Item Barcode` child (`parent` = item_code, `barcode`). Scan match: trim; exact string match against that item’s barcode list; if no hit, try a second pass with digits-only equality when both sides have digits. **Do not** require `isValidPickListBarcode` (min 4 digits) — floor codes follow ERP, not pick-list PDF rules.

**Rationale**: `lib/product-item-barcode.server.ts` already reads Item.barcode + barcodes[]; per-SKU GET Item is too slow for a full catalog. Child-table dump is one paginated loop per ERP instance (cache on the instance for the request if several companies share it).

**Alternatives considered**:
- Per-item GET Item — rejected (timeout).
- ProductItem.barcode only — stale / incomplete vs floor ERP labels.

## R6 — API chunking vs timeout

**Decision**: `POST /api/admin/store-stock-count/items` accepts **exactly one** `{ instanceId, erpCompany }`. `export const maxDuration = 60`. Client confirms multi-select then loads companies **one after another**, merging rows, showing which company is loading. Refresh stock = same POST per selected company; client keeps `count` by SKU.

**Rationale**: Vercel/serverless + full Item/Bin dump for many companies in one handler will blow 60s. Per-company keeps failure isolation (spec: one company fail ≠ wipe counts; that company’s stock cells unavailable).

**Alternatives considered**:
- One POST with all companies — timeout risk.
- Background job + poll — extra moving parts, not needed for v1.

## R7 — Client session (counts)

**Decision**: Counts live in React state (`sku → number | null`, `null` = not counted). No `localStorage`, no DB. Changing company set with any non-null count → confirm, then drop counts. Clear-all → all `null`. Scan +1 only when match is unique.

**Rationale**: Spec session-only (edge case: leave page loses counts). Avoids Constitution I migration for a v1 worksheet.

**Alternatives considered**: Saved count documents — out of spec v1.

## R8 — Difference

**Decision**: Pure `difference(count: number | null, stockSum: number | null): number | null`. `count === null` → `null` (not counted). `stockSum === null` (any selected company unavailable on that row) → `null` (don’t show a fake over/short). Else `count - stockSum`. `stockSum` = sum of numeric company stocks on the row (0s included). Typed `0` is counted.

**Rationale**: Spec FR-010 + edge case “unavailable ≠ 0”.

**Alternatives considered**: Treat unavailable as 0 — rejected (looks like a true empty warehouse).

## R9 — Scan UX

**Decision**: Persistent barcode field, `autoFocus`. After each confirm (Enter / scanner suffix), clear field and refocus unless a **count** input is focused. Highlight: `data-sku` row + `scrollIntoView({ block: "center" })`. Ambiguous barcode: `notify.error`, increment nothing. Unknown: `notify.error`, increment nothing. Empty Enter: no-op. Page-level capture of scanner keys is **out** while user edits a count cell.

**Rationale**: Same keyboard-wedge idea as store allocation lookup, but increment-in-list instead of add-to-session-list.

**Alternatives considered**: Camera barcode — out of v1. Global key logger while typing count — would corrupt qty.

## R10 — Large list rendering

**Decision**: Render a windowed table body (fixed row height, ~80 DOM rows) in the panel **without** a new dependency. If UAT with a real catalog is unusable, then add `@tanstack/react-virtual` in implement — not in this plan by default (Constitution V).

**Rationale**: Several thousand rows must stay scannable (highlight + scroll still work via row map / index).

**Alternatives considered**: Full `<table>` of 15k `<tr>` — likely jank. New virtualizer package on day one — extra dep without proof.

## R11 — Agent context script

**Decision**: Skip — repo has no `.specify` `update-agent-context` script (same as 041–043).

**Rationale**: Plan + research + contracts are the implement context.
