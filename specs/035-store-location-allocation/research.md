# Research: Store Location Allocation

**Feature**: `035-store-location-allocation` | **Date**: 2026-08-08

## R1 — Product home & permission

**Decision**: New page under `/dashboard/store/allocation` (or equivalent Store nav). New permission key `store.allocation.read` (name may be `store.support.allocate` if catalog prefers verb style — pick one and use consistently). Do **not** gate on `purchasing.osf.read` alone.

**Rationale**: Spec FR-010 wants store-support access; OSF purchasing permission would expose the wrong surface. No existing `store.*` keys; fulfillment keys are operationally adjacent but not ROP/allocation semantics.

**Alternatives considered**:
- Reuse `purchasing.osf.read` — rejected (opens OSF hub).
- Reuse fulfillment print/dispatch — rejected (no catalog/ROP meaning).

## R2 — Company reorder qty

**Decision**: Call `computeTotalOrderQtyForSkus` from `lib/osf/supplier-orders-reorder.ts` (same TOTAL ORDER QTY as OSF / supplier-orders).

**Rationale**: Clarification Q4; avoids duplicating stock/ROP math.

**Alternatives considered**: Sum of location ROPs only — rejected in clarify.

## R3 — Location set

**Decision**: `resolveOsfColumns(companyId).filter(c => c.active && c.includeInRop)`.

**Rationale**: Clarification Q3; matches purchasing ROP columns.

**Alternatives considered**: Shop-only filter; per-session pick list — rejected for v1.

## R4 — Allocation algorithm

**Decision**: Implement pure `allocateTakeQty({ takeQty, locations: [{ key, need, sales }] })` per confirmed Assumptions: `w = need * (1 + sales)`; proportional whole numbers; cap at need while others need; all-zero-need → sales-only / equal fallback.

**Rationale**: Clarification Q2; Vitest-first for remainder edge cases.

**Alternatives considered**: ROP-proportion-only; sales-only — rejected.

## R5 — Location sales (Cosmo, 30 days)

**Decision**: Aggregate order line units for the SKU where order matches OSF completed-sale rules (`delivery_complete` / `invoice_complete`, not cancelled) and date in last 30 days (Colombo), grouped by `Order.companyLocationId`. Map each `companyLocationId` to OSF columns via `OsfColumnConfig.companyLocationId`. Columns without a location id get `sales = 0` unless a documented warehouse→location mapping exists later.

**Rationale**: Clarification Q5; reuse `osfCompletedSalesOrderWhere` patterns from `lib/osf/assist-sales.ts`.

**Alternatives considered**: ERP POS sales — deferred. Company-wide same sales for all locations — rejected.

## R6 — Stock per location

**Decision**: For each ROP column, `stockForColumn(binMap, col.warehouses, sku)` after `fetchBinActualQty` for warehouses used by those columns (same as OSF generate / supplier-orders-reorder). Missing → 0 with UI showing 0/unknown.

**Rationale**: Spec edge cases; existing ERP stock helpers.

## R7 — Lookup by SKU / barcode

**Decision**: New `GET .../store-allocation/lookup?q=` — exact barcode match preferred; else SKU/title contains; company-scoped, non-archived; return sku, barcode, description, erp priorities, TOTAL ORDER QTY. Client treats Enter (scanner suffix) as submit.

**Rationale**: No existing barcode→item API; supplier-orders items search lacks barcode.

**Alternatives considered**: Extend supplier-orders items — wrong permission/audience.

## R8 — Export / print

**Decision**: `POST .../store-allocation/export` returns a simple xlsx (item + location + qty). UI also offers `window.print` on a printable summary. No zip, no ERP transfer.

**Rationale**: Clarification Q1; mirror outlet-reviews export / pick-list print simplicity.

**Alternatives considered**: Server-saved plans; ERP stock moves — out of scope v1.

## R9 — TOTAL ORDER QTY vs ROP-only columns

**Decision**: Document in UI that company need is TOTAL ORDER QTY (stock-column-based aggregate). Location table still lists all `includeInRop` columns; need uses that column’s ROP and its warehouse stock.

**Rationale**: Research found TOTAL ORDER QTY iterates stock columns; allocation locations are ROP columns — usually aligned keys; still compute need per ROP column independently.
