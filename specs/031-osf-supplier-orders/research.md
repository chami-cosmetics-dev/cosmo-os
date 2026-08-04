# Research: OSF Supplier Orders

**Feature**: `031-osf-supplier-orders` | **Date**: 2026-08-04

## R1 — Where the builder lives

**Decision**: New section on the existing OSF hub (`OsfHubPanel` at `/dashboard/purchasing/osf`), not a separate page and not inside the full OSF workbook generate panel.

**Rationale**: Spec adds to OSF item filtering / purchasing workflow; hub already hosts generate, ROP import, column access. Keeps one purchasing entry point.

**Alternatives considered**:
- Separate `/purchasing/supplier-orders` route — more nav clutter; rejected for v1.
- Embed only inside generate panel — conflates workbook export with supplier PO drafts.

## R2 — Brand = Vendor

**Decision**: Brand filter options are Cosmo `Vendor` records (`ProductItem.vendor`); filter by `vendorId` / vendor name matching OSF workbook `Brand` column.

**Rationale**: Catalog already maps brand → `vendor.name`; vendors API already used by generate panel.

**Alternatives considered**: Free-text brand string — inconsistent with catalog; rejected.

## R3 — Priority / newly added / VAT filters

**Decision**: Reuse ERP product priority strings from `lib/product-items/erp-priority-options.ts` (`Top Priority`, `Priority`, `Newly Added`, `Vat`, etc.), same exact-match behavior as OSF generate / assist (`erp1ProductPriority` / `erp2ProductPriority`).

**Rationale**: Matches what buyers already use on OSF generate; avoids dual taxonomy confusion with Cosmo `itemStatusCategory`.

**Alternatives considered**: Cosmo `itemStatusCategory` enum — not what generate filters on today; deferred.

## R4 — Reorder qty = TOTAL ORDER QTY

**Decision**: Read-only reorder qty on each working row is the same **TOTAL ORDER QTY** as OSF Main sheet: per-warehouse `orderQty(rop, stock)`, then `sumSignedOrderQtysFlooredAtZero`. Captured when the item is added (and returned on item search so users see qty before add).

**Rationale**: Spec clarification — display-only OSF order quantity; formulas already in `lib/osf/formulas.ts` + column build in `build-workbook.ts`.

**Alternatives considered**:
- Editable qty — rejected in clarify (Option A).
- Per-location order columns only — user asked for single reorder qty for supplier split.

## R5 — Item search with empty query

**Decision**: `GET .../supplier-orders/items` accepts optional `q`, optional `vendorId`, optional `priority`. Empty `q` returns the filtered set (paginated: `limit`/`cursor` or `page`). Each row: `sku`, `description`, `reorderQty`, `vendorId`, `vendorName`. Client shows list on focus; typing sends `q` (debounce) for server-side filter on SKU/description.

**Rationale**: Spec requires list-without-typing; large catalogs need pagination. Server-side filter keeps truth with stock/ROP compute.

**Alternatives considered**:
- Load entire catalog client-side — unsafe at scale.
- Client-only filter after one big fetch — same problem without brand.

## R6 — Computing TOTAL ORDER QTY for search pages

**Decision**: For each page of matching product items, load Cosmo ROPs + ERP stock for those SKUs’ warehouses (same sources as generate), compute TOTAL ORDER QTY in process. Do **not** run a full-company OSF generate for search.

**Rationale**: Generate is heavy (full catalog + OGF sync). Search pages are SKU-scoped batches.

**Alternatives considered**: Approximate qty from last generated workbook — stale; rejected. Cache in DB — out of scope / migration.

## R7 — Multi-supplier allocation rules

**Decision**: Validate on client and server at generate: ignore qty ≤ 0; require at least one positive allocation in the draft; if row `reorderQty > 0`, sum(positive supplier qtys) must be **≤** `reorderQty` (block over-allocation). Under-allocation and empty suppliers allowed.

**Rationale**: Clarify session answers.

**Alternatives considered**: Require exact sum = reorder — rejected by user.

## R8 — Supplier picker ordering

**Decision**: List allowlisted company suppliers (same allowlist as OSF). Sort: suppliers with purchase history for **this SKU** by most recent purchase first; then other allowlisted suppliers (optionally by company-wide recent). Reuse `fetchSupplierPurchasesBySku` / allowlist helpers from `lib/osf/erp-purchases.ts` and recency ideas from `supplier-compare.ts` (no need for Best Option labels in this UI).

**Rationale**: Spec: “recently supplier top of list”; 014 already solved ERP history + allowlist.

**Alternatives considered**: Only suppliers with history for SKU — too narrow when buyer wants a new supplier on allowlist.

## R9 — Draft persistence

**Decision**: Persist working table + allocations in `localStorage` under a versioned key (e.g. `osf_supplier_orders_draft_v1`), scoped by `companyId` + `userId` when available. Clear action wipes key. Pattern mirrors sticker-batch draft.

**Rationale**: Clarify — same browser/device until clear; no server draft / migration.

**Alternatives considered**: Server-side draft table — deferred. SessionStorage — lost on tab close; weaker than clarify intent.

## R10 — Generate packaging

**Decision**: Build one minimal Excel (ExcelJS or lightweight sheet) per supplier with columns SKU, description, order qty; package with existing `createZip` from `lib/falcon-upload.ts`; `POST` returns `application/zip`.

**Rationale**: Clarify — single zip; repo already has `createZip` and ExcelJS; no new npm zip dependency.

**Alternatives considered**: Multi-sheet workbook — rejected. Multiple browser downloads — rejected. Add jszip — unnecessary.

## R11 — Permissions

**Decision**: Same access class as OSF generate / purchasing tools (existing OSF permission checks used by `/api/admin/osf/generate`). Panel visible when user can use OSF purchasing features.

**Rationale**: Spec FR-015.

**Alternatives considered**: New dedicated permission — overkill for v1.

## R12 — Page-data aggregation

**Decision**: `GET .../supplier-orders/page-data` returns brands (vendors), priority options, and any static config in one auth’d round-trip. Item search and per-SKU suppliers remain separate endpoints (query-dependent).

**Rationale**: Matches repo performance rule for page bootstrap; avoids stuffing searchable catalog into page-data.

**Alternatives considered**: Only client parallel fetches to `/vendors` + `/product-items/page-data` — works but duplicates OSF generate’s multi-fetch; prefer one OSF-scoped page-data.
