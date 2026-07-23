# Research: Pending Waybill Queue

**Feature**: `021-pending-waybill-queue`  
**Date**: 2026-07-23

## R1 — Why operators believe “the older file is gone”

**Decision**: Treat the bug as **missing queue/history UX + unmapped rows**, not as a wholesale delete on import. Keep cumulative `OrderWaybill` upsert behavior (`ON CONFLICT (companyId, waybillNo)` latest wins). Surface **upload history** and a **pending list** so multi-file retention is visible.

**Rationale**: Current `POST /api/admin/waybills/import` already inserts a new `WaybillUpload` and upserts rows without deleting other company waybills. The UI only keeps the last import summary in React state and never lists prior uploads or a working queue—so a second upload feels like replacement. Import also always passes `orderId: null`, so nothing “maps to our orders” in the stored row.

**Alternatives considered**:
- Soft versioning (multiple rows per waybill number) — rejected (spec: latest wins; search uniqueness stays simple).
- Replace-all import mode — rejected (opposite of FR-001).
- Store original files in blob storage — rejected for v1 (row + history metadata is enough).

## R2 — Order mapping strategy

**Decision**: Extract shared `findOrderIdByInvoiceRef(companyId, invoiceInput)` from the candidate logic already in `findOrderWaybillsByInvoice` (match `Order.name`, `orderNumber`, `shopifyOrderId`, `erpnextInvoiceId` with `#` / whitespace normalization). Call it:
1. During import (and manual save) before `saveOrderWaybill`.
2. On rematch for rows with `orderId IS NULL`.

Display linked order using existing fulfillment primary reference helper (`resolveFulfillmentPrimaryOrderId` / related helpers in `lib/fulfillment-order-reference.ts`).

**Rationale**: Spec requires mapping consistent with existing lookup rules (FR-004). Duplicating SQL match variants would drift.

**Alternatives considered**:
- Match only on exact `invoiceNumber` string — rejected (lookup already normalizes `#` and candidates).
- Match only when searching, never persist `orderId` — rejected (pending filter needs durable join to `deliveryCompleteAt`).
- Fuzzy / partial invoice match — rejected (ambiguous; out of scope).

## R3 — Rematch timing

**Decision**: Rematch unmatched waybills in two places:
1. **After each import** for that upload’s rows (already have invoice numbers in memory).
2. **On pending page-data load**: rematch up to a capped batch of oldest unmatched rows for the company (e.g. 500), then return the list. Expose optional `POST /api/admin/waybills/rematch` for explicit “Re-check matches” if UI needs it; otherwise page-data rematch is enough for FR-005.

**Rationale**: Orders created after upload must link without re-upload. Cap prevents long page opens on large backlogs.

**Alternatives considered**:
- Cron-only rematch — rejected (overkill for v1; page-open is enough).
- Rematch entire table every request — rejected (performance risk vs SC-002).

## R4 — Pending definition and query

**Decision**: A waybill is **pending** when:
- `orderId IS NULL`, **or**
- linked `Order.deliveryCompleteAt IS NULL`.

Exclude when `orderId IS NOT NULL AND deliveryCompleteAt IS NOT NULL`. Do not hard-delete. Cancelled/returned orders remain pending unless marked delivery-complete (per spec assumptions).

Query shape: `OrderWaybill` LEFT JOIN `Order` LEFT JOIN `WaybillUpload`, company-scoped, ordered by `uploadedAt DESC NULLS LAST, createdAt DESC`, paginated.

**Schema**: Prefer no migration. If EXPLAIN shows seq scans on large tenants, add a supporting index via `db:migrate:create` (e.g. partial index on unmatched / or `(companyId, uploadedAt DESC)`—evaluate at implement time). Existing indexes already cover `companyId + createdAt` and `companyId + orderId`.

**Rationale**: Matches FR-006/007/008 with zero new entities.

**Alternatives considered**:
- Denormalized `isPending` flag on `OrderWaybill` — rejected (stale when delivery completes elsewhere).
- Derive pending only from courier file status columns — rejected (OS delivery-complete is source of truth).

## R5 — API surface

**Decision**:
- Keep `POST .../import` and search routes.
- Add `GET /api/admin/waybills/page-data` returning `{ pending, uploads, pagination, canImport, rematchSummary? }`.
- Optionally fold rematch into page-data; add dedicated rematch POST only if UI needs a button without reload semantics.

Auth: read permission for page-data/search; import permission for upload (unchanged keys).

**Rationale**: Performance rule prefers one aggregated page-data fetch over multiple client calls.

**Alternatives considered**:
- Separate pending + uploads endpoints — rejected (extra auth/DB round-trips).
- Server-only RSC fetch with no API — acceptable hybrid: page can pass `initialData` and client still uses page-data for refresh after import.

## R6 — UI placement

**Decision**: Enhance `components/organisms/fulfillment-pages/waybill-lookup.tsx` on existing `/dashboard/fulfillment/waybill-lookup`. Sections top-to-bottom: Upload (if permitted) → Upload history → Pending waybills → existing Search. Reuse details dialog pattern already used for search results (`rawPayload` entries).

**Rationale**: Spec assumption: no new sidebar module for v1; same permissions.

**Alternatives considered**:
- New “Pending Waybills” sidebar page — rejected for v1 scope.
- Hide search — rejected (FR-011; completed rows still need lookup).

## R7 — Permissions

**Decision**: Reuse `fulfillment.waybill_lookup.read` and `fulfillment.waybill_lookup.import`. No new RBAC keys.

**Rationale**: Spec FR-012; keeps Roles UI unchanged.

**Alternatives considered**:
- New `waybill_queue.manage` — rejected (YAGNI).

## R8 — Testing focus

**Decision**: Unit-test pure helpers: `normalizeInvoiceLookup` / candidates, `isPendingWaybill({ orderId, deliveryCompleteAt })`, rematch skip when already linked. Manual UAT for multi-upload retention and list filtering per quickstart.

**Rationale**: Constitution III + existing Vitest patterns; SQL integration tests optional.

**Alternatives considered**:
- Full Playwright suite — out of scope for this feature’s first ship.
