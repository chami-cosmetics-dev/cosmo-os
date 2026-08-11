# Research: Rider Performance Sync & Analytics

**Feature**: `038-rider-performance-sync`  
**Date**: 2026-08-11

## R1 — Completion parity (app vs link)

**Decision**: Treat both channels as completing `RiderDeliveryTask` (when present) + order `delivery_complete`. Align public link POST with mobile complete semantics for task fields (`completedAt`, clear failure). Set `deliveryCompleteById` to the task’s `riderId` when a task exists; if no task, complete order only (no invented rider credit) per clarification.

**Rationale**: Spec FR-001/002/013. Today’s public route updates tasks via `updateMany` but skips `deliveryCompleteById` / stage-entered helpers used on mobile—ops pages that key off tasks still work when a task exists, but attribution and parity are inconsistent.

**Alternatives considered**: Force-create a task on link complete (rejected—wrong rider risk); block link without task (rejected in clarify).

## R2 — Shipping rule import: upsert + skip blanks

**Decision**: Change `POST /api/admin/settings/rider-delivery-charges` from `deleteMany` + `createMany` to **upsert by `labelKey`**. Parser: rows with blank/invalid **Delivery Charges for riders** are **skipped** (not imported as 0); do not fail the whole upload solely because many islandwide labels lack rider charges. Keep labels omitted from file. Report `imported`, `skippedBlank`, `warnings`.

**Rationale**: Clarifications + sheet reality (~736 filled rider charges, ~2487 blank F with shipping amount filled). Current code full-replaces and errors rows missing rider amount—unsafe and fights product intent.

**Alternatives considered**: Full replace (current—rejected); blank→0 (rejected); blank→use Shipping Amount (rejected by product—“empty means riders don’t go”).

## R3 — Incentive source of truth

**Decision**: Keep `resolveRiderIncentiveFromRules` / `RiderDeliveryChargeRule.riderDeliveryCharge` matched by normalized shipping rule label. Do not use `Order.totalShipping` as pay. Unmatched → 0 + flag for admin UI.

**Rationale**: Spec FR-005/012; code already moved off totalShipping in 025/027 era resolve helpers. Incentive `0.00` in UI is primarily empty/mismatched rules + date TZ issues, not missing formula.

**Alternatives considered**: Persist per-task incentive snapshot at complete time (deferred—recompute from rules is simpler and matches “update sheet then totals change”).

## R4 — Admin performance dates & analytics

**Decision**: API accepts `YYYY-MM-DD` (and legacy ISO) resolved with `parseAppCalendarDayStart/End` (Asia/Colombo). Panel sends date-only. Extend response with: per-rider `unmatchedCount`, range `unmatchedTotal`, optional daily series for charts. UI: KPI cards + Recharts bar (completions/incentive by rider) + line/area (daily trend) + existing table with unmatched marker.

**Rationale**: Spec FR-008/009/012; `recharts` already in package.json; PR/local work already introduced Colombo helpers for performance.

**Alternatives considered**: Server-local `startOfDay` (broken for LK); new chart library (rejected—simplicity).

## R5 — Riders page open-task visibility

**Decision**: Client (and/or API) filter: for **assigned/accepted/arrived**, include all open tasks for the rider; for **completed/failed**, filter by Colombo day using `completedAt`/`failedAt`. Status summary cards follow the same rules. Location payment totals remain derived from completed tasks in the completed date scope (or completed rows shown)—document in contract so cash totals don’t mix open prior-day tasks.

**Rationale**: Clarification Q5; current panel uses `completedAt ?? failedAt ?? assignedAt` against today, which can hide or mis-bucket rows.

**Alternatives considered**: Strict date filter on all statuses (rejected).

## R6 — Schema / migration

**Decision**: No Prisma migration for v1.

**Rationale**: All needed fields exist. Behavior and API/UI changes only.

**Alternatives considered**: Snapshot incentive column on task (not needed for v1).

## R7 — Shared completion helper

**Decision**: Prefer extracting or reusing a single server helper (e.g. extend `lib/mark-order-delivered.ts` or add `completeRiderDeliveryTask`) called from mobile complete and public token confirm to avoid drift.

**Rationale**: Constitution V still allows a shared helper at third use-case; two channels already diverge.

**Alternatives considered**: Duplicate fixes in both routes (higher drift risk).
