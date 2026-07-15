# Research: Copy Review Contacts for Follow-up

**Feature**: `007-copy-review-contacts`  
**Date**: 2026-07-15

## R1 — Where “the list” lives

**Decision**: Operate on the client’s current `filteredOrders` in `MerchantReviewPanel` (search + status + merchant + date filters already applied). Include every matching row, including those not scrolled into view.

**Rationale**: Spec FR-002 requires the **current filtered Assigned Review Queue**. Filtering is already pure client-side over `queueOrders`; re-querying the server with filter params would duplicate logic and risk drift.

**Alternatives considered**:
- Server re-applies merchant/date/status filters — rejected for v1 (duplicates ~200–300 line sheet filter/rules; larger API).
- Only visible DOM rows — rejected (spec edge case: full filtered queue).

## R2 — Clipboard then persist (ordering)

**Decision**: (1) Build phone list from eligible filtered rows → (2) `await navigator.clipboard.writeText(...)` → (3) only on success, `POST` bulk mark-follow-up → (4) update local `queueOrders` + toast counts. On clipboard failure, toast error and skip API.

**Rationale**: Spec FR-009 — do not mark Follow up if numbers were never copied. Matches existing clipboard patterns (`failed-order-webhooks-panel`, invite link copy).

**Alternatives considered**:
- API first then copy — rejected (status would advance without a usable list if clipboard fails).
- Mark even when clipboard fails — rejected by FR-009.

## R3 — Which rows contribute phones vs status updates

**Decision**:
- **Clipboard candidates**: filtered orders with a non-empty trimmed `customerPhone` and `reviewStatus` in `{ pending, follow_up }`.
- **Status update candidates**: subset of clipboard candidates with `reviewStatus === "pending"` (server still enforces this).
- Already `follow_up`: include number on clipboard; do not treat as a new “mark” failure (idempotent stay).
- `reviewed` / `no_response`: never copied and never bulk-updated, even if visible under “All statuses”.

**Rationale**: Spec ties “contributed a number” to Follow up marking and excludes terminal outcomes (FR-004/005). Including Reviewed phones in the dialer list would re-dial finished work; excluding them keeps the list call-oriented.

**Alternatives considered**:
- Copy every phone in the filtered list regardless of status — rejected (pollutes dialer; conflicts with “contributed → Follow up”).
- Skip already `follow_up` phones on re-copy — rejected (re-copy is useful when continuing a calling session).

## R4 — Bulk API vs N× PUT

**Decision**: New `POST /api/admin/merchant-reviews/mark-follow-up` accepting `{ orderIds: string[] }` (CUID-validated, company-scoped, max batch ~500). Server upserts `MerchantOrderReview` to `follow_up` for eligible Pending rows (create row if missing; skip terminal statuses).

**Rationale**: Screenshot-scale queues (~295) make per-order PUTs slow and noisy (auth × N, audit × N). One round-trip meets SC-001. Reuses `MerchantOrderReview` fields; no migration.

**Alternatives considered**:
- Client loop over existing `PUT .../orders/[id]` — rejected (performance + partial-failure UX worse).
- `updateMany` only existing review rows — insufficient (many Pending orders have **no** review row yet; default Pending is implicit). Prefer upsert/create path like single save.
- Schema enum change — unnecessary; status is already string `"follow_up"`.

## R5 — Server authority & validation

**Decision**: Require `merchant_reviews.manage`. Validate each `orderId` with `cuidSchema`; load orders by `id in (...) AND companyId`; ignore unknown/foreign IDs (or count as failed/skipped). Do not trust client’s claim of “pending” or “has phone” for DB writes — re-check status from `MerchantOrderReview` (missing row = pending). Phone is not required server-side for the mark endpoint (client already gated clipboard); optional defense: only mark IDs the client sent after its eligibility pass.

**Rationale**: Workspace security rules — never trust client; same permission as single-order save.

**Alternatives considered**:
- Read-only copy without status change — deferred (spec default: combined action needs manage).
- Require phone non-null on server — nice-to-have; skip for v1 simplicity if client list is source of IDs.

## R6 — Partial failures & UX

**Decision**: API returns `{ copiedHint optional, updatedOrderIds, skipped: { alreadyFollowUp, terminalStatus, notFound }, failed? }`. UI toasts success/partial/error via `notify`. On partial update after clipboard success, warn that numbers were copied but N statuses failed (spec edge case). Use action-loading UX (`busyKey`, spinner “Copying…”, disable related controls).

**Rationale**: Matches action-loading + notify rules; FR-012 counts.

## R7 — Audit logging

**Decision**: Add audit action `merchant_review_bulk_follow_up` with summary count and `afterData: { updatedCount, orderIdsSample }` (cap sample size e.g. 20). Do not write one `merchant_review_saved` per order for bulk (noise/volume).

**Rationale**: Traceable bulk ops without 295 audit rows per click.

**Alternatives considered**:
- Per-order audit — rejected for volume at merchant scale.
- No audit — rejected (sensitive customer-contact workflow).

## R8 — Schema / migrations

**Decision**: No Prisma migration for this feature.

**Rationale**: `MerchantOrderReview.reviewStatus` already supports `follow_up`; Constitution I would only apply if we added columns.

## R9 — Testing focus

**Decision**: Unit-test pure helpers: build clipboard text (one number per line, order preserved as filtered list), classify candidates (eligible / skip missing phone / skip terminal), aggregate response counts. Manual UAT for clipboard permission + manage vs read-only.

**Rationale**: Clipboard and Auth0 hard to unit-test in Vitest; pure rules carry regression risk.
