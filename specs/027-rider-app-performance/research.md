# Research: 027-rider-app-performance

## 1. Payday storage (one value for all companies)

**Decision:** Add a **database singleton** model `RiderPayPeriodConfig` with `paydayDayOfMonth Int?` (1–28 when set, null = unconfigured). No `companyId` — one row per database, shared by every company in that DB.

**Rationale:** Spec requires one payday for all companies, not per-company. Existing settings are usually company-scoped (`SmsPortalConfig`, etc.); a company-keyed field would fight “one for all.” A singleton matches the rule and stays simple.

**Alternatives considered:**
- Column on every `Company` row kept in sync — easy to drift; rejected.
- Per-rider payday — rejected by clarification.
- Generic key-value settings table — unnecessary new abstraction (constitution simplicity).

**Cross-deployment note:** Vault OS and Cosmo OS use separate databases (same schema). Each DB gets its own singleton after `db:deploy:all`. Ops should set the **same** day number on each deployment that riders use (mobile fans out to cosmetics + vault). Document in quickstart.

## 2. Pay-period date math

**Decision:** Shared helper `lib/rider-pay-period.ts`:
- Input: payday day-of-month `D` (1–28) + reference `Date` (“today” in app local TZ via existing `startOfDay` / `endOfDay` in `lib/mobile/dates.ts`).
- **Current period:** start = most recent calendar date with day `D` on or before today (startOfDay); end = day before next `D` (endOfDay).
- **Previous period:** the window immediately before current (previous `D` through day before current start).
- If `D` is null/unset → return `configured: false` (no invented window).

**Rationale:** Matches clarified rolling pay month; central helper keeps admin previews, mobile API, and unit tests aligned.

**Alternatives considered:** Client-only period math — rejected (ops and tests need one source of truth). UTC-midnight without local day helpers — rejected; reuse existing mobile date helpers.

## 3. Rider-facing performance API

**Decision:** New `GET /api/mobile/v1/me/performance?period=current|previous` (default `current`):
- Auth: existing `requireRiderMobileSession`; **only** `session.userId` data.
- Reuse `isIncentiveEligibleOrder` / `shippingIncentiveAmount` from `lib/rider-incentive.ts`.
- Completions: `RiderDeliveryTask` `status=completed`, `completedAt` in period, eligible order financial status.
- Failures: `status=failed`, `failedAt` in period (same rider).
- Response includes period bounds, counts, incentive total, optional today cue fields, and delivery lines (order label + incentive) for reconciliation.
- If payday unset → `200` with `paydayConfigured: false` and null totals (not a fake month).

**Rationale:** Mirrors cash-summary pattern (rider-scoped mobile endpoint). Avoids exposing admin performance list to riders.

**Alternatives considered:** Reuse admin `/api/admin/riders/performance` with rider token — wrong permission model. Client-only aggregation from completed list — incomplete for failures and void exclusions; rejected.

## 4. Multi-tenant mobile aggregation

**Decision:** Client fans out to each logged-in tenant (same pattern as cash/completed). For each tenant call performance API for the same `period` kind. **Sum** `completedCount`, `failedCount`, `incentiveTotal`, and merge line items (tag with tenant). Period window: use the first tenant that returns `paydayConfigured: true`; if tenants disagree on `D`, prefer primary tenant (`cosmetics`) and still sum lines inside that calendar window (ops should keep D identical).

**Rationale:** Spec allows active multi-company context without cross-rider leakage; identity is per-DB user id; fan-out is established.

## 5. Admin payday UI / API

**Decision:**
- `GET` + `PUT /api/admin/settings/rider-payday` with `requirePermission("settings.company")` (same gate as company settings sidebar).
- Body: `{ paydayDayOfMonth: number | null }` (null clears config).
- Surface control on existing Settings page (company settings area) — one field “Rider payday (day of month)”.
- Optionally include value in `settings/page-data` for fewer round-trips.

**Rationale:** Clarification chose ops/admin Cosmo OS settings; `settings.company` already gates company config UI.

**Alternatives considered:** `staff.write` only — weaker alignment with Settings IA. Hard-code D — rejected by clarification.

## 6. Mobile navigation / UX

**Decision:** Add fifth tab `performance` (“Pay” / “Performance”) in `app/(tabs)/_layout.tsx`. Compact today cue on `deliveries` (Route) linking to that tab. Completed list shows per-delivery incentive when `totalShipping` (or API `incentiveAmount`) is present.

**Rationale:** Spec requires dedicated tab distinct from Done/Cash/Profile; P3 cue on primary route screen.

**Alternatives considered:** Profile-only summary — rejected in clarify. Completed-only totals — rejected.

## 7. Incentive / failure eligibility (reuse 025)

**Decision:** No new incentive ledger. Same rules as admin dashboard: shipping sum on eligible completed tasks; voided/cancelled/refunded orders excluded via `isIncentiveEligibleOrder`. Failures never add incentive.

**Rationale:** FR-012 requires rider and ops agreement on the same completion set.

## 8. Testing approach

**Decision:** Unit-test pay-period boundaries and incentive/fail aggregations with Vitest (`lib/*.test.ts`). Extend mobile typecheck. Manual quickstart for tab + settings + multi-period switch.

**Rationale:** Constitution requires `npm test` + `mobile:typecheck` before merge.
