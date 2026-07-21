# Research: SKU Supplier Compare

## R1 — Data source and allowlist

**Decision**: Reuse ERP **Purchase Receipt** lines via existing `lib/osf/erp-purchases.ts` Frappe query pattern (`Purchase Receipt` parent + `Purchase Receipt Item` child fields). Apply the same **company Supplier allowlist** (`buildSupplierAllowlist` / `isAllowedSupplier`) as OSF latest-cost. Multi-ERP companies merge per-instance results in application code (best-ever = min rate per supplier key; last purchase = newest `posting_date` per supplier key).

**Rationale**: Spec FR-007/FR-011; data already trusted for OSF; no new integration.

**Alternatives considered**: Cosmo `Supplier` table only (no prices) — rejected. Persist supplier stats in Prisma — rejected (v1 read-only, no sync job).

## R2 — Per-supplier aggregation shape

**Decision**: For one `item_code` (SKU), walk allowlisted receipt rows (newest-first pagination) and maintain a map keyed by `normalizeSupplierKey(supplier_name || supplier)`:

| Field | Rule |
|-------|------|
| `displayName` | `supplier_name` trim, else `supplier` |
| `bestEverRate` | Minimum positive `rate` seen for this supplier+SKU |
| `bestEverDate` | `posting_date` of the row that set (or tied) `bestEverRate`; if tie on rate, prefer **newer** date |
| `lastRate` | `rate` from the **newest** receipt row for this supplier+SKU |
| `lastDate` | `posting_date` of that newest row |
| `lastQty` | Optional qty on last receipt (display only) |

Unpriced suppliers (no positive rate ever) sort after priced suppliers.

**Rationale**: Implements clarified spec (best-ever rank + last purchase display + best-ever date).

**Alternatives considered**: Rank by last price only — rejected in clarify session. Store volume-weighted average — out of scope.

## R3 — ERP query scope for single SKU

**Decision**: **v1**: Paginate Purchase Receipts (same `MAX_PAGES` × `PAGE_LENGTH` cap as OSF) and filter rows in `accumulateSupplierPurchasesFromRows` where `item_code === sku`. Attempt optional Frappe child filter `[["Purchase Receipt Item", "item_code", "=", sku]]` on the list API; if ERP rejects the filter, fall back to unfiltered pagination (log once).

**Rationale**: Matches existing OSF purchase fetch; safe fallback. Single-SKU calculator call is infrequent vs full-catalog OSF generate.

**Alternatives considered**: Dedicated ERP report — not available without new ERP customization. Cache per-SKU in Redis — rejected (Principle V).

## R4 — Ranking and tags (pure helpers)

**Decision**: `lib/osf/supplier-compare.ts`:

- Sort: ascending `bestEverRate` (nulls last) → tie-break **newer `lastDate`** first → stable `displayName`.
- Labels: `Best Option 1`, `Option 2`, … (1-based index after sort).
- `isRecently(lastDate)`: inclusive window **30 calendar days** from server “today” (UTC date or company-local date — use same date helper as OSF `asOfDate` formatting).
- `isLastPurchasedFrom`: supplier with max `lastDate` across rows (single badge).

**Rationale**: Clarifications session; keeps UI logic testable without ERP mocks.

## R5 — API shape (lazy load)

**Decision**: New **`GET /api/admin/purchasing/sku-pricing/suppliers?sku=`** — auth `purchasing.tools.read`; returns ranked `suppliers[]` for exact SKU. **Do not** attach to search `?q=` responses (avoids ERP load on every debounced search).

Existing `GET /api/admin/purchasing/sku-pricing` unchanged for search + global `latestCost`.

**Rationale**: Performance pattern from workspace rules (avoid duplicate heavy fetches); calculator already has `selectItem` hook.

**Alternatives considered**: Extend search response with suppliers — rejected (N+1 ERP). WebSocket push — rejected.

## R6 — UI placement and margin isolation

**Decision**: Add **Supplier compare** section in `purchasing-sku-calculator.tsx` below purchase/cost block; fetch suppliers on `selectItem`. Rows are **not** clickable for cost override (display only). Show badges: option rank, Recently, Last purchased from. Loading + error states per spec edge cases.

**Rationale**: FR-012; single-page purchasing tools UX from `012-osf-purchasing-suite`.

## R7 — Validation

**Decision**: Zod: `sku` query param via existing `LIMITS.sku` + trim; response schema documented in contract. Vitest fixtures mirror `erp-purchases.test.ts` row shapes.

**Rationale**: Security-validation workspace rule.
