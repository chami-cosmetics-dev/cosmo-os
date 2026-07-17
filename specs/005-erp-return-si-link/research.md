# Research: ERP Return SI Link

**Feature**: `005-erp-return-si-link`  
**Date**: 2026-07-15

## R1 — Where to store Return SI on the original order

**Decision**: Add first-class `Order.erpReturnSalesInvoiceIds String[] @default([])`. Keep writing legacy `rawPayload.erpReturnSalesInvoiceNames` for one release if cheap, or migrate existing arrays into the new column and stop relying on rawPayload for search.

**Rationale**:
- Today `mergeErpReturnInvoiceNames` stores under `rawPayload`, but Shopify (and other) upserts can **replace** `rawPayload` with the full inbound payload and wipe custom keys → Return SI “missing” after later updates.
- Spec FR-003 needs reliable search; a dedicated array matches `User.couponCodes` / Prisma-native patterns and avoids JSON-path fragility.
- Supports multiple Return SIs (FR-002).

**Alternatives considered**:
- Search only via `rawPayload->erpReturnSalesInvoiceNames` (mer-code style) — rejected (overwrite risk; opaque contract).
- Separate `OrderErpDocument` table — rejected (overkill for string IDs; Principle V).
- Overwrite `erpnextInvoiceId` with Return SI — rejected (FR-006; original SI must remain).

## R2 — Writer path on credit note / return webhook

**Decision**: Centralize assignment in `applyErpCreditNoteToOriginalOrder` / reconcile: when `returnInvoiceName` is known, **always append** to `erpReturnSalesInvoiceIds`, including finance-reverted and rearrange skip-void early returns (record link without re-voiding).

**Rationale**: Spec edge case: protected orders skip auto-void but still need Return SI linkage for search/display.

**Alternatives considered**:
- Only store when void patch applied — rejected (leaves Revert/rearrange orders unsearchable by Return SI).
- Create a separate OS order for Return SI (`erp-{name}`) — rejected by spec assumption; prefer original order.

## R3 — Orders search behavior

**Decision**: Extend `lib/page-data/orders.ts` search `OR` with suffix/insensitive match on each `erpReturnSalesInvoiceIds` element (raw SQL `EXISTS` / `unnest` or Prisma filter that supports array contains + endsWith semantics consistent with `erpnextInvoiceId` endsWith).

**Rationale**: Staff paste full Return SI or last digits; must land on **original** order (FR-003, SC-002).

**Alternatives considered**:
- Exact match only — weaker UX vs existing SI search.
- Exact GIN `has` only — insufficient for suffix searches.

## R4 — Detail display

**Decision**: Expose `erpReturnSalesInvoiceIds` on order detail API and show a labeled **Return SI** / **Credit note SI** list distinct from original `erpnextInvoiceId` and Shopify name (invoice modal / order header).

**Rationale**: FR-004 / SC-003. Reuse existing ERP reference UI spots rather than a new page.

**Alternatives considered**: Badge on list row for every voided order — optional; detail is enough for P2.

## R5 — Historical recovery

**Decision**: Reuse ERP `return_against = original SI` list (already in `fetchErpCreditNotesAgainst` / `find-erp-return-si-mismatches`) to backfill `erpReturnSalesInvoiceIds` for voided/returned orders missing IDs. Bounded batch + optional single-order recovery (`settings.manage` or existing erp-migrations permission pattern).

**Rationale**: FR-007 / SC-004; Op-driven, not full-table automatic on deploy.

**Alternatives considered**:
- One-shot migrate only from rawPayload JSON — helpful first step but misses orders that never got rawPayload keys.
- Always auto-void on recovery — rejected (spec: do not invent void for active orders).

## R6 — Migration strategy

**Decision**:
1. `npm run db:migrate:create` adding `erpReturnSalesInvoiceIds` with default `{}`.
2. Optional data migration / backfill script: copy `rawPayload.erpReturnSalesInvoiceNames` → column where present.
3. `npm run db:deploy:all` after user confirmation.
4. Writers start populating column; search/detail read column (fallback read legacy JSON during transition if needed).

**Rationale**: Constitution I; zero downtime with default empty array.

## R7 — Cosmo vs Vault

**Decision**: Shared codebase behavior; no product-specific flags.

**Rationale**: Spec assumption; same Order + ERP webhook pipeline.
