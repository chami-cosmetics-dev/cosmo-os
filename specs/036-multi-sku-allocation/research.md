# Research: Multi-SKU Location Allocation

**Feature**: 036-multi-sku-allocation  
**Date**: 2026-08-10

## R1 — Session state: client vs server drafts

**Decision**: Keep allocation session **entirely in React client state** (list items, take qtys, location qty maps, walkthrough index). No new DB tables.

**Rationale**: Spec Assumptions exclude durable multi-device drafts (same as 035). Client state matches current single-SKU panel patterns and avoids migrations.

**Alternatives considered**: `sessionStorage` soft persist — deferred (nice-to-have, not required). Server draft entity — rejected for v1 scope.

## R2 — Planning N SKUs: fan-out vs batch API

**Decision**: **Client fan-out** to existing `GET /api/admin/store-allocation/plan?sku=&takeQty=` per list item when take qty changes (debounce per SKU). Cap concurrency (e.g. 3) if needed. Add `POST /plan-batch` only if UAT shows unacceptable latency.

**Rationale**: Reuses proven plan route (ERP stock + sales + allocate). YAGNI on batch until measured. Spec max 50 items; typical waves are smaller.

**Alternatives considered**: Always batch endpoint — more code, same ERP cost. Server-side session — out of scope.

## R3 — Location walkthrough UX

**Decision**: Modal/`Sheet` (or dialog) **location step**: title = location label + “i / n”; body = table of list items (SKU, description, qty editable); **←/→** and on-screen Prev/Next move among **non-empty** locations only. Build sequence with pure `buildNonEmptyLocationSteps(items)`.

**Rationale**: Matches clarified packing flow; avoids all-SKUs×all-locations page. Skip zeros per Q3.

**Alternatives considered**: Full-page wizard routes — heavier. Accordion per SKU — rejected by clarify. Show empty locations — rejected (Q3 = A).

## R4 — Arrow-key focus rules

**Decision**: While focus is inside an `<input type="number">` (take qty or location qty), arrow keys adjust the input / move caret — **do not** change walkthrough step. When focus is on walkthrough chrome (dialog content without focused input, or after Esc), Left/Right change location step.

**Rationale**: Spec edge case; prevents accidental navigation while editing counts.

**Alternatives considered**: Always capture arrows — rejected (breaks numeric edit UX).

## R5 — Multi-item export shape

**Decision**: One `.xlsx` download: (1) **Summary** sheet — location-oriented rows (location, SKU, qty) for non-zero cells + optional location totals; (2) **Per-SKU** sections or sheets with identity + location qty list (extend `buildStoreAllocationWorkbookBuffer`). Server validates each item’s location qtys sum to its take qty; omit items with take qty 0.

**Rationale**: Spec FR-010/export acceptance; location-oriented summary aligns with walkthrough. Reuse `xlsx` stack from 035.

**Alternatives considered**: PDF-only — deferred; zip of many files — worse UX.

## R6 — Duplicate scan behavior

**Decision**: Match by **SKU** (canonical). If barcode resolves to an in-list SKU, focus that row + toast “already on list”; do not increment take qty automatically.

**Rationale**: Spec FR-002 / clarify; avoids silent qty inflation from double-scans.

**Alternatives considered**: Auto-increment take by 1 — rejected without explicit user request.

## R7 — Max session size

**Decision**: Hard cap **50** (`MAX_STORE_ALLOCATION_SESSION_ITEMS`) in client + export Zod `.max(50)` on items array.

**Rationale**: Spec Assumptions; keeps ERP fan-out bounded.

**Alternatives considered**: Unlimited — risk of timeouts; 20 — too tight for some waves.

## R8 — Sales lookback

**Decision**: Keep **90-day** Cosmo completed sales via existing `salesByOsfColumnLast90d` / `STORE_ALLOCATION_SALES_LOOKBACK_DAYS`.

**Rationale**: Spec FR-007; already in codebase after 035 follow-up.

**Alternatives considered**: Revert to 30d — rejected by product.

## Resolved clarifications

All spec clarifications (blank take qty, location walkthrough + arrows, skip zeros) are design inputs above — no remaining NEEDS CLARIFICATION for plan.
