# Research: Order Support File (OSF) Generator

**Feature**: `006-order-support-file`  
**Date**: 2026-07-16

## R1 — Where to store Shop Availability and ROP (UI-owned)

**Decision**: New company-scoped tables keyed by **normalized SKU** (`ProductOsfProfile` + `ProductOsfRop`), not columns on every `ProductItem` location row.

**Rationale**:
- `ProductItem` is unique per `(companyLocationId, shopifyVariantId)` — the same SKU repeats across locations; OSF needs **one** Shop Availability and one ROP vector per variant SKU.
- Spec requires Cosmo UI maintenance without Excel import (clarifications 2026-07-16).
- Matches Spec Key Entities: ROP Profile + Shop Availability.

**Alternatives considered**:
- Add fields on every `ProductItem` and sync across locations — rejected (duplication, update fan-out).
- Store ROP JSON on a single “main” location ProductItem — rejected (fragile main-location assumption).
- Live ERP reorder fields — rejected by clarification (v1 Cosmo-owned ROP).

## R2 — OSF location / ROP column mapping

**Decision**: `OsfColumnConfig` per company: stable `key`, display `label`, optional `companyLocationId`, `includeInStock`, `includeInRop`, `sortOrder`. Stock for a column = sum of that location’s `erpnextWarehouse` + `CompanyLocationWarehouse` rows. ROP columns without a location (e.g. channel-only) still store ROP by `key`.

**Rationale**: Spec FR-003 — no hard-coded LMJ/LWK constants; ops map labels in settings UI.

**Alternatives considered**:
- Reuse only `CompanyLocation.shortName` — insufficient for OSF labels that don’t match location names (COS ROP, Online site, Cosmetics New).
- Hard-code Cosmetics abbreviations — rejected (Principle V + FR-003).

## R3 — ERP stock source

**Decision**: At generate time, batch-read ERPNext **Bin** (`item_code`, `warehouse`, `actual_qty`) for all warehouses referenced by OSF stock columns and all item codes in the catalog set. Do not use Shopify `inventoryQuantity` unless an explicit fallback mode is enabled later.

**Rationale**: Spec FR-004; Bin is the existing ERP stock doctype already probed in admin ERP tests / MCP.

**Alternatives considered**:
- Persist Bin snapshots nightly — deferred (v1 freshness from live generate is enough; adds cron complexity).
- Shopify inventory only — rejected for ordering (FR-004).

## R4 — Latest cost and supplier

**Decision**: Per item at generate time, resolve **latest cost** and **supplier** from ERP (prefer last Purchase Invoice Item / Stock Ledger valuation pattern already used operationally in ERP; implement via ERP resource list ordered by posting/modified desc). Leave blank if missing (FR-011).

**Rationale**: Spec Field Catalog rows 22–23; Cosmo `Vendor` is brand, not supplier.

**Alternatives considered**:
- Valuation rate on Item master only — may be stale; use as fallback if purchase history empty.
- Manual Cosmo cost field — out of scope for v1.

## R5 — Workbook generation format

**Decision**: Use existing `xlsx` package to build a **Main** sheet matching the business column groups (identity, stock, ROP, calc, pricing including LWK/OGF price + margins, monthly sales). Single-sheet v1; Randil/Inoka filtered sheets = P3.

**Rationale**: Same library as merchant-reviews / dispatch-summary exports; SC-001 sync download.

**Alternatives considered**:
- CSV only — rejected (ops expect XLSX parity).
- Async job + email — deferred unless sync exceeds 5 minutes in UAT.

## R6 — Monthly sales attribution

**Decision**: Sum `OrderLineItem.quantity` joined to `ProductItem.sku` for orders where `financialStatus` is not voided (case-insensitive), `fulfillmentStage` in `delivery_complete` | `invoice_complete`, and month bucket = Asia/Colombo calendar month of `deliveryCompleteAt ?? invoiceCompleteAt`. No return netting (FR-009a).

**Rationale**: Clarification Q3.

**Alternatives considered**:
- `createdAt` month — rejected (clarification).
- Net of returns — deferred.

## R7 — Common SKU grouping

**Decision**: Pure helper `baseSku(sku)` strips a trailing `_digits` or `-digits` suffix (e.g. `CAN07_1` → `CAN07`). Common stock/ROP/reorder = sum across variants sharing that base within the generated row set.

**Rationale**: Clarification Q5.

**Alternatives considered**: Manual map table — deferred.

## R8 — Catalog row identity for OSF

**Decision**: Build one OSF row per distinct non-empty SKU in company `ProductItem` (prefer richest row: barcode/image/status from any location; price from main/online location if configured, else max/any). Item Status from that catalog; Shop Availability / ROP from OSF profile tables.

**Rationale**: Avoid emitting one row per location ProductItem.

**Alternatives considered**: Emit only SKUs that have OSF profiles — rejected (stock-only SKUs must still appear with blank ROP).

## R9 — Authorization

**Decision**: New permissions `purchasing.osf.read` (generate/view) and `purchasing.osf.manage` (edit availability/ROP/column config). Admins inherit via existing admin/super_admin patterns in `lib/rbac.ts`.

**Rationale**: FR-013; keep separate from generic product edit if merchants must not change ROP.

**Alternatives considered**: Reuse `settings.manage` only — too broad for day-to-day purchasing.

## R10 — Country column

**Decision**: Leave **Country** blank in v1 (or optional free-text on `ProductOsfProfile` later). Do not parse titles in v1 (fragile).

**Rationale**: Spec marks Country as Gap; Principle V.

## R11 — Order qty formula

**Decision**: Per location: if ROP missing → blank / “-”; else `orderQty = ROP - stock` (negative shown as surplus, matching workbook spirit with parentheses for negatives if needed). Total / Common reorder = sum of location order qtys (or max(0, commonROP - commonStock) — document exact parity with sample sheet in tasks UAT). 70% label: No ROP | Stock above 70% ROP | Stock below 70% ROP.

**Rationale**: Spec FR-006; exact Excel formula quirks validated against sample file in implementation UAT.

## R12 — OGF Price meaning

**Decision**: **Do not map OGF to LWK.** Keep Excel behavior: OGF Price is a standalone number; OGF Margin = `(OGF Price − Latest Cost) / OGF Price`. In Cosmo, store optional `ogfPrice` on `ProductOsfProfile` (UI edit); blank when unset. LWK remains a normal stock/ROP location column only.

**Rationale**: User clarification 2026-07-16 — no LWK↔OGF matching; keep as in uploaded Excel.

**Alternatives considered**:
- OGF = LWK catalog price — rejected by user.
- Drop OGF columns — rejected (they exist on the Excel Main sheet).
